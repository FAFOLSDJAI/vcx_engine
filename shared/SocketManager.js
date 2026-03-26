// Socket.IO 客户端封装
class SocketManager {
  constructor(serverUrl = 'http://localhost:3001') {
    this.serverUrl = serverUrl;
    this.socket = null;
    this.connected = false;
    this.roomId = null;
  }

  // 连接到服务器
  connect() {
    return new Promise((resolve, reject) => {
      const io = require('socket.io-client');
      this.socket = io(this.serverUrl, {
        transports: ['websocket', 'polling']
      });

      this.socket.on('connect', () => {
        console.log('✅ 已连接到信令服务器');
        this.connected = true;
        resolve(this.socket);
      });

      this.socket.on('connect_error', (error) => {
        console.error('❌ 连接失败:', error);
        reject(error);
      });

      this.socket.on('disconnect', () => {
        console.log('已断开连接');
        this.connected = false;
        this.onDisconnect?.();
      });
    });
  }

  // 加入房间
  joinRoom(roomId, userId) {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('未连接到服务器'));
        return;
      }

      this.roomId = roomId;
      this.socket.emit('join-room', roomId, userId);

      this.socket.on('user-connected', (userId) => {
        console.log(`用户已连接: ${userId}`);
        this.onUserConnected?.(userId);
      });

      this.socket.on('user-disconnected', (userId) => {
        console.log(`用户已断开: ${userId}`);
        this.onUserDisconnected?.(userId);
      });

      this.socket.on('signal', (userId, signalData) => {
        console.log(`收到 ${userId} 的信令数据`);
        this.onSignal?.(userId, signalData);
      });

      this.socket.on('chat-message', (userId, message) => {
        console.log(`收到 ${userId} 的消息:`, message);
        this.onChatMessage?.(userId, message);
      });

      resolve();
    });
  }

  // 离开房间
  leaveRoom() {
    if (this.roomId) {
      this.socket.emit('leave-room', this.roomId);
      this.roomId = null;
    }
  }

  // 发送信令数据
  sendSignal(signalData) {
    if (this.roomId) {
      this.socket.emit('signal', this.roomId, signalData);
    }
  }

  // 发送聊天消息
  sendChatMessage(message) {
    if (this.roomId) {
      this.socket.emit('chat-message', this.roomId, message);
    }
  }

  // 获取房间用户列表
  getRoomUsers(callback) {
    if (this.roomId) {
      this.socket.emit('get-room-users', this.roomId, callback);
    }
  }

  // 关闭连接
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.connected = false;
      this.socket = null;
    }
  }

  // 回调设置
  setOnUserConnected(callback) {
    this.onUserConnected = callback;
  }

  setOnUserDisconnected(callback) {
    this.onUserDisconnected = callback;
  }

  setOnSignal(callback) {
    this.onSignal = callback;
  }

  setOnChatMessage(callback) {
    this.onChatMessage = callback;
  }

  setOnDisconnect(callback) {
    this.onDisconnect = callback;
  }
}

module.exports = SocketManager;
