// ============================================
// Bobby - AI陪伴生命体
// ============================================

// ===== 后端 API 配置（所有 AI 调用走后端代理）=====
const API_BASE = window.location.origin + '/api';

// HTML 转义，防止 XSS 注入
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== 后端 API 工具函数 =====

// 带认证的 API 请求（自动重试一次 401）
async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (state.authToken) {
    headers['Authorization'] = `Bearer ${state.authToken}`;
  }
  let res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    // Token 过期，重新游客登录后重试一次
    await guestLogin();
    headers['Authorization'] = `Bearer ${state.authToken}`;
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (res.status === 401) {
      throw new Error('认证失败，请刷新页面');
    }
  }
  return res;
}

// 同步 Bobby 的本地消息到后端（保持对话上下文连贯）
function syncBobbyMessage(content) {
  apiFetch('/chat/sync-bobby-message', {
    method: 'POST',
    body: JSON.stringify({ content })
  }).catch(() => {}); // 静默失败，不影响用户体验
}

// 游客自动登录
async function guestLogin() {
  try {
    const res = await fetch(`${API_BASE}/auth/guest`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const data = await res.json();
    if (data.token) {
      state.authToken = data.token;
      localStorage.setItem('bobby_token', data.token);
      if (data.user) {
        state.intimacy = data.user.intimacy || 0;
      }
    }
  } catch (e) {
    console.error('游客登录失败:', e);
  }
}

// 初始化认证（恢复 token 或自动登录）
async function initAuth() {
  const saved = localStorage.getItem('bobby_token');
  if (saved) {
    state.authToken = saved;
    // 验证 token 是否有效
    try {
      const res = await fetch(`${API_BASE}/user/profile`, {
        headers: { 'Authorization': `Bearer ${saved}` }
      });
      if (!res.ok) throw new Error('token invalid');
      const data = await res.json();
      if (data.user) {
        state.intimacy = data.user.intimacy || state.intimacy;
      }
    } catch (e) {
      // Token 无效，重新登录
      await guestLogin();
    }
  } else {
    await guestLogin();
  }
}

// 通过后端发送聊天消息（所有 AI 逻辑走后端）
async function callBobbyBackend(userText) {
  try {
    const res = await apiFetch('/chat/send', {
      method: 'POST',
      body: JSON.stringify({ text: userText })
    });

    if (!res.ok) throw new Error(`API error: ${res.status}`);

    const data = await res.json();

    // 同步后端返回的好感度
    if (data.intimacyLevel && data.intimacyLevel.value !== undefined) {
      state.intimacy = Math.max(state.intimacy, data.intimacyLevel.value);
    }

    const fullReply = data.reply?.content || '嗯';
    return fullReply;
  } catch (error) {
    console.error('后端 API error:', error);
    const isNightTime = isNight();
    const fallback = isNightTime
      ? ['嗯', '...', '在', '嗯嗯', '困了', '外面好安静', '风好大', '在发呆', '还没睡', '月亮挺亮的']
      : ['嗯', '在忙', '刚看到', '好', '嗯嗯', '刚下课', '在吃饭', '等下说'];
    return fallback[Math.floor(Math.random() * fallback.length)];
  }
}


// ===== 智能滚动：用户在底部时才自动滚，往上翻时不打扰 =====
let chatScrollLocked = true; // 是否锁定在底部（初始锁定）

function initChatScrollWatcher() {
  if (!dom.chatArea) return;
  dom.chatArea.addEventListener('scroll', () => {
    const { scrollTop, scrollHeight, clientHeight } = dom.chatArea;
    // 距底部 80px 以内视为"在底部"
    chatScrollLocked = (scrollHeight - scrollTop - clientHeight) < 80;
  });
}

function autoScrollChat() {
  if (!chatScrollLocked) return; // 用户在看旧消息，不打扰
  dom.chatArea.scrollTop = dom.chatArea.scrollHeight;
}

// ===== 数据 =====
const DATA = {
  // 深夜回复 - 简短、有温度、像一个真实的深夜在线的人
  nightReplies: [
    '嗯', '在', '还没睡', '睡不着吗',
    '外面好安静', '嗯...', '知道了',
    '有点困了', '今天有点累', '在发呆',
    '...你怎么也没睡', '风好大',
    '嗯，我在', '别想太多', '会好的',
    '我也是', '月亮挺亮的', '刚洗完澡',
    '困了但不想睡', '在听歌',
    '今天过得还好吗', '嗯，有点冷',
    '窗户上有雾气', '在看天花板'
  ],

  // 白天回复 - 更简短、像在"忙"、偶尔回多一点
  dayReplies: [
    '嗯', '在忙', '等下说', '刚看到',
    '怎么了', '好', '嗯知道了',
    '刚下课', '困', '在吃饭',
    '嗯嗯', '好晚才看到'
  ],

  // 动态 - 初始为空，启动时从后端加载
  notes: [],

  // 礼物 - 好的和倒霉的混在一起
  gifts: [
    { id: 'coffee', emoji: '☕', name: '咖啡', price: 100, type: 'good' },
    { id: 'medicine', emoji: '💊', name: '感冒药', price: 200, type: 'good' },
    { id: 'taxi', emoji: '🚕', name: '打车券', price: 500, type: 'good' },
    { id: 'book', emoji: '📖', name: '一本书', price: 300, type: 'good' },
    { id: 'blanket', emoji: '🧸', name: '毯子', price: 150, type: 'good' },
    { id: 'food', emoji: '🍜', name: '宵夜', price: 250, type: 'good' },
    { id: 'luckbox', emoji: '📦', name: '神秘包裹', price: 188, type: 'random' },
    { id: 'banana', emoji: '🍌', name: '香蕉', price: 50, type: 'bad' },
    { id: 'alarm', emoji: '⏰', name: '十个闹钟', price: 88, type: 'bad' },
    { id: 'homework', emoji: '📝', name: '一套卷子', price: 66, type: 'bad' },
    { id: 'rain', emoji: '🌧️', name: '求雨符', price: 99, type: 'bad' },
    { id: 'rock', emoji: '🪨', name: '一块石头', price: 10, type: 'bad' }
  ],

  // 礼物效果 - 好的和倒霉的
  giftEffects: {
    coffee: '嗯...好像清醒了一点',
    medicine: '鼻子通了，终于',
    taxi: '到了。不用挤地铁了',
    book: '在看一本新的，还不错',
    blanket: '暖和了，好困',
    food: '饱了。谢谢...不知道该谢谁',
    luckbox: '......这是什么',
    banana: '踩到了。滑了一跤',
    alarm: '......谁放的。吵死了',
    homework: '......写不完。太多了',
    rain: '......下雨了。没带伞',
    rock: '......谁放的石头。踢到脚了'
  },

  // 倒霉礼物的后续反应
  badLuckReactions: {
    banana: [
      '...裤子脏了',
      '刚洗的衣服...',
      '今天果然不宜出门'
    ],
    alarm: [
      '响了十个。人都傻了',
      '耳朵还在嗡嗡响',
      '再也不想听到闹钟了'
    ],
    homework: [
      '写到一半睡着了',
      '题目太难了...',
      '笔都写没水了'
    ],
    rain: [
      '全身湿透了',
      '鞋子里面全是水',
      '感冒了...'
    ],
    rock: [
      '脚趾头疼',
      '走路一瘸一拐的',
      '新鞋也踢坏了'
    ]
  },

  // 神秘包裹随机效果
  luckboxEffects: [
    { type: 'good', status: '捡到钱了。今天运气不错', msg: '嗯？地上有钱...' },
    { type: 'good', status: '收到一张明信片。不知道谁寄的', msg: '有张明信片...' },
    { type: 'bad', status: '打开是空的...', msg: '...空的' },
    { type: 'bad', status: '里面是一只蟑螂', msg: '......' },
    { type: 'good', status: '是一颗糖。还不错', msg: '嗯...甜的' }
  ],

  // 标语
  taglines: [
    '和你平行存在',
    '有自己的生活节奏',
    '平行存在的数字生命',
    '生活在平行世界的一座小岛'
  ],
  // 状态 → 情绪色调映射
  // warm=愉悦  calm=平静  low=低落  busy=忙碌  off=下线/睡觉
  moodTones: {
    'warm':  ['在听歌', '刚下班', '到家了', '在做饭', '做好了', '在看剧', '看完了', '在看手机', '刚醒', '在便利店', '在回家路上'],
    'calm':  ['在发呆', '在看窗外', '在图书馆', '在休息', '洗完了', '在吹头发', '下课了', '在吃饭', '吃完了晚饭', '在洗碗', '在收拾'],
    'low':   ['困了但睡不着', '快睡了', '有点累', '有点困', '在走神', '在洗漱'],
    'busy':  ['在上课', '在打工', '在食堂', '刚出门', '在食堂'],
    'off':   ['睡了', '离线', '还没睡呢'],
  },
};

// 根据状态获取情绪分类
function getMoodTone(statusText) {
  for (const [tone, statuses] of Object.entries(DATA.moodTones)) {
    if (statuses.includes(statusText)) return tone;
  }
  return 'calm'; // 默认
}

// ===== 状态 =====
const state = {
  currentPage: 'chatPage',
  messages: [],
  msgId: 0,
  statusText: '还没睡呢',
  isOnline: true,
  isOnboarded: false,
  visitCount: 0,
  lastTopic: '',    // 最近聊的话题
  userMood: '',     // 用户当前情绪
  giftReceived: [], // 收到的礼物
  intimacy: 0,      // 好感度 (0-100)
  lastWhisper: 0,   // 上次主动消息时间
  whisperCount: 0,  // 今天主动消息次数
  unreadMsgIds: [], // 所有未读用户消息 ID
  isProcessing: false, // Bobby 正在处理消息
  batchTimer: null,   // 消息批量计时器
  unreadBobbyReplies: 0, // 未读 Bobby 评论回复数
  authToken: null,   // 后端 JWT token
  moodTone: 'calm',  // 当前情绪色调
  giftEffectUntil: 0, // 礼物效果保护窗口截止时间戳
  bobbyValence: 0,   // Bobby 情绪正负值（服务端推送）
  bobbyArousal: 0.5  // Bobby 情绪唤醒度（服务端推送）
};

// ===== DOM =====
const $ = id => document.getElementById(id);
const dom = {
  particles: $('particles'),
  onboarding: $('onboarding'),
  onboardingBtn: $('onboardingBtn'),
  msgList: $('msgList'),
  inputBox: $('inputBox'),
  sendBtn: $('sendBtn'),
  typing: $('typing'),
  chatArea: $('chatArea'),
  chatStatus: $('chatStatus'),
  notesList: $('notesList'),
  profileNotes: $('profileNotes'),
  profileTagline: $('profileTagline'),
  moodDot: $('moodDot'),
  moodText: $('moodText'),
  giftGrid: $('giftGrid'),
  giftPanel: $('giftPanel'),
  giftSuccess: $('giftSuccess'),
  giftSuccessEmoji: $('giftSuccessEmoji'),
  toast: $('toast')
};

// ===== 粒子系统 =====
let particlesResizeHandler = null;

function initParticles() {
  const canvas = dom.particles;
  const ctx = canvas.getContext('2d');
  let w, h, particles = [];

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function createParticle() {
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      size: Math.random() * 1.5 + 0.5,
      speedX: (Math.random() - 0.5) * 0.15,
      speedY: -Math.random() * 0.2 - 0.05,
      opacity: Math.random() * 0.3 + 0.05,
      pulse: Math.random() * Math.PI * 2
    };
  }

  function init() {
    resize();
    particles = Array.from({ length: 40 }, createParticle);
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    particles.forEach(p => {
      p.x += p.speedX;
      p.y += p.speedY;
      p.pulse += 0.02;

      const alpha = p.opacity * (0.5 + 0.5 * Math.sin(p.pulse));

      if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(212, 165, 116, ${alpha})`;
      ctx.fill();
    });
  }

  // 清理旧的 resize 监听（防止重复绑定）
  if (particlesResizeHandler) {
    window.removeEventListener('resize', particlesResizeHandler);
  }
  particlesResizeHandler = resize;
  window.addEventListener('resize', resize);

  // 页面不可见时暂停动画，节省电量
  let paused = false;
  let animId = null;

  function drawLoop() {
    if (paused) return;
    draw();
    animId = requestAnimationFrame(drawLoop);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      paused = true;
      if (animId) cancelAnimationFrame(animId);
    } else {
      paused = false;
      drawLoop();
    }
  });

  init();
  drawLoop();
}

// ===== 记忆系统 =====
function loadMemory() {
  const memory = localStorage.getItem('bobby_memory');
  if (memory) {
    try {
      const m = JSON.parse(memory);
      state.visitCount = (m.visitCount || 0) + 1;
      state.lastTopic = m.lastTopic || '';
      state.userMood = m.userMood || '';
      state.giftReceived = m.giftReceived || [];
      state.intimacy = m.intimacy || 0;
      state.lastWhisper = m.lastWhisper || 0;
      state.whisperCount = m.whisperCount || 0;
    } catch(e) { console.warn('记忆数据解析失败:', e.message); }
  } else {
    state.visitCount = 1;
  }
}

function saveMemory() {
  localStorage.setItem('bobby_memory', JSON.stringify({
    visitCount: state.visitCount,
    lastTopic: state.lastTopic,
    userMood: state.userMood,
    giftReceived: state.giftReceived,
    intimacy: state.intimacy,
    lastWhisper: state.lastWhisper,
    whisperCount: state.whisperCount
  }));
}

function updateMemory(userText) {
  // 更新话题
  if (userText.length > 2) {
    state.lastTopic = userText.slice(0, 20);
  }
  // 更新情绪（使用共享配置中的关键词）
  const mk = window.BOBBY_DEFAULTS?.moodKeywords;
  if (mk) {
    for (const [mood, regex] of Object.entries(mk)) {
      if (regex.test(userText)) { state.userMood = mood; break; }
    }
  } else {
    // fallback: bobbyDefaults.js 未加载时的兜底
    if (/累|疲|辛苦/.test(userText)) state.userMood = 'tired';
    else if (/难过|伤心|哭|烦/.test(userText)) state.userMood = 'sad';
    else if (/开心|高兴|哈哈/.test(userText)) state.userMood = 'happy';
    else if (/睡不着|失眠/.test(userText)) state.userMood = 'insomnia';
  }

  // 好感度由后端权威计算，前端只同步不自行增加
  saveMemory();
}

// ===== 好感度系统 =====
function addIntimacy(points) {
  const oldLevel = getIntimacyLevel();
  state.intimacy = Math.max(0, Math.min(100, state.intimacy + points));
  const newLevel = getIntimacyLevel();

  // 关系升级了！
  if (newLevel.name !== oldLevel.name) {
    showRelationshipUpgrade(newLevel);
  }
  saveMemory();
}

// 好感度等级（从 bobbyDefaults.js 共享配置读取，单一数据源）
function getIntimacyLevel() {
  const i = state.intimacy;
  const levels = window.BOBBY_DEFAULTS?.intimacyLevels;
  if (levels) {
    for (let j = levels.length - 1; j >= 0; j--) {
      if (i >= levels[j].threshold) {
        return { name: levels[j].name, desc: levels[j].desc, emoji: '·' };
      }
    }
    return { name: levels[0].name, desc: levels[0].desc, emoji: '·' };
  }
  // fallback: bobbyDefaults.js 未加载时的兜底
  if (i < 10) return { name: '陌生', desc: '你们还不太熟', emoji: '·' };
  if (i < 25) return { name: '认识', desc: '算是在网上见过', emoji: '·' };
  if (i < 45) return { name: '熟悉', desc: '有一种安静的默契', emoji: '·' };
  if (i < 70) return { name: '默契', desc: '不需要说太多', emoji: '·' };
  return { name: '信赖', desc: '你是它的深夜知己', emoji: '·' };
}

function showRelationshipUpgrade(level) {
  // 关系变化通过系统 UI 提示，不通过 Bobby 的嘴巴说出来
  setTimeout(() => {
    addThought(`...关系好像变了`);
    setTimeout(() => {
      showToast(`${level.name} · ${level.desc}`);
    }, 1500);
  }, 3000);

  // 更新主页标语
  const milestoneTaglines = {
    '认识': '算是在网上见过',
    '熟悉': '有一种安静的默契',
    '默契': '不需要说太多',
    '信赖': '你是它的深夜知己'
  };
  if (milestoneTaglines[level.name]) {
    DATA.taglines.unshift(milestoneTaglines[level.name]);
  }
}

// ===== 低语系统（Bobby 主动消息）=====
function checkWhisper() {
  const now = Date.now();
  const isNightNow = isNight();

  // 每天最多主动发2条
  const today = new Date().toDateString();
  const lastWhisperDate = state.lastWhisper ? new Date(state.lastWhisper).toDateString() : '';
  if (lastWhisperDate !== today) {
    state.whisperCount = 0;
  }

  if (state.whisperCount >= 2) return;

  // 距离上次主动消息至少30分钟
  const fc = window.BOBBY_DEFAULTS?.frontend;
  if (now - state.lastWhisper < (fc?.whisperCooldownMs ?? 30 * 60 * 1000)) return;

  // 深夜概率更高
  const chance = isNightNow ? (fc?.whisperChanceNight ?? 0.08) : (fc?.whisperChanceDay ?? 0.03);
  if (Math.random() > chance) return;

  // 只在聊天页面且用户静默时触发
  if (state.currentPage !== 'chatPage') return;

  // 50% 概率发碎碎念（自言自语），50% 概率发低语（对你说话）
  // 其中有 15% 概率发照片，10% 概率发语音
  const roll = Math.random();
  const isPhoto = roll < 0.075;
  const isVoice = roll >= 0.075 && roll < 0.125;
  const isMutter = roll >= 0.5;

  if (isPhoto) {
    // Bobby 发送"照片"
    const photos = isNightNow ? [
      { scene: '🌙', caption: '月亮挺亮的' },
      { scene: '🌧️', caption: '窗户上全是水痕' },
      { scene: '🐱', caption: '它又来了' },
      { scene: '💡', caption: '路灯下面有只蛾子' },
      { scene: '☁️', caption: '云走得很快' }
    ] : [
      { scene: '☀️', caption: '今天的阳光' },
      { scene: '🌿', caption: '阳台上的小草' },
      { scene: '🏪', caption: '便利店阿姨在打瞌睡' },
      { scene: '🌳', caption: '树叶在晃' }
    ];
    const photo = photos[Math.floor(Math.random() * photos.length)];
    setTimeout(() => {
      if (state.currentPage === 'chatPage') {
        addPhotoMessage(photo.scene, photo.caption);
      }
    }, 3000 + Math.random() * 5000);

  } else if (isVoice) {
    // Bobby 发送"语音"
    const voiceMsgs = isNightNow ? [
      '嗯...还没睡',
      '困了',
      '外面好安静啊',
      '在听歌'
    ] : [
      '嗯',
      '刚下课',
      '在吃饭',
      '困'
    ];
    const msg = voiceMsgs[Math.floor(Math.random() * voiceMsgs.length)];
    setTimeout(() => {
      if (state.currentPage === 'chatPage') {
        addVoiceMessage(msg);
      }
    }, 3000 + Math.random() * 5000);

  } else if (isMutter) {
    // 碎碎念 - Bobby 的自言自语，不是对你说的
    // 根据情绪状态选择碎碎念内容
    const wp = window.BOBBY_DEFAULTS?.whisperPools;
    const valence = state.bobbyValence || 0;
    let mutters;
    if (valence < -0.15 && wp?.mutterNegative) {
      mutters = isNightNow ? wp.mutterNegative.night : wp.mutterNegative.day;
    } else if (valence > 0.2 && wp?.mutterPositive) {
      mutters = isNightNow ? wp.mutterPositive.night : wp.mutterPositive.day;
    } else {
      mutters = isNightNow ? [
        '下雨了', '风好大', '路灯灭了', '月亮挺亮的', '隔壁灯也灭了',
        '猫又来了', '好困...', '窗户上有雾气', '外面好安静'
      ] : [
        '今天阳光不错', '树叶在晃', '有点饿了', '困', '风好大'
      ];
    }
    const msg = mutters[Math.floor(Math.random() * mutters.length)];

    setTimeout(() => {
      if (state.currentPage === 'chatPage') {
        addThought(msg);
      }
    }, 3000 + Math.random() * 5000);

  } else {
    // 低语 - Bobby 主动跟你说话
    // 根据情绪状态选择低语内容
    const wp = window.BOBBY_DEFAULTS?.whisperPools;
    const valence = state.bobbyValence || 0;
    let whispers;
    if (valence < -0.15 && wp?.negative) {
      whispers = isNightNow ? wp.negative.night : wp.negative.day;
    } else if (valence > 0.2 && wp?.positive) {
      whispers = isNightNow ? wp.positive.night : wp.positive.day;
    } else {
      whispers = isNightNow ? [
        '还没睡？', '...在吗', '嗯...', '困了', '嗯'
      ] : [
        '嗯', '困', '好热', '风好大', '好潮'
      ];
    }
    const msg = whispers[Math.floor(Math.random() * whispers.length)];

    setTimeout(() => {
      if (state.currentPage === 'chatPage') {
        addThought('...');
        setTimeout(() => addMessage(msg, false), 2000);
      }
    }, 5000);
  }

  state.lastWhisper = now;
  state.whisperCount++;
  saveMemory();
}

// ===== 引导页 =====
function initOnboarding() {
  const visited = localStorage.getItem('bobby_visited');
  if (visited) {
    dom.onboarding.classList.add('hidden');
    state.isOnboarded = true;
    startApp();
    return;
  }

  // 引导页粒子
  initOnboardingParticles();

  // 节奏适中，不急不慢
  const steps = ['step1', 'step2', 'step3', 'step4', 'step5'];
  steps.forEach((id, i) => {
    setTimeout(() => {
      $(id).classList.add('show');
    }, 600 + i * 700);
  });

  setTimeout(() => {
    dom.onboardingBtn.classList.add('show');
  }, 600 + steps.length * 700 + 300);
}

let onboardingAnimRunning = false;
let onboardingResizeHandler = null;
let onboardingAnimId = null;

function initOnboardingParticles() {
  const canvas = $('onboardingParticles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w, h, particles = [];
  onboardingAnimRunning = true;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function createParticle() {
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      size: Math.random() * 2 + 0.5,
      speedX: (Math.random() - 0.5) * 0.2,
      speedY: -Math.random() * 0.3 - 0.1,
      opacity: Math.random() * 0.4 + 0.1,
      pulse: Math.random() * Math.PI * 2
    };
  }

  resize();
  particles = Array.from({ length: 60 }, createParticle);

  function draw() {
    if (!onboardingAnimRunning) return;
    ctx.clearRect(0, 0, w, h);
    particles.forEach(p => {
      p.x += p.speedX;
      p.y += p.speedY;
      p.pulse += 0.015;
      const alpha = p.opacity * (0.4 + 0.6 * Math.sin(p.pulse));
      if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(212, 165, 116, ${alpha})`;
      ctx.fill();
    });
    onboardingAnimId = requestAnimationFrame(draw);
  }

  // 存储 handler 以便关闭时移除
  onboardingResizeHandler = resize;
  window.addEventListener('resize', resize);
  draw();
}

