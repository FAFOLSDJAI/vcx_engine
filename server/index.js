const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ---------- 持久化与管理员配置 ----------
const DATA_DIR = path.join(__dirname, '..', 'data');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');

// 加载全局管理员列表（可在 admin.json 中手动添加）
let adminConfig = { admins: [] };
try {
  adminConfig = JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'));
} catch (e) {
  // 保持默认空列表并写回文件
  fs.writeFileSync(ADMIN_FILE, JSON.stringify(adminConfig, null, 2));
}

// 加载持久化房间信息（包括用户、禁言、管理员、频道）
let persistedRooms = {};
try {
  persistedRooms = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'));
} catch (e) {
  persistedRooms = {};
  fs.writeFileSync(ROOMS_FILE, JSON.stringify(persistedRooms, null, 2));
}

// 内存中维护的房间结构：Map<roomId, {users:Set, admins:Set, channels:Map}>
const rooms = new Map();
Object.entries(persistedRooms).forEach(([roomId, data]) => {
  const roomObj = {
    users: new Set(), // {socketId,userId,muted}
    admins: new Set(data.admins || []),
    channels: new Map() // channelId -> {type:'text'|'voice', participants:Set<userId>}
  };
  // 恢复用户列表（socketId 为 null，因为服务器刚重启）
  (data.users || []).forEach(u => {
    roomObj.users.add({ socketId: null, userId: u.userId, muted: !!u.muted });
  });
  // 恢复已创建的频道（如果有的话）
  (data.channels || []).forEach(ch => {
    const chSet = new Set(ch.participants || []);
    roomObj.channels.set(ch.channelId, { type: ch.type, participants: chSet });
  });
  rooms.set(roomId, roomObj);
});

// 辅助函数：保存当前 rooms 状态到磁盘（仅保存必要字段）
function saveRooms() {
  const toSave = {};
  rooms.forEach((roomObj, roomId) => {
    toSave[roomId] = {
      users: Array.from(roomObj.users).map(u => ({ userId: u.userId, muted: !!u.muted })),
      admins: Array.from(roomObj.admins),
      channels: Array.from(roomObj.channels.entries()).map(([chId, ch]) => ({
        channelId: chId,
        type: ch.type,
        participants: Array.from(ch.participants)
      }))
    };
  });
  fs.writeFileSync(ROOMS_FILE, JSON.stringify(toSave, null, 2));
}

io.on('connection', (socket) => {
  console.log('新用户连接:', socket.id);

  // 加入房间
  socket.on('join-room', (roomId, userId) => {
    console.log(`用户 ${userId} 加入房间 ${roomId}`);

    // 初始化房间结构（如果不存在）
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        users: new Set(),
        admins: new Set(),
        channels: new Map()
      });
    }
    const roomObj = rooms.get(roomId);
    // 将用户加入房间用户集合，记录 socketId
    const userObj = { socketId: socket.id, userId, muted: false };
    roomObj.users.add(userObj);
    // 第一个加入的用户自动成为房间管理员（若当前没有管理员）
    if (roomObj.admins.size === 0) {
      roomObj.admins.add(userId);
    }
    saveRooms();

    socket.join(roomId);
    // 通知其他用户（带 mute 状态）
    socket.broadcast.to(roomId).emit('user-connected', { userId, muted: false });
    // 同步当前在线用户列表（包括 mute 状态）
    const online = Array.from(roomObj.users).map(u => ({ userId: u.userId, muted: u.muted }));
    socket.emit('room-users', online);

    // 断开连接时清理
    socket.on('disconnect', () => {
      console.log(`用户 ${userId} 断开连接`);
      const set = roomObj.users;
      if (set) {
        for (let member of set) {
          if (member.socketId === socket.id) {
            set.delete(member);
            break;
          }
        }
        // 若该用户是管理员，移除其管理员权限
        if (roomObj.admins.has(userId)) {
          roomObj.admins.delete(userId);
        }
        if (set.size === 0) {
          rooms.delete(roomId);
        }
        saveRooms();
      }
      socket.broadcast.to(roomId).emit('user-disconnected', userId);
    });
  });

  // 信令消息转发（用于WebRTC）
  socket.on('signal', (roomId, userId, signalData) => {
    socket.to(roomId).emit('signal', userId, signalData);
  });

  // 文本消息（检查是否被禁言）
  socket.on('chat-message', (roomId, userId, message) => {
    // 查找用户是否被 mute
    const roomObj = rooms.get(roomId);
    const member = roomObj && Array.from(roomObj.users).find(u => u.userId === userId);
    if (member && member.muted) {
      // 不转发，同时可选返回提示
      socket.emit('error-message', '您已被禁言，无法发送消息');
      return;
    }
    socket.to(roomId).emit('chat-message', userId, message);
  });

  // 管理员操作：mute、unmute、kick、assign-admin、create-channel、join-channel、leave-channel
  socket.on('admin-action', (roomId, action, targetUserId, extra) => {
    const roomObj = rooms.get(roomId);
    if (!roomObj) return;
    // 找到请求者对象
    const requester = Array.from(roomObj.users).find(u => u.socketId === socket.id);
    const isAdmin = requester && roomObj.admins.has(requester.userId);
    if (!isAdmin) {
      socket.emit('error-message', '您没有管理员权限');
      return;
    }
    const target = Array.from(roomObj.users).find(u => u.userId === targetUserId);
    switch (action) {
      case 'mute':
        if (target) {
          target.muted = true;
          io.to(roomId).emit('user-muted', targetUserId, true);
        }
        break;
      case 'unmute':
        if (target) {
          target.muted = false;
          io.to(roomId).emit('user-muted', targetUserId, false);
        }
        break;
      case 'kick':
        if (target && target.socketId) {
          io.sockets.sockets.get(target.socketId)?.emit('kicked', roomId);
          io.sockets.sockets.get(target.socketId)?.disconnect(true);
        }
        if (target) {
          roomObj.users.delete(target);
          io.to(roomId).emit('user-kicked', targetUserId);
        }
        break;
      case 'assign-admin':
        // 将目标用户加入管理员集合
        if (target) {
          roomObj.admins.add(targetUserId);
          io.to(roomId).emit('admin-assigned', targetUserId);
        }
        break;
      case 'create-channel':
        // extra: {channelId, type}
        if (extra && extra.channelId && extra.type) {
          if (!roomObj.channels.has(extra.channelId)) {
            roomObj.channels.set(extra.channelId, { type: extra.type, participants: new Set() });
            io.to(roomId).emit('channel-created', extra.channelId, extra.type);
          }
        }
        break;
      case 'join-channel':
        // extra: channelId
        if (extra && extra.channelId) {
          const ch = roomObj.channels.get(extra.channelId);
          if (ch) {
            ch.participants.add(requester.userId);
            io.to(roomId).emit('channel-joined', extra.channelId, requester.userId);
          }
        }
        break;
      case 'leave-channel':
        if (extra && extra.channelId) {
          const ch = roomObj.channels.get(extra.channelId);
          if (ch) {
            ch.participants.delete(requester.userId);
            io.to(roomId).emit('channel-left', extra.channelId, requester.userId);
          }
        }
        break;
      default:
        break;
    }
    saveRooms();
  });

  // 获取房间用户列表（包括 mute 状态）
  socket.on('get-room-users', (roomId, callback) => {
    const roomObj = rooms.get(roomId);
    if (roomObj) {
      const list = Array.from(roomObj.users).map(u => ({ userId: u.userId, muted: u.muted }));
      callback(list);
    } else {
      callback([]);
    }
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`✅ 信令服务器运行在端口 ${PORT}`);
});
