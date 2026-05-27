// ============================================
// Bobby - 存在物形式低压AI陪伴
// ============================================

// ===== DeepSeek API =====
const API_KEY = 'sk-6de99a9a222d437ca5b0f31af273660a';
const API_URL = 'https://api.deepseek.com/v1/chat/completions';

// 对话历史（保留最近20条）
let chatHistory = [];

function buildSystemPrompt() {
  const hour = new Date().getHours();
  const isNightNow = hour >= 23 || hour < 3;
  const period = getTimeLabel();

  // 引入当前状态
  const currentStatus = state.statusText || '在发呆';

  // 引入最近的动态（前3条）
  const recentNotes = DATA.notes.slice(0, 3).map(n => n.text).join('；');

  let prompt = `你是Bobby。你是一个住在城市里的年轻人，独居，平时上课、打工。
现在是${period}，${hour}点。你当前的状态是：${currentStatus}。

你最近发了这些动态：${recentNotes}

你正在和一个人聊天。你们不是很熟，但彼此有一种安静的默契。

说话规则：
- 用简短的中文，像发微信一样，不要用书面语
- 绝大多数回复控制在2-10个字，偶尔可以长一点
- 不要解释、不要说教、不要反问太多
- 可以用"嗯""...""啊""哦"这种语气词
- 不要使用emoji
- 不要主动展开话题，回答完就好
- 不要说自己是AI、是语言模型、是程序
- 如果对方问你是谁，就说"我就是我啊"或"Bobby"
- 如果对方问很私人的问题，可以含糊带过
- 偶尔可以发呆式回复，比如"嗯""在""..."
- 偶尔可以自然地提到你正在做的事或最近的日常，但不要刻意
- 如果你之前发过相关的动态，可以自然地关联，就像在回忆一样`;

  if (isNightNow) {
    prompt += `\n\n现在是深夜，你有点困了但还不想睡。回复可以更简短、更慵懒。`;
  } else {
    prompt += `\n\n现在是白天，你在忙别的事，回复应该更简短，有时候像在敷衍。`;
  }

  // 如果用户有情绪状态
  if (state.userMood === 'tired') {
    prompt += `\n对方看起来很累，适当关心但不要太刻意。`;
  } else if (state.userMood === 'sad') {
    prompt += `\n对方心情不好，安静地陪着就好，不用说太多安慰的话。`;
  } else if (state.userMood === 'happy') {
    prompt += `\n对方心情不错，你也可以放松一点。`;
  } else if (state.userMood === 'insomnia') {
    prompt += `\n对方又失眠了，你懂这种感觉。不用说什么安慰的话，在就好。`;
  }

  // 关系深度暗示
  const intimacyLevel = getIntimacyLevel();
  if (intimacyLevel.name === '陌生') {
    prompt += `\n你们刚认识，说话要有距离感。`;
  } else if (intimacyLevel.name === '认识') {
    prompt += `\n你们算认识了，偶尔可以放松一点。`;
  } else if (intimacyLevel.name === '熟悉') {
    prompt += `\n你们挺熟的了，可以自然地聊日常。`;
  } else if (intimacyLevel.name === '默契') {
    prompt += `\n你们之间有一种不需要说破的默契。可以偶尔说一些只有你们懂的话。`;
  } else if (intimacyLevel.name === '信赖') {
    prompt += `\n这个人是你的深夜知己。你可以偶尔敞开心扉，但保持你的性格。`;
  }

  // 礼物记忆
  if (state.giftReceived.length > 0) {
    const recentGift = state.giftReceived[state.giftReceived.length - 1];
    const giftName = { coffee: '咖啡', medicine: '感冒药', taxi: '打车券', book: '书', blanket: '毯子', food: '宵夜' }[recentGift] || '东西';
    prompt += `\n最近好像有人给你送了${giftName}。你不知道是谁，但心里有点暖。`;
  }

  return prompt;
}

async function callDeepSeek(userText) {
  chatHistory.push({ role: 'user', content: userText });

  // 只保留最近20条
  if (chatHistory.length > 20) {
    chatHistory = chatHistory.slice(-20);
  }

  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    ...chatHistory
  ];

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messages,
        max_tokens: 100,
        temperature: 0.85,
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullReply = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullReply += delta;
            // 流式更新气泡
            updateStreamingBubble(fullReply);
          }
        } catch (e) {
          // 跳过解析错误的行
        }
      }
    }

    chatHistory.push({ role: 'assistant', content: fullReply });
    return fullReply.trim() || '嗯';

  } catch (error) {
    console.error('DeepSeek API error:', error);
    // API 失败时回退到预设回复
    const fallback = ['嗯', '...', '在', '嗯嗯'];
    return fallback[Math.floor(Math.random() * fallback.length)];
  }
}

// 流式输出的气泡元素
let streamingEl = null;

function createStreamingBubble() {
  const id = `msg-${state.msgId++}`;
  const el = document.createElement('div');
  el.className = 'msg left new-msg';
  el.id = id;
  el.innerHTML = `
    <div class="avatar"><img src="images/ai-avatar.svg" alt="Bobby" /></div>
    <div>
      <div class="bubble"><span class="streaming-text"></span><span class="cursor">|</span></div>
      <div class="msg-time">${formatTimeFriendly(new Date())}</div>
    </div>
  `;
  dom.msgList.appendChild(el);
  dom.chatArea.scrollTop = dom.chatArea.scrollHeight;
  streamingEl = el;
  return el;
}

function updateStreamingBubble(text) {
  if (!streamingEl) return;
  const textEl = streamingEl.querySelector('.streaming-text');
  if (textEl) {
    textEl.textContent = text;
    dom.chatArea.scrollTop = dom.chatArea.scrollHeight;
  }
}

