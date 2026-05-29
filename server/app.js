require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// ===== 启动环境变量检查 =====
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET', 'DEEPSEEK_API_KEY'];
const missing = REQUIRED_ENV.filter(key => !process.env[key]);
if (missing.length > 0) {
  console.error(`缺少必需的环境变量: ${missing.join(', ')}`);
  console.error('请在 .env 文件中配置这些变量，参考 .env.example');
  process.exit(1);
}

const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const noteRoutes = require('./routes/notes');
const giftRoutes = require('./routes/gifts');
const userRoutes = require('./routes/user');
const BobbyEngine = require('./services/bobbyEngine');
const startJobs = require('./jobs');
const { BobbyMemoryService } = require('./services/bobbyMemory');
const { WorldEngine } = require('./services/worldEngine');
const { AndyBridge } = require('./bridge/andyBridge');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? process.env.ALLOWED_ORIGIN || 'https://yourdomain.com'
      : ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST']
  }
});

// ===== 中间件 =====
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.ALLOWED_ORIGIN || 'https://yourdomain.com'
    : ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000']
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.static(require('path').join(__dirname, '..', 'src'))); // 前端静态文件

// 限流
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分钟
  max: 60,
  message: { error: '请求太频繁，请稍后再试' }
});
app.use('/api/', limiter);

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

// ===== 健康检查 =====
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ===== 启动（异步初始化）=====
async function start() {
  // 先连接数据库
  await connectDB();

  // Bobby 引擎（需要数据库连接后初始化）
  const bobbyEngine = new BobbyEngine(io);
  await bobbyEngine.init();
  app.set('bobbyEngine', bobbyEngine);

  // Bobby 自我记忆库（用于丰富回复内容）
  await BobbyMemoryService.init();
  console.log('Bobby 记忆库已初始化');

  // Andy 引擎（心理学驱动的多智能体世界模拟）
  let andyBridge = null;
  try {
    andyBridge = new AndyBridge();
    bobbyEngine.setAndyBridge(andyBridge);
    // Andy 初始化在 setAndyBridge 后由 BobbyEngine.init() 内部完成
    // 但因为 init() 已经跑完了，这里需要手动初始化
    const BobbyState = require('./models/BobbyState');
    const bobbyState = await BobbyState.findOne({ _singleton: 'bobby' });
    await andyBridge.init({
      bobbyState,
      savedState: bobbyState?.andyWorldState || null,
    });
    // 用 Andy 的状态同步 Bobby
    const andyStatus = andyBridge.getBobbyStatus();
    if (andyStatus && bobbyState && andyStatus !== bobbyState.currentStatus) {
      bobbyState.currentStatus = andyStatus;
      bobbyState.statusChangedAt = new Date();
      await bobbyState.save();
    }
    console.log('Andy 世界引擎已初始化');
  } catch (err) {
    console.error('Andy 初始化失败，使用 Bobby 自有状态机:', err.message);
    andyBridge = null;
  }

  // 世界引擎（Andy 未启用时的降级方案）
  if (!andyBridge) {
    await WorldEngine.init();
    console.log('世界引擎已初始化（降级模式）');
  } else {
    console.log('世界引擎由 Andy 接管，旧 worldEngine 跳过');
  }

  // 定时任务（依赖 bobbyEngine 初始化完成）
  startJobs(bobbyEngine, io, andyBridge);

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Bobby 后端运行在端口 ${PORT}`);
  });
}

start().catch(err => {
  console.error('启动失败:', err);
  process.exit(1);
});

module.exports = { app, server, io };