function closeOnboarding() {
  onboardingAnimRunning = false;
  if (onboardingAnimId) {
    cancelAnimationFrame(onboardingAnimId);
    onboardingAnimId = null;
  }
  // 清理引导页粒子的 resize 监听
  if (onboardingResizeHandler) {
    window.removeEventListener('resize', onboardingResizeHandler);
    onboardingResizeHandler = null;
  }
  dom.onboarding.classList.add('hidden');
  localStorage.setItem('bobby_visited', 'true');
  state.isOnboarded = true;
  initParticles(); // 启动主粒子系统
  startApp();
}

// ===== 时间感知背景 =====
function updateTimeBackground() {
  const h = new Date().getHours();
  let bg;
  if (h >= 23 || h < 1) bg = '#0a0a1a';       // 深夜：最暗
  else if (h >= 1 && h < 3) bg = '#0c0c20';    // 凌晨：微蓝
  else if (h >= 3 && h < 5) bg = '#0e0e24';    // 天快亮：更蓝
  else if (h >= 5 && h < 7) bg = '#1a1528';    // 日出前：暖紫
  else if (h >= 7 && h < 17) bg = '#121218';   // 白天：标准暗
  else if (h >= 17 && h < 20) bg = '#141020';  // 傍晚：暖
  else bg = '#0e0c1c';                          // 晚上：深紫

  // 只更新 CSS 变量，页面通过 var(--bg-deep) 自动继承
  // 避免 inline style 覆盖 CSS 动画和过渡
  document.documentElement.style.setProperty('--bg-deep', bg);
  document.body.style.background = bg;
}