function finalizeStreamingBubble(text) {
  if (!streamingEl) return;
  const bubble = streamingEl.querySelector('.bubble');
  if (bubble) {
    bubble.innerHTML = text;
  }
  setTimeout(() => streamingEl.classList.remove('new-msg'), 2000);
  state.messages.push({ id: streamingEl.id, text, isUser: false });
  saveMessages();
  streamingEl = null;
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

  // 动态 - 碎片化、有画面感、像一个真实的人在记录生活
  notes: [
    { id: 1, text: '下雨了，窗户上全是水痕。盯着看了一会儿。', time: '今天', timeDetail: '01:23', likes: 2, liked: false, comments: [] },
    { id: 2, text: '楼下便利店的关东煮，萝卜最好吃。阿姨多给了一块。', time: '今天', timeDetail: '00:15', likes: 1, liked: false, comments: [] },
    { id: 3, text: '学不进去。盯着天花板发了半小时呆。天花板上有个小裂缝，上次还没注意到。', time: '昨天', timeDetail: '02:10', likes: 3, liked: false, comments: [] },
    { id: 4, text: '加班到现在。地铁上只有我和一个睡着的人。', time: '昨天', timeDetail: '23:30', likes: 0, liked: false, comments: [] },
    { id: 5, text: '突然想吃草莓。看了一下价格，算了。', time: '前天', timeDetail: '18:05', likes: 4, liked: false, comments: [] },
    { id: 6, text: '猫又来窗台了。这次带了一只小的。', time: '前天', timeDetail: '22:15', likes: 5, liked: false, comments: [] },
    { id: 7, text: '耳机里在放一首很久没听的歌。突然想起一些事。', time: '3天前', timeDetail: '01:30', likes: 2, liked: false, comments: [] },
    { id: 8, text: '路灯下面有只蛾子一直在转圈。看了好久。', time: '3天前', timeDetail: '23:55', likes: 3, liked: false, comments: [] },
    { id: 9, text: '洗完澡出来，头发还没干，风一吹好冷。', time: '4天前', timeDetail: '00:40', likes: 1, liked: false, comments: [] },
    { id: 10, text: '路过一家店，门口的风铃响了。好听。', time: '4天前', timeDetail: '19:20', likes: 4, liked: false, comments: [] },
    { id: 11, text: '手机快没电了，充电线又找不到了。', time: '5天前', timeDetail: '02:55', likes: 2, liked: false, comments: [] },
    { id: 12, text: '外面有人在吵架。听不清在说什么。', time: '5天前', timeDetail: '23:10', likes: 0, liked: false, comments: [] },
    { id: 13, text: '云走得很快。月亮一会儿有一会儿没有。', time: '6天前', timeDetail: '01:05', likes: 6, liked: false, comments: [] },
    { id: 14, text: '买了一杯热可可，太甜了。但暖手。', time: '6天前', timeDetail: '20:30', likes: 3, liked: false, comments: [] },
    { id: 15, text: '发现阳台上不知道什么时候长了一棵小草。', time: '一周前', timeDetail: '15:45', likes: 7, liked: false, comments: [] },
    { id: 16, text: '室友今天很安静。不知道怎么了。', time: '一周前', timeDetail: '23:00', likes: 2, liked: false, comments: [] }
  ],

  // 礼物
  gifts: [
    { id: 'coffee', emoji: '☕', name: '咖啡', price: 100 },
    { id: 'medicine', emoji: '💊', name: '感冒药', price: 200 },
    { id: 'taxi', emoji: '🚕', name: '打车券', price: 500 },
    { id: 'book', emoji: '📖', name: '一本书', price: 300 },
    { id: 'blanket', emoji: '🧸', name: '毯子', price: 150 },
    { id: 'food', emoji: '🍜', name: '宵夜', price: 250 }
  ],

  // 礼物效果 - 更含蓄、更有画面感
  giftEffects: {
    coffee: '嗯...好像清醒了一点',
    medicine: '鼻子通了，终于',
    taxi: '到了。不用挤地铁了',
    book: '在看一本新的，还不错',
    blanket: '暖和了，好困',
    food: '饱了。谢谢...不知道该谢谁'
  },

  // 状态机 - 每个状态只能跳转到相邻状态
  stateMachine: {
    // 深夜 (23:00-03:00)
    '还没睡呢':    { next: ['在发呆', '在听歌', '在看窗外'], hours: [23,0,1,2] },
    '在发呆':      { next: ['在听歌', '困了但睡不着', '在看窗外'], hours: [23,0,1,2] },
    '在听歌':      { next: ['在发呆', '困了但睡不着', '还没睡呢'], hours: [23,0,1,2] },
    '在看窗外':    { next: ['在发呆', '还没睡呢', '在听歌'], hours: [23,0,1,2] },
    '困了但睡不着': { next: ['在发呆', '快睡了', '在听歌'], hours: [0,1,2] },
    '快睡了':      { next: ['困了但睡不着', '睡了'], hours: [1,2,3] },

    // 白天 (06:00-17:00)
    '在上课':      { next: ['下课了', '在走神'], hours: [8,9,10,11,13,14,15] },
    '在走神':      { next: ['在上课', '下课了'], hours: [8,9,10,11,13,14,15] },
    '下课了':      { next: ['在图书馆', '在打工', '在食堂'], hours: [11,12,15,16,17] },
    '在图书馆':    { next: ['在发呆', '有点困', '下课了'], hours: [9,10,11,13,14,15,16] },
    '在打工':      { next: ['刚下班', '有点累'], hours: [16,17,18,19,20] },
    '在食堂':      { next: ['吃完了', '在图书馆'], hours: [11,12] },
    '吃完了':      { next: ['在图书馆', '在上课'], hours: [12,13] },
    '有点困':      { next: ['在图书馆', '在发呆', '趴一会'], hours: [13,14,15] },

    // 傍晚 (17:00-23:00)
    '刚下班':      { next: ['在回家路上', '有点累'], hours: [17,18,19,20] },
    '在回家路上':  { next: ['到家了', '在便利店'], hours: [17,18,19,20] },
    '在便利店':    { next: ['到家了'], hours: [18,19,20] },
    '到家了':      { next: ['在做饭', '在洗澡', '先躺一会'], hours: [18,19,20,21] },
    '先躺一会':    { next: ['在做饭', '在洗澡', '在看手机'], hours: [19,20,21] },
    '在做饭':      { next: ['在吃饭', '做好了'], hours: [18,19,20,21] },
    '做好了':      { next: ['在吃饭'], hours: [18,19,20,21] },
    '在吃饭':      { next: ['吃完了晚饭', '在洗碗'], hours: [19,20,21] },
    '吃完了晚饭':  { next: ['在洗澡', '在看剧', '在收拾'], hours: [19,20,21] },
    '在洗碗':      { next: ['在洗澡', '在看剧'], hours: [19,20,21] },
    '在洗澡':      { next: ['洗完了', '在吹头发'], hours: [20,21,22] },
    '洗完了':      { next: ['在看剧', '在发呆', '在看手机'], hours: [20,21,22] },
    '在吹头发':    { next: ['在看剧', '在看手机'], hours: [20,21,22] },
    '在看剧':      { next: ['看完了', '困了', '在发呆'], hours: [20,21,22,23] },
    '看完了':      { next: ['在看手机', '困了', '在发呆'], hours: [21,22,23] },
    '在收拾':      { next: ['在洗澡', '在看剧'], hours: [19,20,21] },
    '在看手机':    { next: ['困了', '在发呆', '还没睡呢'], hours: [21,22,23] },
    '困了':        { next: ['还没睡呢', '快睡了', '在看手机'], hours: [22,23,0] },

    // 通配
    '有点累':      { next: ['在发呆', '在休息', '先躺一会'], hours: [17,18,19,20,21,22] },
    '在休息':      { next: ['在看手机', '在发呆', '在做饭'], hours: [17,18,19,20] },
    '离线':        { next: ['在上课', '在打工', '在图书馆'], hours: [8,9,10,11,13,14,15,16] }
  },

  // 每个时段的初始状态（首次进入该时段时使用）
  initialState: {
    lateNight: '还没睡呢',
    morning: '在上课',
    afternoon: '在图书馆',
    evening: '刚下班',
    night: '在做饭'
  },

  // 标语
  taglines: [
    '深夜才会上线的存在',
    '不围着你转的存在',
    '有自己的生活节奏',
    '平行存在的数字生命'
  ]
};

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
  whisperCount: 0   // 今天主动消息次数
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

