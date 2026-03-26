# 语音聊天应用

一个类似 Discord/Kook 的语音通讯软件，采用去中心化 WebRTC 架构。

## 技术栈

- **客户端**: Electron + React + TypeScript
- **信令服务器**: Node.js + Socket.IO + Express
- **实时通讯**: WebRTC (Simple-Peer)
- **样式**: CSS3 (仿 Discord 暗色主题)

## 项目结构

```
H:/CC_Agent/
├── client/              # Electron客户端
│   ├── main/           # 主进程
│   ├── renderer/       # 渲染进程（React前端）
│   └── preload/        # 预加载脚本
├── server/             # 信令服务器
├── shared/             # 共享类型和工具
├── ARCHITECTURE.md     # 架构设计文档
└── PLAN.md            # 实施计划
```

## 快速开始

### 安装依赖

1. 安装客户端依赖
```bash
cd client/renderer
npm install
```

2. 安装服务器依赖
```bash
cd server
npm install
```

3. 安装主应用依赖
```bash
cd H:/CC_Agent
npm install
```

### 运行项目

1. 启动信令服务器
```bash
cd server
npm start
```

2. 启动客户端开发服务器
```bash
cd client/renderer
npm run dev
```

3. 启动 Electron 应用
```bash
cd H:/CC_Agent
npm run dev:client
```

或者使用 `concurrently` 同时启动：
```bash
npm run dev
```

## 核心功能

### 已完成
- ✅ 项目基础架构搭建
- ✅ Electron 主进程配置
- ✅ React 渲染进程配置
- ✅ 信令服务器框架
- ✅ 基础 UI 界面（仿 Discord）

### 待实现
- ⏳ 用户注册/登录系统
- ⏳ WebRTC 语音通话
- ⏳ 文本聊天功能
- ⏳ 服务器/频道管理
- ⏳ 用户状态和好友系统
- ⏳ 音频采集和播放
- ⏳ 静音/取消静音控制

## 架构说明

### 去中心化通信

本应用采用 **WebRTC** 实现点对点音视频传输：
- 音频数据直接在用户间传输，不经过服务器
- 信令服务器仅用于协助建立连接（SDP 交换、ICE 候选者）
- 支持一对一和多人语音房间

### 信令流程

1. 用户 A 创建房间并生成 Offer SDP
2. 信令服务器转发 Offer 给用户 B
3. 用户 B 收到 Offer 后生成 Answer SDP
4. 信令服务器转发 Answer 给用户 A
5. ICE 候选者交换完成
6. WebRTC P2P 连接建立，开始音视频传输

## 开发路线

详细实施计划请参考 [PLAN.md](./PLAN.md)

## 注意事项

- 当前为原型阶段，尚未实现完整的用户认证
- 生产环境需要添加加密和安全措施
- WebRTC 需要 STUN/TURN 服务器支持内网穿透

## 许可证

MIT