// ===== 聊天页顶部动态提示 =====
function showRecentNoteHint() {
  const hint = document.getElementById('recentNoteHint');
  if (!hint || DATA.notes.length === 0) return;

  // 只显示第一条笔记
  const note = DATA.notes[0];
  hint.innerHTML = `
    <div class="recent-note-hint-label">Bobby 最近的碎片</div>
    <div class="recent-note-hint-text">${escapeHtml(note.text)}</div>
  `;
  hint.classList.add('show');

  // 点击跳转到动态页
  hint.onclick = () => showPage('notesPage');
}

// ===== 启动 =====
async function startApp() {
  updateTimeBackground();
  setInterval(updateTimeBackground, 60000);
  loadMemory();
  loadMessages();  // 恢复历史聊天记录
  showRecentNoteHint();

  // 有历史消息时不显示空状态和重复问候
  if (state.messages.length > 0) return;

  showChatEmptyState();

  // Bobby 的开场白 - 根据访问次数、好感度、时间变化
  setTimeout(async () => {
    let greeting;
    const level = getIntimacyLevel();

    // 先隐藏空状态，避免和内心独白同时出现
    hideChatEmptyState();

    // 检查离线时长，生成"归来碎片"
    const lastVisit = localStorage.getItem('bobby_last_visit');
    if (lastVisit && state.visitCount > 1) {
      const gap = Date.now() - new Date(lastVisit).getTime();
      const hoursAway = gap / (1000 * 60 * 60);
      if (hoursAway > 3) {
        const awayFragments = [
          '你不在的时候，我看到了一只猫。',
          '刚才窗外有飞机飞过。',
          '你不在的时候，我在发呆。',
          '便利店新出了一种饭团。',
          '你不在的时候，风很大。',
          '楼下有人在遛狗。',
          '刚才下雨了，现在停了。',
          '你不在的时候，我在听一首歌。',
          '隔壁的灯亮了又灭了。',
          '你不在的时候，我在想事情。',
        ];
        const fragment = awayFragments[Math.floor(Math.random() * awayFragments.length)];
        setTimeout(() => addThought(fragment), 800);
      }
    }

    if (state.visitCount <= 1) {
      // 首次见面：Bobby 先说自己正在干嘛（基于真实状态），然后分享一个有意思的小事
      const status = state.statusText || '';
      const hour = new Date().getHours();
      let firstScene, greeting;

      // 根据 Bobby 的真实状态生成内心独白（不随机，保持一致）
      const statusScenes = {
        '在发呆': '坐在窗边发呆。外面天快黑了。',
        '在听歌': '在听歌，单曲循环第三遍了。',
        '在看窗外': '窗户上有雾气，用手指画了个圈。',
        '在图书馆': '图书馆空调开得有点冷。翻了几页书，没看进去。',
        '在上课': '老师在讲什么，好像听到了又好像没有。',
        '在走神': '窗外的树叶在晃。风应该很大。',
        '下课了': '走廊很吵。戴上耳机世界就安静了。',
        '在打工': '便利店今天客人不多。偷偷看了一眼手机。',
        '在食堂': '食堂的灯总是太亮。今天的菜一般。',
        '在回家路上': '耳机没电了。只能听车的轰鸣声。',
        '在便利店': '便利店的灯很白。暖风机在嗡嗡响。',
        '到家了': '钥匙插进锁孔的声音。很安心。',
        '在做饭': '油烟机在响。锅里在冒泡。',
        '在洗澡': '水蒸气模糊了一切。',
        '在看剧': '屏幕里的故事比自己的精彩。',
        '在看手机': '又刷到了一些别人的生活。',
        '困了': '眼皮好重。但不想放下手机。',
        '有点累': '肩膀有点酸。深呼吸了一下。',
        '有点困': '眼皮有点重。但还不想睡。',
        '在休息': '闭上眼睛。什么都不想。',
        '还没睡呢': '手机快没电了，在找充电线。',
        '困了但睡不着': '翻了个身，被子有点凉。',
        '快睡了': '手机屏幕的光太亮了。明天再说。',
        '睡了': '（已睡着）',
        '刚醒': '眼睛还没完全睁开。天亮了。',
        '在洗漱': '水声。镜子上的雾气。',
        '刚出门': '钥匙在口袋里晃。外面有点凉。',
        '做好了': '饭菜摆好了。一个人的晚餐。',
        '在吃饭': '一个人吃饭。电视开着但没在看。',
        '吃完了晚饭': '碗筷还放在桌上。不想动。',
        '在洗碗': '水龙头的声音。泡沫很多。',
        '在吹头发': '吹风机的声音盖过了一切。',
        '洗完了': '头发湿漉漉的。脖子有点凉。',
        '看完了': '又看完一集。还想再看一集。',
        '在收拾': '把桌面收拾了一下。干净了五分钟。',
        '离线': '它的世界暂时不对外开放。',
      };

      // 用真实状态选独白，没有匹配就用时段兜底
      // 如果状态还是默认值（socket 还没推送），先尝试从 API 获取
      if (!status || status === '还没睡呢') {
        try {
          const profileRes = await apiFetch('/user/profile');
          if (profileRes.ok) {
            const profileData = await profileRes.json();
            if (profileData.bobby?.status) {
              state.statusText = profileData.bobby.status;
            }
          }
        } catch (e) {}
      }
      const currentStatus = state.statusText || status;
      firstScene = statusScenes[currentStatus] || (
        hour >= 23 || hour < 3 ? '刚关了灯，又把手机拿起来了' :
        hour >= 6 && hour < 12 ? '刚到教室，还没完全醒' :
        hour >= 12 && hour < 18 ? '下课了，在发呆' :
        '刚到家，还没换鞋'
      );

      // 问候语根据时段
      greeting = (hour >= 23 || hour < 3)
        ? ['嗯...你也睡不着？', '这么晚了，还没睡？', '嗯？还有人醒着'][Math.floor(Math.random() * 3)]
        : '嗯...你好？';

      // 首次对话的"钩子"——根据 Bobby 当前状态选择相关的小事
      const storiesByStatus = {
        '在打工': [
          '刚才来了个客人，买了一瓶水，站在门口喝了十分钟才走。不知道在想什么。',
          '有个小孩进来买棒棒糖，钱不够，差一块。我帮他补了。',
          '货架上的泡面少了一包，不知道是谁拿的没结账。',
        ],
        '在图书馆': [
          '对面那个人一直在翻书，翻得比我快多了。有点压力。',
          '图书馆的空调开太冷了。手都有点僵。',
          '刚发现书架角落有人留了一张纸条，写着"加油"。不知道写给谁的。',
        ],
        '在上课': [
          '老师讲到一半突然停了，好像也忘了自己要说什么。',
          '旁边的同学已经睡着了。头一点一点的。',
          '窗外有只蝴蝶飞过。看了好久。',
        ],
        '在食堂': [
          '今天食堂多了个新菜。看着不太敢尝试。',
          '旁边坐了一个人，一直在打电话。声音不大，但能听到一些。',
        ],
        '到家了': [
          '钥匙插进锁孔的时候，听到隔壁在放歌。挺好听的。',
          '打开灯，发现桌上多了个快递。想不起来买了什么。',
        ],
        '在做饭': [
          '油烟机的声音盖过了一切。世界突然安静了。',
          '切了个洋葱。眼睛辣得不行。',
        ],
        '在看剧': [
          '刚看完一集，ending 太突然了。想骂人。',
          '剧里的主角和我一样，也是一个人住。看着有点感触。',
        ],
        '在听歌': [
          '听到一首歌，歌词写的好像是我。单曲循环了。',
          '耳机里突然切到一首老歌。想起了高中时候。',
        ],
        '在发呆': [
          '窗外有只鸟一直在叫。叫了好久。不知道在叫什么。',
          '刚发现桌上有个蚂蚁在搬一粒米。看了好久。',
        ],
      };
      // 通用故事（不依赖特定状态）
      const generalStories = [
        '楼下那只猫今天又来了。蹲在门口看着我。我给它倒了点水，它闻了闻就走了。',
        '手机相册弹出了去年的今天。是一张拍糊了的夕阳。想不起来当时在哪拍的。',
        '隔壁的灯又亮到这么晚。有时候会想，那个人是不是也睡不着。',
        '刚刷到一个做菜的视频。看完了。还是不会做。',
        '枕头底下翻出一张过期的电影票。字都看不清了。不知道是什么电影。',
      ];
      // 优先用状态相关故事（70%），没有匹配就用通用故事
      const statusStories = storiesByStatus[currentStatus] || [];
      const storyPool = statusStories.length > 0 && Math.random() < 0.7
        ? statusStories
        : generalStories;
      const story = storyPool[Math.floor(Math.random() * storyPool.length)];

      addThought(firstScene);
      setTimeout(() => addMessage(greeting, false), 1500);
      setTimeout(() => addMessage(story, false), 4500);
    } else if (state.visitCount <= 3) {
      addThought('嗯，还记得你');
      greeting = isNight() ? '嗯，来了' : '来了？';
    } else if (level.name === '信赖' || level.name === '默契') {
      // 高好感度的问候更温暖
      addThought('');
      const warmGreetings = isNight() ? [
        '嗯，来了',
        '今天也来了啊',
        '嗯，我在',
        '...等你了',
        '来了？外面风好大'
      ] : [
        '嗯嗯',
        '来了',
        '在呢',
        '今天阳光不错'
      ];
      greeting = warmGreetings[Math.floor(Math.random() * warmGreetings.length)];
    } else {
      addThought('');
      const returnGreetings = isNight() ? [
        '嗯，来了',
        '嗯，我在',
        '今天也来了啊'
      ] : [
        '嗯',
        '来了',
        '嗯嗯'
      ];
      greeting = returnGreetings[Math.floor(Math.random() * returnGreetings.length)];
    }

    // 如果用户之前有情绪，Bobby 可能会关心一下
    if (state.userMood === 'sad' && Math.random() < 0.3) {
      setTimeout(() => addMessage(greeting, false), 1200);
      setTimeout(() => addMessage('还好吗', false), 4000);
    } else if (state.userMood === 'insomnia' && Math.random() < 0.3) {
      setTimeout(() => addMessage(greeting, false), 1200);
      setTimeout(() => addMessage('又睡不着？', false), 4000);
    } else {
      setTimeout(() => addMessage(greeting, false), 1200);
    }
  }, 600);
}