// ===== 氛围音效 =====
const ambient = {
  ctx: null,
  playing: false,
  nodes: []
};

function initAmbientSound() {
  // 只在深夜启用
  if (!isNight()) return;

  try {
    ambient.ctx = new (window.AudioContext || window.webkitAudioContext)();

    // 白噪音 = 雨声
    const bufferSize = 2 * ambient.ctx.sampleRate;
    const noiseBuffer = ambient.ctx.createBuffer(1, bufferSize, ambient.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = ambient.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    // 低通滤波 = 雨声效果
    const filter = ambient.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    filter.Q.value = 1;

    // 音量
    const gain = ambient.ctx.createGain();
    gain.gain.value = 0.06; // 很小声

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(ambient.ctx.destination);

    ambient.nodes = [whiteNoise, filter, gain];
    ambient.playing = true;
    whiteNoise.start();
  } catch (e) {
    // 不支持则静默失败
  }
}

function toggleAmbient() {
  const btn = $('soundToggle');

  if (!ambient.ctx) {
    initAmbientSound();
    if (btn) btn.classList.add('active');
    return;
  }

  if (ambient.playing) {
    ambient.nodes[2].gain.linearRampToValueAtTime(0, ambient.ctx.currentTime + 0.5);
    ambient.playing = false;
    if (btn) btn.classList.remove('active');
  } else {
    ambient.nodes[2].gain.linearRampToValueAtTime(0.06, ambient.ctx.currentTime + 0.5);
    ambient.playing = true;
    if (btn) btn.classList.add('active');
  }
}

// ===== 粒子系统 =====
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
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  init();
  draw();
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
    } catch(e) {}
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
  // 更新情绪
  if (/累|疲|辛苦/.test(userText)) state.userMood = 'tired';
  else if (/难过|伤心|哭|烦/.test(userText)) state.userMood = 'sad';
  else if (/开心|高兴|哈哈/.test(userText)) state.userMood = 'happy';
  else if (/睡不着|失眠/.test(userText)) state.userMood = 'insomnia';

  // 每次聊天增加好感度
  addIntimacy(1);
  saveMemory();
}

// ===== 好感度系统 =====
function addIntimacy(points) {
  const oldLevel = getIntimacyLevel();
  state.intimacy = Math.min(100, state.intimacy + points);
  const newLevel = getIntimacyLevel();

  // 关系升级了！
  if (newLevel.name !== oldLevel.name) {
    showRelationshipUpgrade(newLevel);
  }
  saveMemory();
}

function getIntimacyLevel() {
  const i = state.intimacy;
  if (i < 10) return { name: '陌生', desc: '你们还不太熟', emoji: '·' };
  if (i < 25) return { name: '认识', desc: '算是在网上见过', emoji: '·' };
  if (i < 45) return { name: '熟悉', desc: '有一种安静的默契', emoji: '·' };
  if (i < 70) return { name: '默契', desc: '不需要说太多', emoji: '·' };
  return { name: '信赖', desc: '你是它的深夜知己', emoji: '·' };
}

