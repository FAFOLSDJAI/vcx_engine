# 依赖说明

## 客户端主进程 (H:/CC_Agent)
```json
{
  "devDependencies": {
    "electron": "^28.2.0",
    "electron-builder": "^24.9.1",
    "concurrently": "^8.2.2",
    "@electron/rebuild": "^3.2.13"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.6.1",
    "socket.io-client": "^4.6.1",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@types/react": "^18.2.48",
    "@types/react-dom": "^18.2.18",
    "simple-peer": "^9.11.1"
  }
}
```

## 渲染进程 (client/renderer)
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "simple-peer": "^9.11.1",
    "socket.io-client": "^4.6.1"
  },
  "devDependencies": {
    "@types/react": "^18.2.48",
    "@types/react-dom": "^18.2.18",
    "@vitejs/plugin-react": "^4.2.1",
    "typescript": "^5.3.3",
    "vite": "^5.0.8"
  }
}
```

## 信令服务器 (server)
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.6.1",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}
```