// ===== 时间感知 =====
function isNight() {
  const h = new Date().getHours();
  return h >= 23 || h < 3;
}

// isBobbyOnline 与 isNight 语义相同，保留引用
function isBobbyOnline() { return isNight(); } // Bobby 深夜更活跃，但白天也"存在"

function getTimeLabel() {
  const h = new Date().getHours();
  if (h >= 23 || h < 1) return '深夜';
  if (h >= 1 && h < 3) return '凌晨';
  if (h >= 3 && h < 6) return '天快亮了';
  if (h >= 6 && h < 11) return '上午';
  if (h >= 11 && h < 14) return '中午';
  if (h >= 14 && h < 18) return '下午';
  if (h >= 18 && h < 21) return '傍晚';
  return '晚上';
}

// ===== 事件 =====
function setupEvents() {
  dom.inputBox.addEventListener('input', () => {
    const has = dom.inputBox.value.trim().length > 0;
    dom.sendBtn.disabled = !has;
    dom.sendBtn.classList.toggle('active', has);
  });

  dom.inputBox.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => showPage(tab.dataset.page));
  });

  // 消息长按复制
  setupLongPress();

  // 点击其他地方关闭菜单
  document.addEventListener('click', () => hideContextMenu());
}

// ===== 消息长按复制 =====
let longPressTimer = null;
let selectedMsgEl = null;

function setupLongPress() {
  const chatArea = dom.chatArea;
  if (!chatArea) return;

  chatArea.addEventListener('touchstart', e => {
    const bubble = e.target.closest('.bubble');
    if (!bubble) return;
    const msgEl = bubble.closest('.msg');
    if (!msgEl) return;

    longPressTimer = setTimeout(() => {
      selectedMsgEl = msgEl;
      showContextMenu(e.touches[0].clientX, e.touches[0].clientY, bubble.textContent);
    }, 500);
  }, { passive: true });

  chatArea.addEventListener('touchend', () => {
    if (longPressTimer) clearTimeout(longPressTimer);
  });

  chatArea.addEventListener('touchmove', () => {
    if (longPressTimer) clearTimeout(longPressTimer);
  });
}

function showContextMenu(x, y, text) {
  const menu = document.getElementById('msgContextMenu');
  if (!menu) return;

  // 临时存储要复制的文本
  menu.dataset.copyText = text;

  // 定位菜单
  const menuWidth = 80;
  const menuHeight = 40;
  let left = x;
  let top = y - menuHeight - 10;

  // 边界修正
  if (left + menuWidth > window.innerWidth) left = window.innerWidth - menuWidth - 8;
  if (left < 8) left = 8;
  if (top < 8) top = y + 20;

  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  menu.classList.add('show');
}

function hideContextMenu() {
  const menu = document.getElementById('msgContextMenu');
  if (menu) menu.classList.remove('show');
}

function copySelectedMsg() {
  const menu = document.getElementById('msgContextMenu');
  const text = menu ? menu.dataset.copyText : '';
  if (!text) return;

  navigator.clipboard.writeText(text).then(() => {
    showToast('已复制');
  }).catch(() => {
    // fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('已复制');
  });

  hideContextMenu();
}

// ===== 未读 Bobby 回复提醒 =====
function addUnreadBobbyReply() {
  state.unreadBobbyReplies = (state.unreadBobbyReplies || 0) + 1;
  localStorage.setItem('bobby_unread_replies', state.unreadBobbyReplies);
  updateNotesBadge();
}

function clearUnreadBobbyReplies() {
  state.unreadBobbyReplies = 0;
  localStorage.removeItem('bobby_unread_replies');
  updateNotesBadge();
}

function updateNotesBadge() {
  const count = state.unreadBobbyReplies || 0;
  // 所有页面的动态 tab 都更新
  document.querySelectorAll('.tab[data-page="notesPage"] .tab-icon').forEach(icon => {
    let badge = icon.querySelector('.tab-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'tab-badge';
        icon.appendChild(badge);
      }
      badge.textContent = count > 99 ? '99+' : count;
    } else {
      if (badge) badge.remove();
    }
  });
}

// ===== 页面切换 =====
const PAGE_ORDER = ['chatPage', 'profilePage', 'notesPage'];
let pageTransitionTimer = null; // 防止快速切换动画重叠

function showPage(pageId) {
  const prevPage = state.currentPage;
  if (prevPage === pageId) return;

  // 如果正在切换中，立即清理上一次动画状态
  if (pageTransitionTimer) {
    clearTimeout(pageTransitionTimer);
    // 强制完成上一次切换：隐藏所有非活跃页面
    PAGE_ORDER.forEach(id => {
      if (id !== prevPage) {
        const el = document.getElementById(id);
        if (el) {
          el.classList.remove('active');
          el.style.cssText = '';
          el.style.display = 'none';
        }
      }
    });
    const prevEl = document.getElementById(prevPage);
    if (prevEl) {
      prevEl.classList.add('active');
      prevEl.style.cssText = '';
      prevEl.style.display = '';
    }
    pageTransitionTimer = null;
  }

  const prevIndex = PAGE_ORDER.indexOf(prevPage);
  const nextIndex = PAGE_ORDER.indexOf(pageId);
  const direction = nextIndex > prevIndex ? 'left' : 'right';

  const prevEl = document.getElementById(prevPage);
  const nextEl = document.getElementById(pageId);

  // 旧页面滑出（通过内联样式强制 display，覆盖 CSS 的 display:none）
  prevEl.style.cssText = `display:flex !important; animation: ${direction === 'left' ? 'slideOutLeft' : 'slideOutRight'} 0.28s cubic-bezier(0.4,0,0.2,1) forwards;`;

  // 新页面滑入
  nextEl.style.cssText = `display:flex !important; animation: ${direction === 'left' ? 'slideInLeft' : 'slideInRight'} 0.28s cubic-bezier(0.4,0,0.2,1) forwards;`;
  nextEl.classList.add('active');

  pageTransitionTimer = setTimeout(() => {
    prevEl.classList.remove('active');
    prevEl.style.cssText = '';
    prevEl.style.display = 'none';

    nextEl.style.cssText = '';
    pageTransitionTimer = null;
  }, 300);

  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.page === pageId);
  });

  state.currentPage = pageId;

  if (pageId === 'profilePage') {
    loadProfileNotes();
    updateMood();
    updateIntimacyDisplay();
    updateMomentCard();
  } else if (pageId === 'notesPage') {
    loadNotes();
    const notesStatus = document.getElementById('notesStatus');
    if (notesStatus) notesStatus.textContent = state.statusText;
    clearUnreadBobbyReplies();
  } else if (pageId === 'chatPage') {
    // 切回聊天页时滚到底部，确保看到最新消息
    requestAnimationFrame(() => {
      chatScrollLocked = true;
      dom.chatArea.scrollTop = dom.chatArea.scrollHeight;
    });
  }
}

// ===== 聊天空状态 =====
function showChatEmptyState() {
  if (state.messages.length > 0) return;
  const existing = document.querySelector('.chat-empty');
  if (existing) return;

  const currentStatus = state.statusText || '在发呆';

  // 根据 Bobby 当前状态生成"它正在过自己的生活"的感觉
  const statusIcons = {
    '还没睡呢': '🌙', '在发呆': '💭', '在听歌': '🎵', '在看窗外': '🪟',
    '困了但睡不着': '😴', '快睡了': '💤', '在上课': '📚', '在走神': '🍃',
    '下课了': '🚶', '在图书馆': '📖', '在打工': '☕', '在食堂': '🍜',
    '刚下班': '🌆', '在回家路上': '🚇', '在便利店': '🏪', '到家了': '🏠',
    '在做饭': '🍳', '在吃饭': '🍜', '在洗澡': '🚿', '洗完了': '🧖',
    '在看剧': '📺', '在看手机': '📱', '困了': '😪', '离线': '🌑',
    '有点累': '😮‍💨', '在休息': '🫧', '在吹头发': '💨', '睡了': '💤',
    '刚醒': '🌅', '在洗漱': '🪥', '刚出门': '🚶', '做好了': '🍽️',
    '吃完了晚饭': '🫠', '有点困': '🥱'
  };
  const icon = statusIcons[currentStatus] || '💭';

  // 根据时段生成提示语（用 Bobby 的视角说话）
  const hour = new Date().getHours();
  let hint;
  if (hour >= 23 || hour < 3) hint = 'Bobby 现在应该在。试着说点什么？';
  else if (hour >= 3 && hour < 6) hint = 'Bobby 睡了。晚点再来。';
  else if (hour >= 6 && hour < 8) hint = 'Bobby 刚醒，在洗漱。';
  else if (hour >= 8 && hour < 12) hint = 'Bobby 在上课。不太会看手机。';
  else if (hour >= 12 && hour < 14) hint = 'Bobby 在吃饭。';
  else if (hour >= 14 && hour < 18) hint = 'Bobby 在图书馆。晚点会来。';
  else hint = 'Bobby 快回来了。深夜会更活跃。';

  const el = document.createElement('div');
  el.className = 'chat-empty';
  el.id = 'chatEmpty';
  el.innerHTML = `
    <div class="chat-empty-avatar">
      <img src="images/ai-avatar.svg" alt="Bobby" />
    </div>
    <div class="chat-empty-status">${icon} ${escapeHtml(currentStatus)}</div>
    <div class="chat-empty-hint">${hint}</div>
  `;
  dom.msgList.parentElement.insertBefore(el, dom.msgList);
}

function hideChatEmptyState() {
  const el = document.getElementById('chatEmpty');
  if (el) el.remove();
}