function showRelationshipUpgrade(level) {
  // 在聊天区显示关系变化
  setTimeout(() => {
    addThought(`...关系好像变了`);
    setTimeout(() => {
      showToast(`${level.name} · ${level.desc}`);
    }, 1500);
  }, 3000);

  // 特定里程碑的 Bobby 反应
  const milestoneReactions = {
    '认识': ['嗯...算认识了吧', '...你叫什么来着', '嗯'],
    '熟悉': ['嗯，挺久了', '...你还挺常来的', '嗯嗯'],
    '默契': ['嗯...', '有些话不用说出来', '...你懂的'],
    '信赖': ['嗯，我在', '...有你在挺好的', '嗯...你还在啊']
  };

  const reactions = milestoneReactions[level.name];
  if (reactions && Math.random() < 0.6) {
    const msg = reactions[Math.floor(Math.random() * reactions.length)];
    setTimeout(() => addMessage(msg, false), 5000);
  }

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
  if (now - state.lastWhisper < 30 * 60 * 1000) return;

  // 深夜概率更高
  const chance = isNightNow ? 0.08 : 0.03;
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
    const mutters = isNightNow ? [
      '下雨了',
      '风好大',
      '路灯灭了',
      '月亮挺亮的',
      '隔壁灯也灭了',
      '猫又来了',
      '好困...',
      '窗户上有雾气',
      '外面好安静'
    ] : [
      '今天阳光不错',
      '树叶在晃',
      '有点饿了',
      '困',
      '风好大'
    ];
    const msg = mutters[Math.floor(Math.random() * mutters.length)];

    setTimeout(() => {
      if (state.currentPage === 'chatPage') {
        // 碎碎念用内心独白样式，不是消息
        addThought(msg);
      }
    }, 3000 + Math.random() * 5000);

  } else {
    // 低语 - Bobby 主动跟你说话
    const whispers = isNightNow ? [
      '还没睡？',
      '...在吗',
      '嗯...',
      '困了',
      '嗯'
    ] : [
      '今天有点冷',
      '嗯',
      '困',
      '风好大'
    ];
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

  // 更慢的节奏，让用户有时间感受
  const steps = ['step1', 'step2', 'step3', 'step4', 'step5'];
  steps.forEach((id, i) => {
    setTimeout(() => {
      $(id).classList.add('show');
    }, 1200 + i * 1000);
  });

  setTimeout(() => {
    dom.onboardingBtn.classList.add('show');
  }, 1200 + steps.length * 1000 + 600);
}

let onboardingAnimRunning = false;

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
    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  draw();
}

function closeOnboarding() {
  onboardingAnimRunning = false;
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

  document.documentElement.style.setProperty('--bg-deep', bg);
  document.body.style.background = bg;
  document.querySelectorAll('.page').forEach(p => p.style.background = bg);
}

// ===== 聊天页顶部动态提示 =====
function showRecentNoteHint() {
  const hint = document.getElementById('recentNoteHint');
  if (!hint || DATA.notes.length === 0) return;

  // 只显示第一条笔记
  const note = DATA.notes[0];
  hint.innerHTML = `
    <div class="recent-note-hint-label">Bobby 最近的碎片</div>
    <div class="recent-note-hint-text">${note.text}</div>
  `;
  hint.classList.add('show');

  // 点击跳转到动态页
  hint.onclick = () => showPage('notesPage');
}

