// WebRTC 工具类
class WebRTCManager {
  constructor(socket) {
    this.socket = socket;
    this.peers = new Map(); // roomId -> Peer
    this.streams = new Map(); // peerId -> MediaStream
  }

  // 初始化本地媒体流
  async initLocalStream(constraints = {
    audio: true,
    video: false
  }) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return stream;
    } catch (error) {
      console.error('获取媒体流失败:', error);
      throw error;
    }
  }

  // 创建新的 Peer 连接
  createPeer(roomId, initiator = false, stream = null) {
    const Peer = require('simple-peer');

    const peer = new Peer({
      initiator,
      trickle: true,
      stream: stream || null
    });

    // 连接建立成功
    peer.on('connect', () => {
      console.log(`Peer 连接已建立: ${roomId}`);
    });

    // 收到数据
    peer.on('data', (data) => {
      console.log('收到数据:', data.toString());
    });

    // 收到流
    peer.on('stream', (remoteStream) => {
      console.log('收到远程流:', remoteStream);
      this.streams.set(roomId, remoteStream);
      this.onRemoteStream?.(roomId, remoteStream);
    });

    // 信令数据
    peer.on('signal', (signalData) => {
      console.log('发送信令数据:', signalData);
      this.socket.emit('signal', roomId, signalData);
    });

    // 错误处理
    peer.on('error', (err) => {
      console.error('Peer 错误:', err);
    });

    // 连接关闭
    peer.on('close', () => {
      console.log('Peer 连接关闭');
      this.peers.delete(roomId);
    });

    this.peers.set(roomId, peer);
    return peer;
  }

  // 处理收到的信令数据
  handleSignal(roomId, signalData) {
    const peer = this.peers.get(roomId);
    if (peer) {
      peer.signal(signalData);
    }
  }

  // 发送消息
  sendMessage(roomId, message) {
    const peer = this.peers.get(roomId);
    if (peer && peer.connected) {
      peer.send(message);
    }
  }

  // 关闭指定房间的连接
  closePeer(roomId) {
    const peer = this.peers.get(roomId);
    if (peer) {
      peer.destroy();
      this.peers.delete(roomId);
    }
  }

  // 关闭所有连接
  closeAll() {
    this.peers.forEach((peer, roomId) => {
      peer.destroy();
    });
    this.peers.clear();
    this.streams.clear();
  }

  // 静音/取消静音
  toggleMute(roomId, muted) {
    const peer = this.peers.get(roomId);
    if (peer && peer.stream) {
      const audioTracks = peer.stream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !muted;
      });
    }
  }

  // 获取所有活跃的 Peer
  getActivePeers() {
    return Array.from(this.peers.keys());
  }

  // 回调设置
  setOnRemoteStream(callback) {
    this.onRemoteStream = callback;
  }

  setOnClose(callback) {
    this.onClose = callback;
  }
}

module.exports = WebRTCManager;