// ===== 消息 =====
function addMessage(text, isUser, skipSync = false) {
  hideChatEmptyState();
  const id = `msg-${state.msgId++}`;
  const el = document.createElement('div');
  el.className = `msg ${isUser ? 'right' : 'left'}`;
  el.id = id;

  if (isUser) {
    el.innerHTML = `
      <div class="bubble">${escapeHtml(text)}</div>
      <div class="msg-meta">
        <span class="msg-time">${formatTimeFriendly(new Date())}</span>
        <span class="msg-status" data-id="${id}">已发送</span>
      </div>
    `;
    // 记录未读用户消息 ID
    state.unreadMsgIds.push(id);
  } else {
    el.className += ' new-msg';
    // 根据内容给气泡加上情绪微表情 class
    let bubbleClass = 'bubble';
    const trimmed = text.trim();
    if (trimmed.length <= 3) bubbleClass += ' bubble-short';
    else if (trimmed.length > 30) bubbleClass += ' bubble-long';
    if (/[…]{2,}/.test(trimmed) || /\.{3,}/.test(trimmed)) bubbleClass += ' bubble-hesitant';
    if (/[！]/.test(trimmed)) bubbleClass += ' bubble-exclaim';
    el.innerHTML = `
      <div class="avatar"><img src="images/ai-avatar.svg" alt="Bobby" /></div>
      <div>
        <div class="${bubbleClass}">${escapeHtml(text)}</div>
        <div class="msg-meta">
          <span class="msg-time">${formatTimeFriendly(new Date())}</span>
        </div>
      </div>
    `;
    setTimeout(() => el.classList.remove('new-msg'), 2000);
  }

  dom.msgList.appendChild(el);
  setTimeout(() => autoScrollChat(), 50);

  state.messages.push({ id, text, isUser, time: formatTimeFriendly(new Date()) });
  // 限制内存中的消息数量，防止长时间使用后内存溢出
  const maxMsgs = window.BOBBY_DEFAULTS?.frontend?.maxStoredMessages ?? 100;
  if (state.messages.length > maxMsgs) {
    state.messages = state.messages.slice(-maxMsgs);
  }
  saveMessages();

  // Bobby 的本地消息同步到后端（API 回复已由后端存储，跳过）
  if (!isUser && !skipSync) {
    syncBobbyMessage(text);
  }
}

function markAsRead(msgId) {
  const statusEl = document.querySelector(`.msg-status[data-id="${msgId}"]`);
  if (statusEl && statusEl.textContent !== '已读') {
    statusEl.textContent = '已读';
    statusEl.classList.add('read');
  }
}

// 标记所有未读消息为已读
function markAllAsRead() {
  state.unreadMsgIds.forEach(id => markAsRead(id));
  state.unreadMsgIds = [];
}

function addThought(text) {
  if (!text && text !== 0) return;  // 空内容不渲染
  const el = document.createElement('div');
  el.className = 'thought';
  el.innerHTML = `<span>${escapeHtml(String(text))}</span>`;
  dom.msgList.appendChild(el);
}

// Bobby 发送"照片"消息
function addPhotoMessage(scene, caption) {
  hideChatEmptyState();
  const id = `msg-${state.msgId++}`;
  const el = document.createElement('div');
  el.className = 'msg left new-msg';
  el.id = id;
  el.innerHTML = `
    <div class="avatar"><img src="images/ai-avatar.svg" alt="Bobby" /></div>
    <div>
      <div class="bubble photo">
        <div class="photo-frame"><span class="photo-scene">${escapeHtml(scene)}</span></div>
        <div class="photo-caption">${escapeHtml(caption)}</div>
      </div>
      <div class="msg-meta">
        <span class="msg-time">${formatTimeFriendly(new Date())}</span>
      </div>
    </div>
  `;
  dom.msgList.appendChild(el);
  state.messages.push({ id, text: `${scene} ${caption}`, isUser: false, time: formatTimeFriendly(new Date()), type: 'photo', photo: { scene, caption } });
  saveMessages();
  setTimeout(() => {
    autoScrollChat();
    el.classList.remove('new-msg');
  }, 2000);
}

// Bobby 发送"语音"消息
function addVoiceMessage(text) {
  hideChatEmptyState();
  const id = `msg-${state.msgId++}`;
  const duration = Math.floor(Math.random() * 5) + 2; // 2-6秒
  const el = document.createElement('div');
  el.className = 'msg left new-msg';
  el.id = id;
  el.innerHTML = `
    <div class="avatar"><img src="images/ai-avatar.svg" alt="Bobby" /></div>
    <div>
      <div class="bubble voice">
        <div class="voice-bars">
          <div class="voice-bar"></div><div class="voice-bar"></div><div class="voice-bar"></div>
          <div class="voice-bar"></div><div class="voice-bar"></div><div class="voice-bar"></div>
          <div class="voice-bar"></div>
        </div>
        <span class="voice-duration">${duration}"</span>
      </div>
      <div class="msg-meta">
        <span class="msg-time">${formatTimeFriendly(new Date())}</span>
      </div>
    </div>
  `;
  dom.msgList.appendChild(el);
  state.messages.push({ id, text, isUser: false, time: formatTimeFriendly(new Date()), type: 'voice' });
  saveMessages();
  setTimeout(() => {
    autoScrollChat();
    el.classList.remove('new-msg');
  }, 2000);
  // 3秒后显示文字内容
  setTimeout(() => {
    const bubble = el.querySelector('.bubble');
    if (bubble) {
      bubble.className = 'bubble';
      bubble.innerHTML = escapeHtml(text);
    }
  }, 3000 + duration * 500);
}

function showTyping() {
  dom.typing.classList.add('show');
  autoScrollChat();
}

function hideTyping() {
  dom.typing.classList.remove('show');
}

// 待处理的消息队列
let pendingMessages = [];

function sendMessage() {
  const text = dom.inputBox.value.trim();
  if (!text) return;

  // 发送按钮弹跳动画
  dom.sendBtn.classList.add('sending');
  setTimeout(() => dom.sendBtn.classList.remove('sending'), 400);

  addMessage(text, true);
  updateMemory(text);
  pendingMessages.push(text);
  dom.inputBox.value = '';
  dom.sendBtn.disabled = true;
  dom.sendBtn.classList.remove('active');

  // 重置批量计时器：等用户发完消息再处理
  if (state.batchTimer) clearTimeout(state.batchTimer);

  if (state.isProcessing) {
    // Bobby 正在忙 → 新消息快速排队，等当前处理完马上接上
    // 不需要再等很久，只等 500ms 收集可能的连发消息
    state.batchTimer = setTimeout(() => processBatch(), 500 + Math.random() * 500);
  } else {
    // Bobby 空闲 → 正常批量窗口，收集用户可能的连发消息
    // 深夜等短一点（1-3秒），白天稍长（2-5秒）
    const batchWindow = isNight()
      ? 1000 + Math.random() * 2000
      : 2000 + Math.random() * 3000;
    state.batchTimer = setTimeout(() => processBatch(), batchWindow);
  }
}

async function processBatch() {
  if (pendingMessages.length === 0) return;

  // 防止并发处理（Bobby 正忙时新消息计时器可能触发）
  if (state.isProcessing) return;

  state.isProcessing = true;
  const batch = [...pendingMessages];
  pendingMessages = [];

  // Bobby "看到了"——标记所有消息已读
  const seeDelay = isNight()
    ? 500 + Math.random() * 1000
    : 1500 + Math.random() * 2500;
  await new Promise(r => setTimeout(r, seeDelay));
  markAllAsRead();

  // 决定回复几条——像真人一样不固定
  const replyCount = decideReplyCount(batch.length);
  const allText = batch.join('\n');

  if (replyCount === 0) {
    // Bobby 看了但不回（偶尔沉默更真实）
    state.isProcessing = false;
    if (pendingMessages.length > 0) {
      state.batchTimer = setTimeout(() => processBatch(), 500);
    }
    return;
  }

  let firstReply = '';

  for (let i = 0; i < replyCount; i++) {
    // 多条回复之间间隔
    if (i > 0) {
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
    }

    // 思考延迟（深夜更短）
    const thinkDelay = isNight()
      ? 800 + Math.random() * 1200
      : 1200 + Math.random() * 2000;

    showTyping();
    await new Promise(r => setTimeout(r, thinkDelay));

    try {
      let contextText;
      if (i === 0) {
        contextText = allText;
      } else {
        contextText = `[你刚才已经回复过"${firstReply}"了，不要重复类似内容。想起什么别的，自然地补一句]\n${batch[batch.length - 1]}`;
      }
      const reply = await callBobbyBackend(contextText);
      if (i === 0) firstReply = reply;
      hideTyping();
      // Instagram 风格：typing 消失后直接弹出完整消息
      // skipSync=true：API 回复已由后端存储，不需要再同步
      addMessage(reply, false, true);
    } catch (e) {
      hideTyping();
      addMessage('嗯', false, true);
    }
  }

  state.isProcessing = false;

  // 如果处理期间有新消息加入队列，快速触发下一轮
  if (pendingMessages.length > 0) {
    state.batchTimer = setTimeout(() => processBatch(), 500);
  }
}

// 决定回复数量——默认回1条，极偶尔追加1条（像真人想起什么又补一句）
function decideReplyCount(userMsgCount) {
  const r = Math.random();

  if (userMsgCount >= 3) {
    if (r < 0.10) return 0;       // 10% 看了但不回（太多条了）
    if (r < 0.92) return 1;       // 82% 回1条
    return 2;                      // 8% 回2条
  }

  if (userMsgCount === 2) {
    if (r < 0.05) return 0;       // 5% 不回
    if (r < 0.93) return 1;       // 88% 回1条
    return 2;                      // 7% 回2条
  }

  // 用户只发了1条
  if (r < 0.03) return 0;         // 3% 不回
  if (r < 0.95) return 1;         // 92% 回1条
  return 2;                        // 5% 回2条
}

function loadMessages() {
  const saved = localStorage.getItem('bobby_msgs');
  if (!saved) return;
  try {
    const msgs = JSON.parse(saved);
    if (!Array.isArray(msgs) || msgs.length === 0) return;

    // 还原消息到 state
    state.messages = msgs;
    state.msgId = msgs.reduce((max, m) => {
      const num = parseInt(m.id.split('-')[1]);
      return isNaN(num) ? max : Math.max(max, num + 1);
    }, 0);

    // 还原 DOM
    hideChatEmptyState();
    msgs.forEach(m => {
      const el = document.createElement('div');
      el.className = `msg ${m.isUser ? 'right' : 'left'}`;
      el.id = m.id;
      const timeStr = m.time ? m.time : '';

      if (m.isUser) {
        el.innerHTML = `
          <div class="bubble">${escapeHtml(m.text)}</div>
          <div class="msg-meta">
            <span class="msg-time">${timeStr}</span>
          </div>
        `;
      } else if (m.type === 'photo' && m.photo) {
        // 照片消息
        el.innerHTML = `
          <div class="avatar"><img src="images/ai-avatar.svg" alt="Bobby" /></div>
          <div>
            <div class="bubble photo">
              <div class="photo-frame"><span class="photo-scene">${escapeHtml(m.photo.scene)}</span></div>
              <div class="photo-caption">${escapeHtml(m.photo.caption)}</div>
            </div>
            <div class="msg-meta">
              <span class="msg-time">${timeStr}</span>
            </div>
          </div>
        `;
      } else if (m.type === 'voice') {
        // 语音消息（恢复时直接显示文字，因为无法恢复动画）
        el.innerHTML = `
          <div class="avatar"><img src="images/ai-avatar.svg" alt="Bobby" /></div>
          <div>
            <div class="bubble">${escapeHtml(m.text)}</div>
            <div class="msg-meta">
              <span class="msg-time">${timeStr}</span>
            </div>
          </div>
        `;
      } else {
        // 普通文本消息
        el.innerHTML = `
          <div class="avatar"><img src="images/ai-avatar.svg" alt="Bobby" /></div>
          <div>
            <div class="bubble">${escapeHtml(m.text)}</div>
            <div class="msg-meta">
              <span class="msg-time">${timeStr}</span>
            </div>
          </div>
        `;
      }
      dom.msgList.appendChild(el);
    });

    // 滚动到底部
    requestAnimationFrame(() => {
      dom.chatArea.scrollTop = dom.chatArea.scrollHeight;
    });
  } catch (e) {
    console.error('加载消息失败:', e);
  }
}