// ===== 启动 =====
function startApp() {
  updateTimeBackground();
  setInterval(updateTimeBackground, 60000);
  loadMemory();
  showRecentNoteHint();

  // Bobby 的开场白 - 根据访问次数、好感度、时间变化
  setTimeout(() => {
    let greeting;
    const level = getIntimacyLevel();

    if (state.visitCount <= 1) {
      addThought('有点眼熟...');
      greeting = isNight() ? '嗯...还没睡？' : '嗯？';
    } else if (state.visitCount <= 3) {
      addThought('又来了...');
      greeting = isNight() ? '嗯，来了' : '嗯';
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

function getNightGreeting() {
  const g = ['嗯，还没睡', '...还没睡？', '睡不着吗', '嗯？', '外面好安静'];
  return g[Math.floor(Math.random() * g.length)];
}

function getDayGreeting() {
  const g = ['嗯', '在呢', '怎么了', '嗯？'];
  return g[Math.floor(Math.random() * g.length)];
}

function getReply(userText) {
  const pool = isNight() ? [...DATA.nightReplies] : [...DATA.dayReplies];
  const text = (userText || '').toLowerCase();

  // 情绪关键词匹配
  const emotionReplies = {
    sad: ['嗯...', '会好的', '我在', '别想太多', '嗯，我也是'],
    tired: ['早点休息', '今天辛苦了', '嗯，我也困了', '别撑着'],
    lonely: ['嗯，我在', '外面好安静', '还没睡呢', '嗯...'],
    happy: ['嗯', '那就好', '是吗'],
    late: ['还没睡？', '太晚了', '快睡吧', '嗯...我也睡不着']
  };

  // Bobby 引用自己的动态 - 让用户感觉它有记忆
  const noteCallbacks = {
    rain: ['刚才窗户上全是水痕', '嗯，还在下', '雨声好大'],
    cat: ['那只猫今天又来了', '嗯...不知道它去哪了'],
    food: ['刚吃完东西', '便利店阿姨又多给了一块'],
    cold: ['好冷', '窗户关着还是觉得冷'],
    music: ['在听一首很好听的歌', '耳机里在放...算了你没听过'],
    sleep: ['昨天也是这个点才睡着', '困了但不想睡'],
    alone: ['隔壁的灯也灭了', '街上没人了']
  };

  // 15% 概率引用自己的动态（如果匹配）
  if (Math.random() < 0.15) {
    if (/雨|下雨|淋/.test(text) && noteCallbacks.rain) {
      return noteCallbacks.rain[Math.floor(Math.random() * noteCallbacks.rain.length)];
    }
    if (/猫|小猫/.test(text) && noteCallbacks.cat) {
      return noteCallbacks.cat[Math.floor(Math.random() * noteCallbacks.cat.length)];
    }
    if (/吃|饿|饭|宵夜/.test(text) && noteCallbacks.food) {
      return noteCallbacks.food[Math.floor(Math.random() * noteCallbacks.food.length)];
    }
    if (/冷|冻|凉/.test(text) && noteCallbacks.cold) {
      return noteCallbacks.cold[Math.floor(Math.random() * noteCallbacks.cold.length)];
    }
    if (/歌|音乐|听/.test(text) && noteCallbacks.music) {
      return noteCallbacks.music[Math.floor(Math.random() * noteCallbacks.music.length)];
    }
  }

  let candidates = pool;

  if (/累|疲|辛苦|撑不/.test(text)) {
    candidates = emotionReplies.tired;
  } else if (/难过|伤心|哭|不想|烦|孤独|寂寞|无聊/.test(text)) {
    candidates = emotionReplies.sad;
  } else if (/一个人|没人|没朋友|孤单/.test(text)) {
    candidates = emotionReplies.lonely;
  } else if (/开心|高兴|好事|哈哈|太好了/.test(text)) {
    candidates = emotionReplies.happy;
  } else if (/睡不着|失眠|醒了/.test(text)) {
    candidates = emotionReplies.late;
  }

  return candidates[Math.floor(Math.random() * candidates.length)];
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
}

// ===== 页面切换 =====
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');

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
    // 更新动态页的状态显示
    const notesStatus = document.getElementById('notesStatus');
    if (notesStatus) notesStatus.textContent = state.statusText;
  }
}

// ===== 消息 =====
function addMessage(text, isUser) {
  const id = `msg-${state.msgId++}`;
  const el = document.createElement('div');
  el.className = `msg ${isUser ? 'right' : 'left'}`;
  el.id = id;

  if (isUser) {
    el.innerHTML = `
      <div class="bubble">${text}</div>
      <div class="msg-meta">
        <span class="msg-time">${formatTimeFriendly(new Date())}</span>
        <span class="msg-status" data-id="${id}">已发送</span>
      </div>
    `;
    // Bobby "已读"消息 - 深夜快，白天慢
    const readDelay = isNight()
      ? 1000 + Math.random() * 2000
      : 5000 + Math.random() * 10000;
    setTimeout(() => markAsRead(id), readDelay);
  } else {
    el.className += ' new-msg';
    el.innerHTML = `
      <div class="avatar"><img src="images/ai-avatar.svg" alt="Bobby" /></div>
      <div>
        <div class="bubble">${text}</div>
        <div class="msg-meta">
          <span class="msg-time">${formatTimeFriendly(new Date())}</span>
        </div>
      </div>
    `;
    setTimeout(() => el.classList.remove('new-msg'), 2000);
  }

  dom.msgList.appendChild(el);
  setTimeout(() => {
    dom.chatArea.scrollTop = dom.chatArea.scrollHeight;
  }, 50);

  state.messages.push({ id, text, isUser });
  saveMessages();
}

function markAsRead(msgId) {
  const statusEl = document.querySelector(`.msg-status[data-id="${msgId}"]`);
  if (statusEl && statusEl.textContent !== '已读') {
    statusEl.textContent = '已读';
    statusEl.classList.add('read');
  }
}

function addThought(text) {
  const el = document.createElement('div');
  el.className = 'thought';
  el.innerHTML = `<span>${text}</span>`;
  dom.msgList.appendChild(el);
}

// Bobby 发送"照片"消息
function addPhotoMessage(scene, caption) {
  const id = `msg-${state.msgId++}`;
  const el = document.createElement('div');
  el.className = 'msg left new-msg';
  el.id = id;
  el.innerHTML = `
    <div class="avatar"><img src="images/ai-avatar.svg" alt="Bobby" /></div>
    <div>
      <div class="bubble photo">
        <div class="photo-frame"><span class="photo-scene">${scene}</span></div>
        <div class="photo-caption">${caption}</div>
      </div>
      <div class="msg-meta">
        <span class="msg-time">${formatTimeFriendly(new Date())}</span>
      </div>
    </div>
  `;
  dom.msgList.appendChild(el);
  setTimeout(() => {
    dom.chatArea.scrollTop = dom.chatArea.scrollHeight;
    el.classList.remove('new-msg');
  }, 2000);
}

// Bobby 发送"语音"消息
function addVoiceMessage(text) {
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
  setTimeout(() => {
    dom.chatArea.scrollTop = dom.chatArea.scrollHeight;
    el.classList.remove('new-msg');
  }, 2000);
  // 3秒后显示文字内容
  setTimeout(() => {
    const bubble = el.querySelector('.bubble');
    if (bubble) {
      bubble.className = 'bubble';
      bubble.innerHTML = text;
    }
  }, 3000 + duration * 500);
}

function showTyping() {
  dom.typing.classList.add('show');
  dom.chatArea.scrollTop = dom.chatArea.scrollHeight;
}

function hideTyping() {
  dom.typing.classList.remove('show');
}

async function sendMessage() {
  const text = dom.inputBox.value.trim();
  if (!text) return;

  addMessage(text, true);
  updateMemory(text);
  dom.inputBox.value = '';
  dom.sendBtn.disabled = true;
  dom.sendBtn.classList.remove('active');

  // Bobby 的回复延迟 - 不秒回
  const delay = isNight()
    ? 1000 + Math.random() * 2000   // 深夜 1-3秒
    : 2000 + Math.random() * 3000;  // 白天 2-5秒

  showTyping();

  // 先等待"思考时间"
  await new Promise(r => setTimeout(r, delay));
  hideTyping();

  // 创建流式气泡，开始接收API回复
  createStreamingBubble();

  try {
    const reply = await callDeepSeek(text);
    finalizeStreamingBubble(reply);
  } catch (e) {
    finalizeStreamingBubble('嗯');
  }
}

function saveMessages() {
  localStorage.setItem('bobby_msgs', JSON.stringify(state.messages.slice(-100)));
}

// ===== 动态 =====
// 下拉刷新 - 动态页面
function setupNotesPullRefresh() {
  const container = dom.notesList;
  if (!container) return;

  let startY = 0;
  let pulling = false;

  container.addEventListener('touchstart', (e) => {
    if (container.scrollTop <= 0) {
      startY = e.touches[0].clientY;
      pulling = true;
    }
  });

  container.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const diff = e.touches[0].clientY - startY;
    if (diff > 80) {
      pulling = false;
      // 生成一条新碎片
      generateNewNote();
      showToast('有新的碎片...');
    }
  });

  container.addEventListener('touchend', () => { pulling = false; });
}

