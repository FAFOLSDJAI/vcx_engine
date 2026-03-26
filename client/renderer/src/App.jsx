import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';

// 简单的房间/用户标识（实际项目可改为登录系统）
const ROOM_ID = 'default-room';
const USER_ID = `user-${Math.floor(Math.random() * 10000)}`;

function App() {
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]); // [{userId, muted}]
  const [isAdmin, setIsAdmin] = useState(false);
  const socketRef = useRef(null);
  const peersRef = useRef({}); // 存放 RTCPeerConnection 对象
  const localStreamRef = useRef(null);
  const [channels, setChannels] = useState([]); // [{channelId, type}]
  const [newChannelId, setNewChannelId] = useState('');
  const [newChannelType, setNewChannelType] = useState('text');
  // 初始化 socket 连接并加入房间
  useEffect(() => {
    const socket = io(); // 默认连接到当前服务器
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('已连接到信令服务器', socket.id);
      socket.emit('join-room', ROOM_ID, USER_ID);
    });

    // 接收完整的房间用户列表（包括 mute 状态）
    socket.on('room-users', users => {
      setOnlineUsers(users);
      // 第一个加入的用户视为管理员（或自行在 admin.json 中配置）
      const admin = users[0] && users[0].userId === USER_ID;
      setIsAdmin(admin);
    });

    // 文字聊天消息
    socket.on('chat-message', (userId, message) => {
      setMessages(prev => [...prev, { userId, message }]);
    });

    // 用户加入/离开通知（更新列表）
    socket.on('user-connected', data => {
      const { userId, muted } = data;
      setOnlineUsers(prev => [...prev, { userId, muted }]);
    });
    socket.on('user-disconnected', userId => {
      setOnlineUsers(prev => prev.filter(u => u.userId !== userId));
    });

    // 用户禁言状态更新
    socket.on('user-muted', (targetUserId, muted) => {
      setOnlineUsers(prev => prev.map(u => (u.userId === targetUserId ? { ...u, muted } : u)));
    });

    // 被踢出房间
    socket.on('kicked', roomId => {
      if (roomId === ROOM_ID) {
        alert('您已被踢出房间');
        // 关闭 UI 或返回主页面，这里直接刷新页面
        window.location.reload();
      }
    });

    // 错误提示
    socket.on('error-message', msg => {
      alert(msg);
    });

    // 信令事件用于建立 WebRTC 连接
    socket.on('signal', async (fromUserId, signalData) => {
      if (fromUserId === USER_ID) return; // 忽略自身信令
      const peer = getOrCreatePeer(fromUserId, false);
      if (signalData.sdp) {
        await peer.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
        if (signalData.sdp.type === 'offer') {
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          socket.emit('signal', ROOM_ID, USER_ID, { sdp: peer.localDescription });
        }
      } else if (signalData.candidate) {
        await peer.addIceCandidate(new RTCIceCandidate(signalData.candidate));
      }
    });

    // 请求房间内已有用户列表并主动发起连接（已在 server 返回 room-users）
    socket.emit('get-room-users', ROOM_ID, users => {
      users.forEach(u => {
        const id = u.userId;
        if (id !== USER_ID) {
          const peer = getOrCreatePeer(id, true);
          // 创建 offer
          peer.createOffer().then(offer => {
            peer.setLocalDescription(offer).then(() => {
              socket.emit('signal', ROOM_ID, USER_ID, { sdp: peer.localDescription });
            });
          });
        }
      });
    });

    // 清理 socket
    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 创建或获取 PeerConnection
  const getOrCreatePeer = (peerId, isInitiator) => {
    if (peersRef.current[peerId]) return peersRef.current[peerId];
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    // 处理 ICE 候选
    pc.onicecandidate = event => {
      if (event.candidate) {
        socketRef.current.emit('signal', ROOM_ID, USER_ID, { candidate: event.candidate });
      }
    };
    // 处理远端媒体流
    pc.ontrack = event => {
      const remoteAudio = document.createElement('audio');
      remoteAudio.srcObject = event.streams[0];
      remoteAudio.autoplay = true;
      document.body.appendChild(remoteAudio);
    };
    // 若已有本地媒体流，添加轨道
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current));
    }
    peersRef.current[peerId] = pc;
    return pc;
  };

  // 开始语音（获取麦克风并添加到所有 peer）
  const startVoice = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      // 为已有的每个 peer 添加轨道
      Object.values(peersRef.current).forEach(pc => {
        stream.getTracks().forEach(track => pc.addTrack(track, stream));
      });
    } catch (err) {
      console.error('获取麦克风失败', err);
    }
  };

  const sendMessage = () => {
    if (input.trim() && socketRef.current) {
      socketRef.current.emit('chat-message', ROOM_ID, USER_ID, input.trim());
      setMessages(prev => [...prev, { userId: USER_ID, message: input.trim() }]);
      setInput('');
    }
  };

  // 管理员操作：禁言、解除禁言、踢出
  const adminAction = (action, targetUserId) => {
    if (!socketRef.current) return;
    socketRef.current.emit('admin-action', ROOM_ID, action, targetUserId);
  };

  // 模拟加载
  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  // 监听频道及管理员分配事件
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const handleChannelCreated = (channelId, type) => {
      setChannels(prev => [...prev, { channelId, type }]);
    };
    const handleAdminAssigned = (adminUserId) => {
      if (adminUserId === USER_ID) setIsAdmin(true);
    };
    socket.on('channel-created', handleChannelCreated);
    socket.on('admin-assigned', handleAdminAssigned);
    // 可根据需求添加 channel-joined、channel-left 等处理
    return () => {
      socket.off('channel-created', handleChannelCreated);
      socket.off('admin-assigned', handleAdminAssigned);
    };
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>加载中...</p>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="sidebar">
        <div className="server-list">
          <button className="server-icon home">🏠</button>
          <button className="server-icon">🎮</button>
          <button className="server-icon">🎵</button>
        </div>
        <div className="user-status">
          <div className="user-avatar">👤</div>
        </div>
      </div>

      <div className="server-content">
        <div className="channel-list">
          <div className="channel-category">
            <h3>文字频道</h3>
            <div className="channel-item"># 一般</div>
            <div className="channel-item"># 随便聊</div>
          </div>
          <div className="channel-category">
            <h3>语音频道</h3>
            <div className="channel-item voice-channel">
              🔊 语音聊天
              <span className="channel-status">{onlineUsers.length} 人在线</span>
            </div>
          </div>
        </div>

        <div className="channel-management">
          <h3>频道管理</h3>
          <input type="text" placeholder="频道 ID" value={newChannelId} onChange={e=>setNewChannelId(e.target.value)} />
          <select value={newChannelType} onChange={e=>setNewChannelType(e.target.value)}>
            <option value="text">文字</option>
            <option value="voice">语音</option>
          </select>
          <button onClick={() => {
            if (socketRef.current) {
              socketRef.current.emit('admin-action', ROOM_ID, 'create-channel', null, { channelId: newChannelId, type: newChannelType });
            }
          }}>创建频道</button>
          <div className="existing-channels">
            <h4>已创建频道</h4>
            {channels.map(ch => (
              <div key={ch.channelId} className="channel-item">
                {ch.channelId} ({ch.type})
                <button onClick={() => {
                  if (socketRef.current) {
                    socketRef.current.emit('admin-action', ROOM_ID, 'join-channel', null, { channelId: ch.channelId });
                  }
                }} style={{ marginLeft: '8px' }}>加入</button>
              </div>
            ))}
          </div>
        </div>

        <div className="chat-area">
          <div className="chat-header">
            <h2># 一般</h2>
          </div>
          <div className="messages">
            {messages.map((msg, idx) => (
              <div className="message" key={idx}>
                <div className="message-author">{msg.userId}</div>
                <div className="message-content">{msg.message}</div>
                {isAdmin && msg.userId !== USER_ID && (
                  <div className="admin-controls" style={{ marginTop: '4px' }}>
                    <button onClick={() => adminAction('mute', msg.userId)} style={{ marginRight: '4px' }}>🔇 禁言</button>
                    <button onClick={() => adminAction('unmute', msg.userId)} style={{ marginRight: '4px' }}>🔊 解除禁言</button>
                    <button onClick={() => adminAction('kick', msg.userId)} style={{ marginRight: '4px' }}>⛔ 踢出</button>
                    <button onClick={() => adminAction('assign-admin', msg.userId)} style={{ marginRight: '4px' }}>🛡️ 授予管理员</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="message-input">
            <input type="text" placeholder="输入消息..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} disabled={onlineUsers.find(u => u.userId===USER_ID && u.muted)} />
            <button onClick={sendMessage} disabled={onlineUsers.find(u => u.userId===USER_ID && u.muted)}>发送</button>
          </div>
        </div>
      </div>

      <div className="voice-users">
        <div className="voice-header">
          <h3>🔊 语音聊天</h3>
          <div className="voice-controls">
            <button className="mic-btn" onClick={startVoice}>🎤 开启麦克风</button>
            <button className="headphone-btn">🎧</button>
          </div>
        </div>
        <div className="voice-user-list">
          {onlineUsers.map(u => (
            <div className="voice-user" key={u.userId}>
              <span>👤 {u.userId} {u.muted ? '(已禁言)' : ''}</span>
              {isAdmin && u.userId !== USER_ID && (
                <div className="admin-voice-controls" style={{ marginLeft: '8px' }}>
                  <button onClick={() => adminAction('mute', u.userId)} style={{ marginRight: '4px' }}>🔇 禁言</button>
                  <button onClick={() => adminAction('unmute', u.userId)} style={{ marginRight: '4px' }}>🔊 解除禁言</button>
                  <button onClick={() => adminAction('kick', u.userId)} style={{ marginRight: '4px' }}>⛔ 踢出</button>
                  <button onClick={() => adminAction('assign-admin', u.userId)} style={{ marginRight: '4px' }}>🛡️ 授予管理员</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
