require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const noteRoutes = require('./routes/notes');
const giftRoutes = require('./routes/gifts');
const userRoutes = require('./routes/user');
const BobbyEngine = require('./services/bobbyEngine');
const startJobs = require('./jobs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ===== 中间件 =====
app.use(cors());
app.use(express.json());
app.use(express.static('../src')); // 前端静态文件

// 限流
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分钟
  max: 60,
  message: { error: '请求太频繁，请稍后再试' }
});
app.use('/api/', limiter);

// ===== 数据库 =====
connectDB();

// ===== Socket.io =====
io.on('connection', (socket) => {
  console.log(`用户连接: ${socket.id}`);

  // 认证中间件
  socket.on('auth', (token) => {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.join(`user_${decoded.userId}`);
      console.log(`用户认证: ${decoded.userId}`);
    } catch (e) {
      socket.disconnect();
    }
  });

  socket.on('disconnect', () => {
    console.log(`用户断开: ${socket.id}`);
  });
});

// 把 io 实例挂到 app 上，供路由使用
app.set('io', io);

// ===== 路由 =====
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/gifts', giftRoutes);
app.use('/api/user', userRoutes);

// ===== Bobby 引擎 =====
const bobbyEngine = new BobbyEngine(io);
app.set('bobbyEngine', bobbyEngine);

// ===== 定时任务 =====
startJobs(bobbyEngine, io);

// ===== 健康检查 =====
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ===== 启动 =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Bobby 后端运行在端口 ${PORT}`);
});

module.exports = { app, server, io };