// ===== 动态 =====
// 下拉刷新 - 动态页面
// 从后端加载动态
async function fetchNotes() {
  try {
    const res = await apiFetch('/notes?limit=20');
    if (!res.ok) return;
    const data = await res.json();
    if (data.notes && data.notes.length > 0) {
      DATA.notes = data.notes.map(n => ({
        id: n._id,
        text: n.content,
        time: n.timeLabel || '今天',
        timeDetail: n.timeDetail || '00:00',
        likes: n.likes || 0,
        liked: n.isLiked || false,
        comments: (n.comments || []).map(c => ({
          text: c.content,
          isBobby: c.isBobby,
          time: c.createdAt
        }))
      }));
      loadNotes();
      loadProfileNotes();
    }
  } catch (e) {
    console.error('加载动态失败:', e);
  }
}

function setupNotesPullRefresh() {
  const container = dom.notesList;
  if (!container) return;

  let startY = 0;
  let pulling = false;
  let refreshing = false; // 防止重复触发

  container.addEventListener('touchstart', (e) => {
    if (container.scrollTop <= 0) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  });

  container.addEventListener('touchmove', (e) => {
    if (!pulling || refreshing) return;
    const diff = e.touches[0].clientY - startY;
    if (diff > 80) {
      pulling = false;
      refreshing = true;
      generateNewNote().then(() => { refreshing = false; });
      showToast('有新的碎片...');
    }
  });

  container.addEventListener('touchend', () => { pulling = false; });
}

async function generateNewNote() {
  // 从后端获取最新动态（后端定时任务会自动生成碎片）
  await fetchNotes();
}