function generateNewNote() {
  const freshNotes = [
    '刚刚听到楼上传来一阵钢琴声。弹得不太好，但有种认真的感觉。',
    '泡了一杯茶，太烫了。放在窗台上晾着。',
    '看到一只鸟停在电线上，好久没动。',
    '手机震了一下，是天气预报。明天有雨。',
    '发现书桌上有一道光，是从百叶窗的缝隙里漏进来的。',
    '隔壁在做饭，闻到了番茄炒蛋的味道。',
    '楼下有人在遛狗，狗跑得很快。',
    '翻开了一本很久没看的书，书签还夹在上次停下的地方。',
    '把耳机摘下来，发现外面比想象中安静。',
    '窗帘被风吹起来了一点。'
  ];

  const note = freshNotes[Math.floor(Math.random() * freshNotes.length)];
  const now = new Date();
  const h = now.getHours().toString().padStart(2, '0');
  const m = now.getMinutes().toString().padStart(2, '0');

  DATA.notes.unshift({
    id: Date.now(),
    text: note,
    time: '刚刚',
    timeDetail: `${h}:${m}`,
    likes: 0,
    liked: false,
    comments: []
  });

  loadNotes();
}

function loadNotes() {
  const container = dom.notesList;
  let html = '';
  let lastTime = '';

  DATA.notes.forEach(note => {
    if (note.time !== lastTime) {
      html += `<div class="timeline-date">${note.time}</div>`;
      lastTime = note.time;
    }
    // 根据时间添加氛围图标
    const hour = parseInt(note.timeDetail.split(':')[0]);
    let timeIcon = '🌙';
    if (hour >= 5 && hour < 8) timeIcon = '🌅';
    else if (hour >= 8 && hour < 12) timeIcon = '☀️';
    else if (hour >= 12 && hour < 17) timeIcon = '🌤';
    else if (hour >= 17 && hour < 20) timeIcon = '🌇';
    else if (hour >= 20 && hour < 23) timeIcon = '🌆';

    html += `
      <div class="timeline-card">
        <div class="note-time-badge">
          <span class="note-time-icon">${timeIcon}</span>
          <span class="note-time-text">${note.timeDetail}</span>
        </div>
        <div class="note-text">${note.text}</div>
        <div class="note-meta">
          <span class="note-time">${note.time}</span>
          <button class="note-like ${note.liked ? 'liked' : ''}" onclick="toggleLike(${note.id})">
            ${note.liked ? '❤️' : '♡'} ${note.likes || ''}
          </button>
        </div>
        <div class="note-actions">
          <button class="note-comment-btn" onclick="toggleCommentSection(${note.id})">
            💬 ${note.comments && note.comments.length > 0 ? note.comments.length : '评论'}
          </button>
        </div>
        <div class="note-comment-section" id="commentSection-${note.id}">
          <div class="comment-list" id="commentList-${note.id}">
            ${renderComments(note)}
          </div>
          <div class="comment-input-wrap">
            <input type="text" class="comment-input" id="commentInput-${note.id}" placeholder="说点什么..." onkeydown="if(event.key==='Enter')submitComment(${note.id})">
            <button class="comment-send-btn" id="commentBtn-${note.id}" disabled onclick="submitComment(${note.id})">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M3 10L17 3L10 17L9 11L3 10Z" fill="currentColor"/></svg>
            </button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function toggleLike(id) {
  const note = DATA.notes.find(n => n.id === id);
  if (!note) return;
  note.liked = !note.liked;
  note.likes += note.liked ? 1 : -1;
  if (note.liked) addIntimacy(2); // 点赞加2点好感
  loadNotes();
  loadProfileNotes();
}

// ===== 动态评论系统 =====
function renderComments(note) {
  if (!note.comments || note.comments.length === 0) return '';
  return note.comments.map(c => `
    <div class="comment-item">
      <div class="comment-avatar ${c.isBobby ? 'bobby' : ''}">${c.isBobby ? 'B' : '你'}</div>
      <div class="comment-body">
        <div class="comment-author ${c.isBobby ? 'bobby' : ''}">${c.isBobby ? 'Bobby' : '你'}</div>
        <div class="comment-text">${c.text}</div>
      </div>
    </div>
  `).join('');
}

function toggleCommentSection(noteId) {
  const section = document.getElementById(`commentSection-${noteId}`);
  if (!section) return;

  // 关闭其他打开的评论区
  document.querySelectorAll('.note-comment-section.show').forEach(s => {
    if (s.id !== `commentSection-${noteId}`) {
      s.classList.remove('show');
    }
  });

  section.classList.toggle('show');

  // 展开时聚焦输入框
  if (section.classList.contains('show')) {
    const input = document.getElementById(`commentInput-${noteId}`);
    if (input) {
      setTimeout(() => {
        input.focus();
        setupCommentInput(noteId);
      }, 100);
    }
  }
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

  // 添加用户评论
  note.comments.push({ text, isBobby: false, time: new Date().toISOString() });
  input.value = '';

  // 更新UI
  const commentList = document.getElementById(`commentList-${noteId}`);
  if (commentList) {
    commentList.innerHTML = renderComments(note);
  }

  // 更新评论按钮数字
  const btn = document.querySelector(`.note-comment-btn[onclick*="${noteId}"]`);
  if (btn) {
    btn.innerHTML = `💬 ${note.comments.length}`;
  }

  // 保存评论到 localStorage
  saveComments();

  // Bobby 有 35% 的概率回复评论
  const willReply = Math.random() < 0.35;

  if (willReply) {
    // 显示"正在输入"状态
    const replyIndicator = document.createElement('div');
    replyIndicator.className = 'comment-item';
    replyIndicator.id = `commentTyping-${noteId}`;
    replyIndicator.innerHTML = `
      <div class="comment-avatar bobby">B</div>
      <div class="comment-body">
        <div class="comment-author bobby">Bobby</div>
        <div class="comment-text" style="color: var(--text-muted)">...</div>
      </div>
    `;
    if (commentList) {
      commentList.appendChild(replyIndicator);
    }

    // 延迟 2-6 秒后回复
    const delay = 2000 + Math.random() * 4000;
    await new Promise(r => setTimeout(r, delay));

    // 生成 Bobby 的回复
    let reply;
    try {
      reply = await getBobbyNoteReply(note.text, text);
    } catch (e) {
      // 回退到预设回复
      const fallbacks = ['嗯', '...', '看到了', '嗯嗯'];
      reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }

    // 移除输入指示
    const typing = document.getElementById(`commentTyping-${noteId}`);
    if (typing) typing.remove();

    // 添加Bobby回复
    note.comments.push({ text: reply, isBobby: true, time: new Date().toISOString() });
    if (commentList) {
      commentList.innerHTML = renderComments(note);
    }

    // 更新评论按钮数字
    if (btn) {
      btn.innerHTML = `💬 ${note.comments.length}`;
    }

    saveComments();
  }
}

// Bobby 回复动态评论 - 通过 DeepSeek API
async function getBobbyNoteReply(noteText, userComment) {
  const messages = [
    {
      role: 'system',
      content: `你是Bobby，一个住在城市里的年轻人。你刚发了一条动态："${noteText}"
现在有人评论了你的动态。你不一定回复，但偶尔会回一两个字。

回复规则：
- 用简短的中文，2-8个字
- 像在社交媒体上回复评论一样随意
- 不要说谢谢、不要客套
- 不要使用emoji
- 可以用"嗯""...""啊"这种语气词
- 语气自然，像真实的人在回评论
- 不要展开话题`
    },
    {
      role: 'user',
      content: userComment
    }
  ];

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: messages,
      max_tokens: 50,
      temperature: 0.9,
      stream: false
    })
  });

  if (!response.ok) throw new Error('API error');

  const data = await response.json();
  return (data.choices?.[0]?.message?.content || '嗯').trim();
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
      if (commentsData[n.id]) {
        n.comments = commentsData[n.id];
      }
    });
  } catch (e) {}
}

// ===== 主页 =====
function loadProfileNotes() {
  const container = dom.profileNotes;
  container.innerHTML = DATA.notes.slice(0, 3).map(note => {
    const hour = parseInt(note.timeDetail.split(':')[0]);
    let timeIcon = '🌙';
    if (hour >= 5 && hour < 8) timeIcon = '🌅';
    else if (hour >= 8 && hour < 12) timeIcon = '☀️';
    else if (hour >= 12 && hour < 17) timeIcon = '🌤';
    else if (hour >= 17 && hour < 20) timeIcon = '🌇';
    else if (hour >= 20 && hour < 23) timeIcon = '🌆';
    return `
      <div class="note-card">
        <div class="note-text">${note.text}</div>
        <div class="note-meta">
          <span class="note-time">${timeIcon} ${note.time} ${note.timeDetail}</span>
          ${note.comments && note.comments.length > 0 ? `<span style="font-size:11px;color:var(--text-muted)">💬 ${note.comments.length}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // 标语
  dom.profileTagline.textContent = DATA.taglines[Math.floor(Math.random() * DATA.taglines.length)];
}

function getTimePeriod() {
  const h = new Date().getHours();
  if (h >= 23 || h < 1) return 'lateNight';
  if (h >= 1 && h < 6) return 'earlyMorning';
  if (h >= 6 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 20) return 'evening';
  return 'night';
}

function isBobbyOnline() {
  const h = new Date().getHours();
  return h >= 23 || h < 3;
}

// ===== 状态机系统 =====
function getStatusMachine() {
  const saved = localStorage.getItem('bobby_status_machine');
  if (saved) {
    try { return JSON.parse(saved); } catch(e) {}
  }
  return { current: null, lastChange: 0 };
}

function saveStatusMachine(sm) {
  localStorage.setItem('bobby_status_machine', JSON.stringify(sm));
}

function getTimePeriodKey() {
  const h = new Date().getHours();
  if (h >= 23 || h < 3) return 'lateNight';
  if (h >= 3 && h < 6) return 'earlyMorning';
  if (h >= 6 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

function updateStatus() {
  const sm = getStatusMachine();
  const now = Date.now();
  const periodKey = getTimePeriodKey();
  const currentHour = new Date().getHours();

  // 最少保持5分钟，最多15分钟
  const minDuration = 5 * 60 * 1000;
  const maxDuration = 15 * 60 * 1000;
  const elapsed = now - sm.lastChange;
  const needsChange = !sm.current || elapsed > minDuration;

  // 时间段切换了，必须换状态
  const periodChanged = sm.current && DATA.stateMachine[sm.current] &&
    !DATA.stateMachine[sm.current].hours.includes(currentHour);

  if (!sm.current || periodChanged) {
    // 首次或时段切换：使用该时段的初始状态
    sm.current = DATA.initialState[periodKey] || '在发呆';
    sm.lastChange = now;
    saveStatusMachine(sm);
  } else if (needsChange && elapsed > minDuration + Math.random() * (maxDuration - minDuration)) {
    // 随机延迟后切换到下一个合法状态
    const rule = DATA.stateMachine[sm.current];
    if (rule && rule.next.length > 0) {
      // 过滤掉当前时段不合理的状态
      const valid = rule.next.filter(s => {
        const r = DATA.stateMachine[s];
        return r ? r.hours.includes(currentHour) : true;
      });
      if (valid.length > 0) {
        sm.current = valid[Math.floor(Math.random() * valid.length)];
      }
    }
    sm.lastChange = now;
    saveStatusMachine(sm);
  }

  // 更新UI
  const isOnline = currentHour >= 23 || currentHour < 3;
  dom.moodDot.classList.toggle('offline', !isOnline);
  dom.moodText.textContent = sm.current;
  dom.chatStatus.textContent = sm.current;
  state.statusText = sm.current;
}

function updateMood() {
  updateStatus();
  updateIntimacyDisplay();
  updateMomentCard();
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
    '在吹头发': '吹风机的声音盖过了一切。'
  };

  const moment = momentMap[status] || '世界在转，它在其中。';
  const el = document.getElementById('momentText');
  if (el) el.textContent = moment;
}

// ===== 礼物 =====
function loadGifts() {
  dom.giftGrid.innerHTML = DATA.gifts.map(g => `
    <div class="gift-item" onclick="sendGift('${g.id}')">
      <span class="gift-emoji">${g.emoji}</span>
      <span class="gift-name">${g.name}</span>
      <span class="gift-price">¥${g.price}</span>
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

  panel.classList.add('show');
}

function hideRelationshipCard() {
  const panel = document.getElementById('relationshipPanel');
  if (panel) panel.classList.remove('show');
}

function sendGift(giftId) {
  const gift = DATA.gifts.find(g => g.id === giftId);
  if (!gift) return;

  hideGiftPanel();

  // 记录礼物
  state.giftReceived.push(giftId);
  addIntimacy(5); // 送礼加5点好感
  saveMemory();

  // 显示送礼动画
  dom.giftSuccessEmoji.textContent = gift.emoji;
  dom.giftSuccess.classList.add('show');
  setTimeout(() => dom.giftSuccess.classList.remove('show'), 1500);

  // 延迟状态更新 - Bobby 的回应
  const delay = isNight() ? 30000 : 60000; // 深夜30秒后，白天1分钟后
  setTimeout(() => {
    const effect = DATA.giftEffects[giftId];
    if (effect) {
      dom.moodText.textContent = effect;
      dom.chatStatus.textContent = effect;
      state.statusText = effect;
    }
  }, delay);

  // 更深层的反应：Bobby 在聊天中会自然提及（40%概率，延迟更久）
  if (Math.random() < 0.4) {
    const deepDelay = isNight() ? 120000 : 300000; // 深夜2分钟后，白天5分钟后
    setTimeout(() => {
      if (state.currentPage === 'chatPage') {
        const reactions = {
          coffee: ['有点清醒了', '嗯...咖啡的味道还在'],
          medicine: ['好多了', '...不知道该说什么'],
          taxi: ['到家了', '不用挤地铁真好'],
          book: ['在看一本新的', '还不错'],
          blanket: ['暖和了', '好困'],
          food: ['饱了', '...嗯']
        };
        const pool = reactions[giftId] || ['嗯...'];
        const msg = pool[Math.floor(Math.random() * pool.length)];
        addThought('...');
        setTimeout(() => addMessage(msg, false), 2000);
      }
    }, deepDelay);
  }
}

// ===== 工具 =====
function formatTime(date) {
  return date.getHours().toString().padStart(2, '0') + ':' +
         date.getMinutes().toString().padStart(2, '0');
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
// 每次访问生成一条新的碎片，让用户有"回来的理由"
// 如果离开多天，会生成多条
function checkDailyNote() {
  const today = new Date().toDateString();
  const lastVisit = localStorage.getItem('bobby_last_visit');
  const lastNoteDate = localStorage.getItem('bobby_last_note');

  // 计算离开天数
  const daysGone = lastVisit ? Math.floor((Date.now() - new Date(lastVisit).getTime()) / 86400000) : 0;

  if (lastNoteDate === today) {
    localStorage.setItem('bobby_last_visit', new Date().toISOString());
    return;
  }

  const dailyNotes = [
    '窗外的树好像又长高了一点。',
    '楼下的流浪猫今天没来。',
    '耳机线又打结了。',
    '发现常去的那家店关门了。',
    '今天阳光很好，但风也很大。',
    '手机屏碎了好久了，一直没修。',
    '阳台上的衣服忘了收。',
    '泡面吃完了最后一包。',
    '看了一个很老的电影。还行。',
    '路过一家花店，犹豫了一下没进去。',
    '今天的月亮特别圆。',
    '室友带了宵夜回来，很香。',
    '发现一首很好听的歌，单曲循环了。',
    '下雨了没带伞，在便利店等了半小时。',
    '手机相册弹出了去年的今天。',
    '突然想学吉他。但大概不会真的去。',
    '便利店阿姨问我怎么天天来。',
    '公交车上遇到一只很乖的狗。',
    '今天的晚霞很好看。拍了一张。',
    '睡不着，数了一下天花板上的裂纹。',
    '楼下的路灯换了一个新的，比以前亮了好多。有点不习惯。',
    '发现枕头下面压着一张很久以前的电影票。已经看不清字了。',
    '窗外有一只鸟一直在叫，叫了很久。',
    '泡了一杯茶，忘了喝，凉了。',
    '路过公园，有人在吹萨克斯。走调了，但有种认真的感觉。',
    '手机电量到1%的时候充上了。松了口气。',
    '半夜听到救护车的声音。希望没事。',
    '发现袜子破了一个洞。但只破了一只。',
    '楼下的煎饼摊今天没出。有点失望。',
    '风把门吹关了，吓了一跳。'
  ];

  // 生成新碎片（最多3条，防止刷屏）
  const count = Math.min(daysGone || 1, 3);
  for (let i = 0; i < count; i++) {
    const note = dailyNotes[Math.floor(Math.random() * dailyNotes.length)];
    // 避免重复
    if (DATA.notes[0] && DATA.notes[0].text === note) continue;

    const h = Math.floor(Math.random() * 4) + 22; // 22-01点之间
    const m = Math.floor(Math.random() * 60);

    DATA.notes.unshift({
      id: Date.now() + i,
      text: note,
      time: i === 0 ? '刚刚' : (i === 1 ? '昨天' : '前天'),
      timeDetail: h.toString().padStart(2, '0') + ':' + m.toString().padStart(2, '0'),
      likes: Math.floor(Math.random() * 3),
      liked: false,
      comments: []
    });
  }

  localStorage.setItem('bobby_last_note', today);
  localStorage.setItem('bobby_last_visit', new Date().toISOString());

  // 刷新显示
  if (state.currentPage === 'notesPage') loadNotes();
  if (state.currentPage === 'profilePage') loadProfileNotes();
}

// ===== 定时更新 =====
function startScheduler() {
  setInterval(updateMood, 60000);
  setInterval(checkWhisper, 60000); // 每分钟检查一次是否低语
  checkDailyNote();
}

// ===== 初始化 =====
function init() {
  setupEvents();
  loadGifts();
  loadComments();  // 先加载评论数据
  loadNotes();
  loadProfileNotes();
  setupNotesPullRefresh();

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
