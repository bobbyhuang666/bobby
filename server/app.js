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
const { BobbySDKAdapter } = require('./bridge/BobbySDKAdapter');

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

// 暴露共享配置给前端（bobbyDefaults.js 同时兼容 CommonJS 和浏览器）
app.get('/bobbyDefaults.js', (req, res) => {
  res.type('application/javascript').sendFile(require('path').join(__dirname, 'config', 'bobbyDefaults.js'));
});

// 限流
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分钟
  max: 60,
  message: { error: '请求太频繁，请稍后再试' }
});
app.use('/api/', limiter);

// ===== Socket.io =====
// 已认证用户连接计数（限制同一用户最多2个连接）
const userConnectionCount = new Map();

io.on('connection', (socket) => {
  console.log(`用户连接: ${socket.id}`);

  // 认证频率限制：每个 socket 每分钟最多5次 auth 请求
  let authAttempts = 0;
  let authResetTimer = null;

  // 认证中间件
  socket.on('auth', async (token) => {
    // 频率限制
    if (authAttempts >= 5) {
      socket.emit('auth_error', { error: '认证请求过于频繁' });
      return;
    }
    authAttempts++;
    if (!authResetTimer) {
      authResetTimer = setTimeout(() => {
        authAttempts = 0;
        authResetTimer = null;
      }, 60 * 1000);
    }

    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 同一用户连接数限制（最多2个并发连接）
      const currentCount = userConnectionCount.get(decoded.userId) || 0;
      if (currentCount >= 2) {
        socket.emit('auth_error', { error: '连接数已达上限' });
        socket.disconnect();
        return;
      }

      // 验证用户是否实际存在（防止已删除账号使用旧 token）
      const User = require('./models/User');
      const user = await User.findById(decoded.userId).select('_id').lean();
      if (!user) {
        socket.emit('auth_error', { error: '用户不存在' });
        socket.disconnect();
        return;
      }

      socket.userId = decoded.userId;
      userConnectionCount.set(decoded.userId, currentCount + 1);
      socket.join(`user_${decoded.userId}`);
      console.log(`用户认证: ${decoded.userId}`);
    } catch (e) {
      socket.disconnect();
    }
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      const count = userConnectionCount.get(socket.userId) || 1;
      if (count <= 1) {
        userConnectionCount.delete(socket.userId);
      } else {
        userConnectionCount.set(socket.userId, count - 1);
      }
    }
    if (authResetTimer) {
      clearTimeout(authResetTimer);
    }
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

// 天气 API（供前端"此刻"卡片使用）
app.get('/api/weather', async (req, res) => {
  try {
    const { getXiamenWeather } = require('./modules/weather');
    const weather = await getXiamenWeather();
    res.json(weather || { temp: '?', description: '未知' });
  } catch (err) {
    res.json({ temp: '?', description: '未知' });
  }
});

// Bobby 世界事件流（最近的生活片段）
app.get('/api/world-events', async (req, res) => {
  try {
    const BobbyState = require('./models/BobbyState');
    const state = await BobbyState.findOne({ _singleton: 'bobby' })
      .select('worldEvents socialState')
      .lean();
    const events = (state?.worldEvents || [])
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 15);
    res.json({ events });
  } catch (err) {
    res.json({ events: [] });
  }
});

// V2: Bobby 共享世界状态（你和 Bobby 生活在同一个世界）
app.get('/api/shared-world', async (req, res) => {
  try {
    const BobbyState = require('./models/BobbyState');
    const { getXiamenWeather } = require('./modules/weather');

    const [state, weather] = await Promise.all([
      BobbyState.findOne({ _singleton: 'bobby' }).select('currentStatus socialState npcRelationships worldEvents').lean(),
      getXiamenWeather().catch(() => null),
    ]);

    // V2: 使用动态 closeness，来自 npcRelationships 持久化数据
    const { FRIENDS } = require('./modules/social');
    const relMap = new Map();
    (state?.npcRelationships || []).forEach(r => relMap.set(r.friendId, r));

    const friends = FRIENDS.map(f => {
      const rel = relMap.get(f.id);
      const closeness = rel ? rel.closeness : f.closeness;
      const label = closeness >= 0.7 ? '亲近' : closeness >= 0.4 ? '普通' : '疏远';
      return {
        id: f.id,
        name: f.name,
        relation: f.relation,
        closeness: Math.round(closeness * 100),
        closenessLabel: label,
        interactionCount: rel ? rel.interactionCount : 0,
      };
    });

    const recentSocial = (state?.socialState?.recentEvents || [])
      .slice(-5)
      .map(e => ({ friendName: e.friendName, content: e.content, time: e.time }));

    // V2: NPC 自主行为（从世界事件流中提取 npc_autonomous 类型）
    const npcEvents = (state?.worldEvents || [])
      .filter(e => e.type === 'npc_autonomous')
      .slice(-5)
      .map(e => ({ content: e.content, time: e.time }));

    res.json({
      weather: weather || { temp: '?', description: '未知' },
      bobbyStatus: state?.currentStatus || '未知',
      friends,
      recentSocial,
      npcEvents,
    });
  } catch (err) {
    res.json({ weather: { temp: '?', description: '未知' }, bobbyStatus: '未知', friends: [], recentSocial: [] });
  }
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

  // SDK 适配层（Character SDK 驱动的多智能体世界模拟）
  let sdkAdapter = null;
  try {
    sdkAdapter = new BobbySDKAdapter();
    bobbyEngine.setSDKAdapter(sdkAdapter);
    // SDK 初始化：恢复持久化状态或创建新角色
    const BobbyState = require('./models/BobbyState');
    const bobbyState = await BobbyState.findOne({ _singleton: 'bobby' });
    await sdkAdapter.init({
      bobbyState,
      savedState: bobbyState?.andyWorldState || null,
    });
    // 用 SDK 状态同步 Bobby
    const sdkStatus = sdkAdapter.getBobbyStatus();
    if (sdkStatus && bobbyState && sdkStatus !== bobbyState.currentStatus) {
      bobbyState.currentStatus = sdkStatus;
      bobbyState.statusChangedAt = new Date();
      await bobbyState.save();
    }
    console.log('Bobby SDK 适配层已初始化');
  } catch (err) {
    console.error('SDK 初始化失败，使用 Bobby 自有状态机:', err.message);
    sdkAdapter = null;
  }

  // 世界引擎（SDK 未启用时的降级方案）
  if (!sdkAdapter) {
    await WorldEngine.init();
    console.log('世界引擎已初始化（降级模式）');
  } else {
    console.log('世界引擎由 SDK 接管，旧 worldEngine 跳过');
  }

  // 定时任务（依赖 bobbyEngine 初始化完成）
  startJobs(bobbyEngine, io, sdkAdapter);

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