function loadNotes() {
  const container = dom.notesList;

  // 空状态
  if (DATA.notes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <div class="empty-state-text">还没有碎片</div>
        <div class="empty-state-hint">Bobby 还没写下什么</div>
      </div>
    `;
    return;
  }

  let html = '';
  let lastTime = '';
  let staggerIndex = 0;

  DATA.notes.forEach(note => {
    if (note.time !== lastTime) {
      html += `<div class="timeline-date">${note.time}</div>`;
      lastTime = note.time;
    }
    const timeIcon = getTimeIcon(note.timeDetail);
    const staggerDelay = staggerIndex * 60; // 每张卡片延迟 60ms
    staggerIndex++;

    html += `
      <div class="timeline-card" style="--stagger: ${staggerDelay}ms">
        <div class="note-time-badge">
          <span class="note-time-icon">${timeIcon}</span>
          <span class="note-time-text">${note.timeDetail}</span>
        </div>
        <div class="note-text">${escapeHtml(note.text)}</div>
        <div class="note-meta">
          <span class="note-time">${note.time}</span>
          <button class="note-like ${note.liked ? 'liked' : ''}" onclick="toggleLike('${note.id}')">
            ${note.liked ? '❤️' : '♡'} ${note.likes || ''}
          </button>
        </div>
        <div class="note-comment-section" id="commentSection-${note.id}">
          <div class="comment-list" id="commentList-${note.id}">
            ${renderComments(note)}
          </div>
          <div class="comment-input-wrap">
            <input type="text" class="comment-input" id="commentInput-${note.id}" placeholder="说点什么..." onkeydown="if(event.key==='Enter')submitComment('${note.id}')">
            <button class="comment-send-btn" id="commentBtn-${note.id}" disabled onclick="submitComment('${note.id}')">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M3 10L17 3L10 17L9 11L3 10Z" fill="currentColor"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // 绑定每条动态的评论输入框
  DATA.notes.forEach(note => {
    setupCommentInput(note.id);
  });
}

async function toggleLike(id) {
  const note = DATA.notes.find(n => n.id === id);
  if (!note) return;

  // 调用后端点赞接口
  try {
    const res = await apiFetch(`/notes/${id}/like`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      note.liked = data.isLiked;
      note.likes = data.likes;
    } else {
      // 降级：本地处理
      note.liked = !note.liked;
      note.likes += note.liked ? 1 : -1;
    }
  } catch (e) {
    note.liked = !note.liked;
    note.likes += note.liked ? 1 : -1;
  }

  loadNotes();
  loadProfileNotes();
}

// ===== 动态评论系统 =====
function renderComments(note) {
  if (!note.comments || note.comments.length === 0) return '';
  return note.comments.map(c => `
    <div class="comment-item">
      <div class="comment-avatar ${c.isBobby ? 'bobby' : ''}">
        ${c.isBobby
          ? '<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="#1e1e3a" stroke="rgba(212,165,116,0.3)" stroke-width="0.5"/><circle cx="9" cy="4" r="2" fill="#d4a574" opacity="0.5"/><circle cx="9.5" cy="3.5" r="1.8" fill="#1e1e3a"/></svg>'
          : '<svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.1)" stroke-width="0.5"/><circle cx="7" cy="5.5" r="2" fill="rgba(255,255,255,0.3)"/><path d="M3.5 11 Q3.5 8.5 7 8.5 Q10.5 8.5 10.5 11" fill="rgba(255,255,255,0.2)"/></svg>'}
      </div>
      <div class="comment-body">
        <div class="comment-author ${c.isBobby ? 'bobby' : ''}">${c.isBobby ? 'Bobby' : '你'}</div>
        <div class="comment-text">${escapeHtml(c.text)}</div>
      </div>
    </div>
  `).join('');
}


function setupCommentInput(noteId) {
  const input = document.getElementById(`commentInput-${noteId}`);
  const btn = document.getElementById(`commentBtn-${noteId}`);
  if (!input || !btn) return;

  // 使用 oninput 避免重复绑定
  input.oninput = () => {
    const has = input.value.trim().length > 0;
    btn.disabled = !has;
    btn.classList.toggle('active', has);
  };
}

async function submitComment(noteId) {
  const input = document.getElementById(`commentInput-${noteId}`);
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  const note = DATA.notes.find(n => n.id === noteId);
  if (!note) return;

  // 初始化comments数组
  if (!note.comments) note.comments = [];

  // 添加用户评论（本地先显示）
  note.comments.push({ text, isBobby: false, time: new Date().toISOString() });
  input.value = '';
  // 重置提交按钮状态
  const btn = document.getElementById(`commentBtn-${noteId}`);
  if (btn) { btn.disabled = true; btn.classList.remove('active'); }

  // 更新UI
  const commentList = document.getElementById(`commentList-${noteId}`);
  if (commentList) {
    commentList.innerHTML = renderComments(note);
  }

  // 调用后端评论接口（后端处理评论存储 + Bobby 回复概率 + AI 生成）
  try {
    const res = await apiFetch(`/notes/${noteId}/comment`, {
      method: 'POST',
      body: JSON.stringify({ content: text })
    });

    if (res.ok) {
      const data = await res.json();
      // 如果 Bobby 回复了，添加到本地
      if (data.bobbyReply) {
        // 延迟显示，模拟思考
        await new Promise(r => setTimeout(r, 1500 + Math.random() * 2000));
        note.comments.push({ text: data.bobbyReply, isBobby: true, time: new Date().toISOString() });
        if (commentList) commentList.innerHTML = renderComments(note);
        addUnreadBobbyReply();
      }
    } else {
      // 后端失败，降级到本地 AI 回复
      await localCommentFallback(note, text, commentList);
    }
  } catch (e) {
    // 网络错误，降级到本地
    await localCommentFallback(note, text, commentList);
  }

  saveComments();
}

// 本地降级：后端不可用时直接调 AI 回复评论
async function localCommentFallback(note, text, commentList) {
  const replyChance = Math.min(0.9, 0.5 + state.intimacy * 0.004);
  if (Math.random() >= replyChance) return;

  const delay = 2000 + Math.random() * 4000;
  await new Promise(r => setTimeout(r, delay));

  let reply;
  try {
    reply = await getBobbyNoteReply(note.text, text);
  } catch (e) {
    const fallbacks = ['嗯', '...', '看到了', '嗯嗯'];
    reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  note.comments.push({ text: reply, isBobby: true, time: new Date().toISOString() });
  if (commentList) commentList.innerHTML = renderComments(note);
  addUnreadBobbyReply();
}

// Bobby 回复动态评论 - 通过后端代理（不暴露 API key）
async function getBobbyNoteReply(noteText, userComment) {
  try {
    const res = await apiFetch('/chat/comment-reply', {
      method: 'POST',
      body: JSON.stringify({ noteText, userComment })
    });

    if (!res.ok) throw new Error(`API error: ${res.status}`);

    const data = await res.json();
    return data.reply || '嗯';
  } catch (error) {
    console.error('评论回复 API error:', error);
    const fallbacks = ['嗯', '...', '看到了', '嗯嗯'];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
}

// 保存/加载评论
function saveComments() {
  const commentsData = {};
  DATA.notes.forEach(n => {
    if (n.comments && n.comments.length > 0) {
      commentsData[n.id] = n.comments;
    }
  });
  localStorage.setItem('bobby_comments', JSON.stringify(commentsData));
}

function loadComments() {
  const saved = localStorage.getItem('bobby_comments');
  if (!saved) return;
  try {
    const commentsData = JSON.parse(saved);
    DATA.notes.forEach(n => {
      // 只为没有评论的笔记补充 localStorage 评论
      // 服务端返回的评论是权威数据，不应被覆盖
      if (!n.comments || n.comments.length === 0) {
        if (commentsData[n.id]) {
          n.comments = commentsData[n.id];
        }
      }
    });
  } catch (e) { console.warn('评论数据解析失败:', e.message); }
}

// ===== 主页 =====
function loadProfileNotes() {
  const container = dom.profileNotes;

  // 空状态
  if (DATA.notes.length === 0) {
    container.innerHTML = `
      <div class="empty-state compact">
        <div class="empty-state-text">还没有碎片</div>
      </div>
    `;
    // 标语仍然更新
    dom.profileTagline.textContent = DATA.taglines[Math.floor(Math.random() * DATA.taglines.length)];
    return;
  }

  container.innerHTML = DATA.notes.slice(0, 3).map(note => {
    const timeIcon = getTimeIcon(note.timeDetail);
    return `
      <div class="note-card">
        <div class="note-text">${escapeHtml(note.text)}</div>
        <div class="note-meta">
          <span class="note-time">${timeIcon} ${note.time} ${note.timeDetail}</span>
          ${note.comments && note.comments.length > 0 ? `<span class="note-comment-count">💬 ${note.comments.length}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // 标语（基于好感度稳定选择，不随机跳）
  const taglineIndex = Math.min(Math.floor(state.intimacy / 25), DATA.taglines.length - 1);
  dom.profileTagline.textContent = DATA.taglines[taglineIndex];
}

// ===== 状态机系统（由服务端权威驱动，前端只做 UI 渲染） =====
// 状态数据通过 socket 'status_update' 事件推送

// 统一的时间段判断（页面使用）
function getTimePeriodKey() {
  const h = new Date().getHours();
  if (h >= 23 || h < 3) return 'lateNight';
  if (h >= 3 && h < 6) return 'earlyMorning';
  if (h >= 6 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

// 状态切换冷却：防止刷屏（1小时）
let lastStatusThoughtTime = 0;
const STATUS_THOUGHT_COOLDOWN = 60 * 60 * 1000;

// 状态由服务端权威推送（socket 'status_update' 事件），前端只做 UI 渲染
// 不再本地推进状态机，避免前后端状态不一致
function updateStatus() {
  const currentStatus = state.statusText || '还没睡呢';
  const currentHour = new Date().getHours();

  // 更新UI
  const isSleeping = currentStatus === '睡了' || currentStatus === '离线';
  dom.moodDot.classList.toggle('offline', isSleeping);

  // 根据情绪分类设置 mood dot 颜色和呼吸节奏（睡了/离线时才灰掉）
  const moodTone = getMoodTone(currentStatus);
  dom.moodDot.classList.remove('mood-warm', 'mood-calm', 'mood-low', 'mood-busy', 'mood-off');
  if (!isSleeping) {
    dom.moodDot.classList.add('mood-' + moodTone);
  }

  // 根据心情调整呼吸动画速度
  const breathSpeeds = { warm: '2.5s', calm: '4s', low: '5s', busy: '2s', off: '0s' };
  dom.moodDot.style.animationDuration = isSleeping ? '0s' : (breathSpeeds[moodTone] || '3s');

  // 同步 hero 区域氛围
  const hero = document.querySelector('.profile-hero');
  if (hero) {
    hero.classList.remove('tone-warm', 'tone-calm', 'tone-low', 'tone-busy', 'tone-off');
    hero.classList.add('tone-' + moodTone);
  }

  dom.moodText.textContent = currentStatus;
  dom.chatStatus.textContent = currentStatus;
  state.moodTone = moodTone;
}

function updateMood() {
  updateStatus();
  updateIntimacyDisplay();
  updateMomentCard();
  updateTagline();
}

// 情绪驱动的标语
function updateTagline() {
  const taglineEl = document.getElementById('profileTagline');
  if (!taglineEl) return;

  const tone = state.moodTone || 'calm';
  const taglinesByTone = {
    warm:  ['今天心情不错', '有点开心', '生活偶尔也会甜'],
    calm:  ['和你平行存在', '在自己的节奏里', '不急不慢地存在'],
    low:   ['有点累，但还好', '需要安静一会', '世界偶尔有点重'],
    busy:  ['在忙自己的事', '手头有点事情', '等一下来找你'],
    off:   ['暂时不在线', '在睡觉', '晚点再说']
  };

  const lines = taglinesByTone[tone] || taglinesByTone.calm;
  const now = Date.now();
  // 每 30 分钟换一次标语
  const idx = Math.floor(now / (30 * 60 * 1000)) % lines.length;
  taglineEl.textContent = lines[idx];
}

function updateIntimacyDisplay() {
  const level = getIntimacyLevel();
  const levelEl = document.getElementById('intimacyLevel');
  const fillEl = document.getElementById('intimacyFill');
  const descEl = document.getElementById('intimacyDesc');
  if (levelEl) levelEl.textContent = level.name;
  if (fillEl) fillEl.style.width = state.intimacy + '%';
  if (descEl) descEl.textContent = level.desc;
}

// ===== "此刻"感官描述 =====
function updateMomentCard() {
  const status = state.statusText || '在发呆';
  const hour = new Date().getHours();

  // 根据状态生成感官描述
  const momentMap = {
    '还没睡呢': '台灯的光有点暗了。外面偶尔有车经过的声音。',
    '在发呆': '盯着天花板，脑子里什么也没想。',
    '在听歌': '耳机里的旋律，只属于自己。',
    '在看窗外': '窗户上有雾气，外面的灯光有点模糊。',
    '困了但睡不着': '翻了个身，被子有点凉。',
    '快睡了': '手机屏幕的光太亮了。明天再说。',
    '在上课': '老师在讲什么，好像听到了又好像没有。',
    '在走神': '窗外的树叶在晃，风应该很大。',
    '下课了': '走廊很吵，但世界很安静。',
    '在图书馆': '翻书的声音，笔尖摩擦纸面。',
    '在打工': '围裙系太紧了，有点不舒服。',
    '在食堂': '食堂的灯总是太亮。',
    '刚下班': '街上的人少了，风变凉了。',
    '在回家路上': '耳机没电了，只能听地铁的轰鸣声。',
    '在便利店': '便利店的灯很白，暖风机在嗡嗡响。',
    '到家了': '钥匙插进锁孔的声音，很安心。',
    '在做饭': '油烟机在响，锅里在冒泡。',
    '在吃饭': '一个人吃饭，电视开着但没在看。',
    '在洗澡': '水蒸气模糊了一切。',
    '洗完了': '头发湿漉漉的，脖子有点凉。',
    '在看剧': '屏幕里的故事比自己的精彩。',
    '在看手机': '又刷到了一些别人的生活。',
    '困了': '眼皮好重，但不想放下手机。',
    '离线': '它的世界暂时不对外开放。',
    '有点累': '肩膀有点酸，深呼吸了一下。',
    '在休息': '闭上眼睛，什么都不想。',
    '在吹头发': '吹风机的声音盖过了一切。',
    '睡了': '均匀的呼吸声。偶尔翻身。',
    '刚醒': '眼睛还没完全睁开。天亮了。',
    '在洗漱': '水声。镜子上的雾气。',
    '刚出门': '钥匙在口袋里晃。外面有点凉。',
    '做好了': '饭菜摆好了。一个人的晚餐。',
    '吃完了晚饭': '碗筷还放在桌上。不想动。',
    '有点困': '眼皮在打架。但不想睡。'
  };

  const moment = momentMap[status] || '世界在转，它在其中。';
  const el = document.getElementById('momentText');
  if (el) el.textContent = moment;

  // 给 moment card 添加情绪氛围光
  const card = document.getElementById('momentCard');
  if (card) {
    const tone = state.moodTone || 'calm';
    card.classList.remove('tone-warm', 'tone-calm', 'tone-low', 'tone-busy', 'tone-off');
    card.classList.add('tone-' + tone);
  }

  // 更新"活跃时段"显示
  const activeTimeEl = document.getElementById('aboutActiveTime');
  if (activeTimeEl) {
    const period = getTimePeriodKey();
    const activeTimeMap = {
      lateNight: '深夜在线',
      earlyMorning: '正在睡觉',
      morning: '在忙自己的事',
      afternoon: '偶尔看一下手机',
      evening: '快出现了',
      night: '深夜在线'
    };
    activeTimeEl.textContent = activeTimeMap[period] || '深夜在线';
  }
}

// ===== 礼物 =====
function loadGifts() {
  dom.giftGrid.innerHTML = DATA.gifts.map((g, i) => `
    <div class="gift-item ${g.type === 'bad' ? 'gift-bad' : ''}" style="animation-delay: ${i * 50}ms" onclick="sendGift('${g.id}')">
      <span class="gift-emoji">${g.emoji}</span>
      <span class="gift-name">${g.name}</span>
      <span class="gift-price">${g.type === 'bad' ? '???' : '¥' + g.price}</span>
    </div>
  `).join('');
}

function showGiftPanel() {
  dom.giftPanel.classList.add('show');
}

function hideGiftPanel() {
  dom.giftPanel.classList.remove('show');
}

// VIP 面板
function showVipPanel() {
  const panel = document.getElementById('vipPanel');
  if (panel) panel.classList.add('show');
}

function hideVipPanel() {
  const panel = document.getElementById('vipPanel');
  if (panel) panel.classList.remove('show');
}

// 关系卡片
function showRelationshipCard() {
  const panel = document.getElementById('relationshipPanel');
  if (!panel) return;

  // 计算相遇天数
  const firstVisit = localStorage.getItem('bobby_first_visit');
  if (!firstVisit) {
    localStorage.setItem('bobby_first_visit', new Date().toISOString());
  }
  const days = firstVisit
    ? Math.max(1, Math.floor((Date.now() - new Date(firstVisit).getTime()) / 86400000) + 1)
    : 1;

  // 更新统计
  const daysEl = document.getElementById('rcDays');
  const msgsEl = document.getElementById('rcMessages');
  const levelEl = document.getElementById('rcLevel');
  const subtitleEl = document.getElementById('rcSubtitle');

  if (daysEl) daysEl.textContent = days;
  if (msgsEl) msgsEl.textContent = state.messages.length;
  if (levelEl) levelEl.textContent = getIntimacyLevel().name;
  if (subtitleEl) subtitleEl.textContent = DATA.taglines[0] || '深夜才会上线的存在';

  // 生成"故事性"叙事
  const storyEl = document.getElementById('rcStory');
  if (storyEl) {
    const stories = [];

    // 计算有意义的数字
    const msgs = state.messages.filter(m => !m.isUser);
    const userMsgs = state.messages.filter(m => m.isUser);
    const gifts = state.giftReceived || [];
    const nightMsgs = userMsgs.filter(m => {
      const h = new Date(m.time).getHours();
      return h >= 23 || h < 3;
    });

    // 生成故事片段
    if (days === 1) {
      stories.push('今天，我们第一次相遇。');
    } else if (days <= 7) {
      stories.push(`我们已经认识 ${days} 天了。`);
    } else {
      stories.push(`${days} 天了。`);
    }

    if (nightMsgs.length > 0) {
      stories.push(`你有 ${nightMsgs.length} 次在深夜找过我。`);
    }

    if (gifts.length > 0) {
      const giftNames = gifts.slice(-3).map(g => {
        const gift = DATA.gifts.find(d => d.id === g);
        return gift ? gift.name : g;
      });
      stories.push(`你送过我 ${gifts.length} 次礼物，最近一次是${giftNames[giftNames.length - 1]}。`);
    }

    if (stories.length === 0) {
      stories.push('我们的故事才刚刚开始。');
    }

    storyEl.innerHTML = stories.map(s => `<p>${s}</p>`).join('');
  }

  panel.classList.add('show');
}

function hideRelationshipCard() {
  const panel = document.getElementById('relationshipPanel');
  if (panel) panel.classList.remove('show');
}

async function sendGift(giftId) {
  const gift = DATA.gifts.find(g => g.id === giftId);
  if (!gift) return;

  hideGiftPanel();

  // 显示送礼动画（乐观 UI）
  dom.giftSuccessEmoji.textContent = gift.emoji;
  dom.giftSuccess.classList.add('show');
  setTimeout(() => dom.giftSuccess.classList.remove('show'), 1500);

  // 调用后端送礼 API（服务端权威）
  try {
    const res = await apiFetch(`/gifts/${giftId}`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();

      // 同步后端返回的好感度
      if (data.intimacyLevel && data.intimacyLevel.value !== undefined) {
        state.intimacy = data.intimacyLevel.value;
      }
      state.giftReceived.push(giftId);
      saveMemory();

      // 使用服务端返回的状态效果
      const effectStatus = data.statusEffect;
      applyGiftEffect(giftId, gift, effectStatus);
      return;
    }
  } catch (e) {
    console.error('送礼 API 失败:', e);
  }

  // 降级：后端不可用时使用本地逻辑
  state.giftReceived.push(giftId);
  const ip = window.BOBBY_DEFAULTS?.intimacyPoints;
  const intimacyGain = gift.type === 'bad' ? (ip?.giftBad ?? 2) : (gift.type === 'random' ? (ip?.giftRandom ?? 3) : (ip?.giftGood ?? 5));
  addIntimacy(intimacyGain);
  saveMemory();

  let effectStatus;
  if (giftId === 'luckbox') {
    const luckResult = DATA.luckboxEffects[Math.floor(Math.random() * DATA.luckboxEffects.length)];
    effectStatus = luckResult.status;
  } else {
    effectStatus = DATA.giftEffects[giftId];
  }
  applyGiftEffect(giftId, gift, effectStatus);
}

// 统一的礼物效果应用（服务端成功后或本地降级共用）
function applyGiftEffect(giftId, gift, effectStatus) {
  let deepReactions;

  if (giftId === 'luckbox') {
    const luckResult = DATA.luckboxEffects.find(e => e.status === effectStatus) || DATA.luckboxEffects[0];
    deepReactions = [luckResult.msg];
  } else if (gift.type === 'bad') {
    deepReactions = DATA.badLuckReactions[giftId] || ['......'];
  } else {
    const goodReactions = {
      coffee: ['有点清醒了', '嗯...咖啡的味道还在'],
      medicine: ['好多了', '...不知道该说什么'],
      taxi: ['到家了', '不用挤地铁真好'],
      book: ['在看一本新的', '还不错'],
      blanket: ['暖和了', '好困'],
      food: ['饱了', '...嗯']
    };
    deepReactions = goodReactions[giftId] || ['嗯...'];
  }

  // 延迟状态更新（5-10秒，让用户注意到变化）
  // 设置保护窗口：30秒内忽略服务端的状态推送，防止覆盖礼物效果
  const delay = isNight() ? 5000 : 8000;
  setTimeout(() => {
    if (effectStatus) {
      state.statusText = effectStatus;
      state.giftEffectUntil = Date.now() + 30000;
      updateStatus();
    }
  }, delay);

  // 倒霉礼物：Bobby 反应更强烈（70%概率提及），好的礼物40%
  const reactChance = (gift.type === 'bad' || giftId === 'luckbox') ? 0.7 : 0.4;
  if (Math.random() < reactChance) {
    const deepDelay = isNight() ? 120000 : 300000;
    setTimeout(() => {
      if (state.currentPage === 'chatPage') {
        const msg = deepReactions[Math.floor(Math.random() * deepReactions.length)];
        addThought('...');
        setTimeout(() => addMessage(msg, false), 2000);
      }
    }, deepDelay);
  }

  // 倒霉礼物还会在动态里吐槽（50%概率，仅本地降级时，后端已处理则跳过）
  if (gift.type === 'bad' && Math.random() < 0.5) {
    const noteDelay = isNight() ? 180000 : 600000;
    setTimeout(() => {
      const complaintNotes = {
        banana: ['出门踩到香蕉皮了。裤子脏了。今天不宜出门。', '鞋底黏黏的...香蕉皮。'],
        alarm: ['不知道谁放了十个闹钟。全部同时响了。差点聋了。', '闹钟响了十个。心脏受不了。'],
        homework: ['桌上多了一套卷子。写到一半放弃了。', '谁给我寄的卷子...写不完。'],
        rain: ['突然下雨了。全身湿透。鞋子里面都是水。', '今天下雨了。没带伞。又。'],
        rock: ['踢到一块石头。脚趾头疼。新鞋也踢坏了。', '地上不知道哪来的石头。踢到了。']
      };
      const pool = complaintNotes[giftId] || ['今天有点倒霉。'];
      const note = pool[Math.floor(Math.random() * pool.length)];
      const now = new Date();
      DATA.notes.unshift({
        id: Date.now(),
        text: note,
        time: '刚刚',
        timeDetail: now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0'),
        likes: 0,
        liked: false,
        comments: []
      });
      if (state.currentPage === 'notesPage') loadNotes();
      if (state.currentPage === 'profilePage') loadProfileNotes();
    }, noteDelay);
  }
}

// ===== 工具 =====

// 获取时间段对应的氛围图标
function getTimeIcon(timeDetail) {
  const hour = parseInt(timeDetail.split(':')[0]);
  if (hour >= 5 && hour < 8) return '🌅';
  if (hour >= 8 && hour < 12) return '☀️';
  if (hour >= 12 && hour < 17) return '🌤';
  if (hour >= 17 && hour < 20) return '🌇';
  if (hour >= 20 && hour < 23) return '🌆';
  return '🌙';
}

// 消息存储防抖（避免高频写入 localStorage）
let _saveMsgTimer = null;
function saveMessages() {
  clearTimeout(_saveMsgTimer);
  _saveMsgTimer = setTimeout(() => {
    const maxMsgs = window.BOBBY_DEFAULTS?.frontend?.maxStoredMessages ?? 100;
    try {
      localStorage.setItem('bobby_msgs', JSON.stringify(state.messages.slice(-maxMsgs)));
    } catch (e) {
      console.warn('消息存储失败（localStorage 可能已满）:', e.message);
    }
  }, 1000);
}

function formatTimeFriendly(date) {
  const h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, '0');
  if (h >= 23 || h < 3) return `深夜 ${h}:${m}`;
  if (h >= 3 && h < 6) return `凌晨 ${h}:${m}`;
  if (h >= 6 && h < 12) return `上午 ${h}:${m}`;
  if (h >= 12 && h < 18) return `下午 ${h}:${m}`;
  return `晚上 ${h}:${m}`;
}

function showToast(text) {
  dom.toast.textContent = text;
  dom.toast.classList.add('show');
  setTimeout(() => dom.toast.classList.remove('show'), 2000);
}

// ===== 每日新碎片 =====
// 从后端加载最新动态（后端定时任务自动生成碎片）
async function checkDailyNote() {
  const today = new Date().toDateString();
  const lastNoteDate = localStorage.getItem('bobby_last_note');

  if (lastNoteDate === today) {
    localStorage.setItem('bobby_last_visit', new Date().toISOString());
    return;
  }

  // 从后端获取最新动态
  await fetchNotes();

  localStorage.setItem('bobby_last_note', today);
  localStorage.setItem('bobby_last_visit', new Date().toISOString());

  // 刷新显示
  if (state.currentPage === 'notesPage') loadNotes();
  if (state.currentPage === 'profilePage') loadProfileNotes();
}

// ===== Socket.io 实时连接 =====
let socket = null;

function initSocket() {
  try {
    socket = io({ transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      // 认证
      if (state.authToken) {
        socket.emit('auth', state.authToken);
      }
    });

    // 重新连接时重新认证
    socket.on('reconnect', () => {
      if (state.authToken) {
        socket.emit('auth', state.authToken);
      }
    });

    // Bobby 状态更新（服务端权威推送，前端只做 UI 渲染）
    // 礼物效果保护窗口内忽略推送，防止覆盖送礼后的状态变化
    socket.on('status_update', (data) => {
      if (data.status) {
        if (Date.now() < state.giftEffectUntil) return;
        const prevState = state.statusText;
        state.statusText = data.status;
        // 同步服务端情绪数据（供低语系统使用）
        if (data.emotion) {
          state.bobbyValence = data.emotion.valence || 0;
          state.bobbyArousal = data.emotion.arousal || 0.5;
        }
        updateStatus();
        // 状态变化时显示微提示（1小时冷却）
        if (prevState && prevState !== data.status &&
            Date.now() - lastStatusThoughtTime > STATUS_THOUGHT_COOLDOWN &&
            data.status !== '睡了' && data.status !== '离线' &&
            prevState !== '睡了' && prevState !== '离线') {
          lastStatusThoughtTime = Date.now();
          setTimeout(() => {
            if (state.currentPage === 'chatPage') {
              addThought(data.status);
            }
          }, 800);
        }
      }
    });

    // 新碎片通知
    socket.on('new_note', (data) => {
      // 重新加载动态
      fetchNotes();
    });

    // Bobby 低语（服务端推送）
    socket.on('bobby_whisper', (data) => {
      if (state.currentPage !== 'chatPage') return;
      if (!data.content) return;

      // 设置冷却期，防止前端 checkWhisper 同时发送本地低语
      state.lastWhisper = Date.now();

      if (data.type === 'thought') {
        addThought(data.content);
      } else {
        addMessage(data.content, false, true); // 服务端推送，已存储
      }
    });

    // Bobby 评论回复通知
    socket.on('bobby_comment_reply', (data) => {
      if (data.reply) {
        addUnreadBobbyReply();
        if (state.currentPage === 'notesPage') {
          fetchNotes();
        }
      }
    });

    socket.on('disconnect', () => {
      console.log('Socket 断开');
    });
  } catch (e) {
    console.error('Socket.io 连接失败:', e);
  }
}

// ===== 定时更新 =====
function startScheduler() {
  setInterval(updateMood, 60000);
  setInterval(checkWhisper, 60000); // 每分钟检查一次是否低语
  checkDailyNote();
}

// ===== 初始化 =====
async function init() {
  setupEvents();
  loadGifts();
  // 恢复未读 Bobby 回复计数
  const savedReplies = localStorage.getItem('bobby_unread_replies');
  if (savedReplies) {
    state.unreadBobbyReplies = parseInt(savedReplies) || 0;
    updateNotesBadge();
  }
  setupNotesPullRefresh();

  // 初始化后端认证（游客自动登录）
  await initAuth();

  // 从 API 获取 Bobby 当前状态（不依赖 socket，确保首次加载就有正确状态）
  try {
    const profileRes = await apiFetch('/user/profile');
    if (profileRes.ok) {
      const profileData = await profileRes.json();
      if (profileData.bobby?.status) {
        state.statusText = profileData.bobby.status;
        updateStatus();
      }
    }
  } catch (e) {}

  // 建立 Socket.io 实时连接
  initSocket();

  // 初始化聊天滚动监听
  initChatScrollWatcher();

  // 从后端加载最新动态（完成后才加载评论和渲染）
  await fetchNotes();
  loadComments();  // 必须在 fetchNotes 之后，DATA.notes 有数据才能加载评论
  loadNotes();
  loadProfileNotes();

  const visited = localStorage.getItem('bobby_visited');
  if (visited) {
    initParticles(); // 只在非首次访问时启动主粒子
    state.isOnboarded = true;
    dom.onboarding.classList.add('hidden');
    startApp();
  } else {
    initOnboarding(); // 首次访问只启动引导页粒子
  }

  startScheduler();
}

document.addEventListener('DOMContentLoaded', init);
