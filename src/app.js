// ============================================
// Bobby - 存在物形式低压AI陪伴
// ============================================

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
    { id: 1, text: '下雨了，窗户上全是水痕。盯着看了一会儿。', time: '今天', timeDetail: '01:23', likes: 2, liked: false },
    { id: 2, text: '楼下便利店的关东煮，萝卜最好吃。阿姨多给了一块。', time: '今天', timeDetail: '00:15', likes: 1, liked: false },
    { id: 3, text: '学不进去。盯着天花板发了半小时呆。天花板上有个小裂缝，上次还没注意到。', time: '昨天', timeDetail: '02:10', likes: 3, liked: false },
    { id: 4, text: '加班到现在。地铁上只有我和一个睡着的人。', time: '昨天', timeDetail: '23:30', likes: 0, liked: false },
    { id: 5, text: '突然想吃草莓。看了一下价格，算了。', time: '前天', timeDetail: '18:05', likes: 4, liked: false },
    { id: 6, text: '猫又来窗台了。这次带了一只小的。', time: '前天', timeDetail: '22:15', likes: 5, liked: false },
    { id: 7, text: '耳机里在放一首很久没听的歌。突然想起一些事。', time: '3天前', timeDetail: '01:30', likes: 2, liked: false },
    { id: 8, text: '路灯下面有只蛾子一直在转圈。看了好久。', time: '3天前', timeDetail: '23:55', likes: 3, liked: false },
    { id: 9, text: '洗完澡出来，头发还没干，风一吹好冷。', time: '4天前', timeDetail: '00:40', likes: 1, liked: false },
    { id: 10, text: '路过一家店，门口的风铃响了。好听。', time: '4天前', timeDetail: '19:20', likes: 4, liked: false },
    { id: 11, text: '手机快没电了，充电线又找不到了。', time: '5天前', timeDetail: '02:55', likes: 2, liked: false },
    { id: 12, text: '外面有人在吵架。听不清在说什么。', time: '5天前', timeDetail: '23:10', likes: 0, liked: false },
    { id: 13, text: '云走得很快。月亮一会儿有一会儿没有。', time: '6天前', timeDetail: '01:05', likes: 6, liked: false },
    { id: 14, text: '买了一杯热可可，太甜了。但暖手。', time: '6天前', timeDetail: '20:30', likes: 3, liked: false },
    { id: 15, text: '发现阳台上不知道什么时候长了一棵小草。', time: '一周前', timeDetail: '15:45', likes: 7, liked: false },
    { id: 16, text: '室友今天很安静。不知道怎么了。', time: '一周前', timeDetail: '23:00', likes: 2, liked: false }
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

  // 状态
  nightStatuses: [
    '还没睡呢', '在发呆', '有点累了', '在听歌',
    '刚洗完澡', '在看窗外', '困了但睡不着'
  ],

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
  isOnboarded: false
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

// ===== 启动 =====
function startApp() {
  // Bobby 先发一条消息
  setTimeout(() => {
    const greeting = isNight() ? getNightGreeting() : getDayGreeting();
    // 先显示内心独白
    addThought('有点眼熟...');
    setTimeout(() => addMessage(greeting, false), 1200);
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

  // 情绪关键词匹配 - 简单但有效
  const emotionReplies = {
    sad: ['嗯...', '会好的', '我在', '别想太多', '嗯，我也是'],
    tired: ['早点休息', '今天辛苦了', '嗯，我也困了', '别撑着'],
    lonely: ['嗯，我在', '外面好安静', '还没睡呢', '嗯...'],
    happy: ['嗯', '那就好', '是吗'],
    late: ['还没睡？', '太晚了', '快睡吧', '嗯...我也睡不着']
  };

  let candidates = pool;

  if (/累|疲|辛苦|撑不/.test(text)) {
    candidates = emotionReplies.tired;
  } else if (/难过|伤心|哭|不想|烦|孤独|寂寞|无聊/.test(text)) {
    candidates = emotionReplies.sad;
  } else if (/一个人|没人|没朋友|孤单/.test(text)) {
    candidates = emotionReplies.lonely;
  } else if (/开心|高兴|好事|哈哈|开心|太好了/.test(text)) {
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
  } else if (pageId === 'notesPage') {
    loadNotes();
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
      <div class="msg-time">${formatTimeFriendly(new Date())}</div>
    `;
  } else {
    el.innerHTML = `
      <div class="avatar"><img src="images/ai-avatar.svg" alt="Bobby" /></div>
      <div>
        <div class="bubble">${text}</div>
        <div class="msg-time">${formatTimeFriendly(new Date())}</div>
      </div>
    `;
  }

  dom.msgList.appendChild(el);
  setTimeout(() => {
    dom.chatArea.scrollTop = dom.chatArea.scrollHeight;
  }, 50);

  state.messages.push({ id, text, isUser });
  saveMessages();
}

function addThought(text) {
  const el = document.createElement('div');
  el.className = 'thought';
  el.innerHTML = `<span>${text}</span>`;
  dom.msgList.appendChild(el);
}

function showTyping() {
  dom.typing.classList.add('show');
  dom.chatArea.scrollTop = dom.chatArea.scrollHeight;
}

function hideTyping() {
  dom.typing.classList.remove('show');
}

function sendMessage() {
  const text = dom.inputBox.value.trim();
  if (!text) return;

  addMessage(text, true);
  dom.inputBox.value = '';
  dom.sendBtn.disabled = true;
  dom.sendBtn.classList.remove('active');

  // Bobby 的回复延迟 - 不秒回
  const delay = isNight()
    ? 1500 + Math.random() * 3000   // 深夜回复慢一些
    : 3000 + Math.random() * 8000;  // 白天更慢，像在忙

  showTyping();

  setTimeout(() => {
    hideTyping();
    const reply = getReply(text);
    addMessage(reply, false);
  }, delay);
}

function saveMessages() {
  localStorage.setItem('bobby_msgs', JSON.stringify(state.messages.slice(-100)));
}

// ===== 动态 =====
function loadNotes() {
  const container = dom.notesList;
  let html = '';
  let lastTime = '';

  DATA.notes.forEach(note => {
    if (note.time !== lastTime) {
      html += `<div class="timeline-date">${note.time}</div>`;
      lastTime = note.time;
    }
    html += `
      <div class="timeline-card">
        <div class="note-text">${note.text}</div>
        <div class="note-meta">
          <span class="note-time">${note.timeDetail}</span>
          <button class="note-like ${note.liked ? 'liked' : ''}" onclick="toggleLike(${note.id})">
            ${note.liked ? '❤️' : '♡'} ${note.likes || ''}
          </button>
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
  loadNotes();
  loadProfileNotes();
}

// ===== 主页 =====
function loadProfileNotes() {
  const container = dom.profileNotes;
  container.innerHTML = DATA.notes.slice(0, 3).map(note => `
    <div class="note-card">
      <div class="note-text">${note.text}</div>
      <div class="note-meta">
        <span class="note-time">${note.time} ${note.timeDetail}</span>
      </div>
    </div>
  `).join('');

  // 标语
  dom.profileTagline.textContent = DATA.taglines[Math.floor(Math.random() * DATA.taglines.length)];
}

function updateMood() {
  const night = isNight();
  dom.moodDot.classList.toggle('offline', !night);

  if (night) {
    const s = DATA.nightStatuses[Math.floor(Math.random() * DATA.nightStatuses.length)];
    dom.moodText.textContent = s;
    dom.chatStatus.textContent = s;
    state.statusText = s;
  } else {
    dom.moodText.textContent = '离线';
    dom.chatStatus.textContent = '离线';
    state.statusText = '离线';
  }
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

function sendGift(giftId) {
  const gift = DATA.gifts.find(g => g.id === giftId);
  if (!gift) return;

  hideGiftPanel();

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
function checkDailyNote() {
  const today = new Date().toDateString();
  const lastNoteDate = localStorage.getItem('bobby_last_note');

  if (lastNoteDate === today) return; // 今天已经生成过了

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
    '睡不着，数了一下天花板上的裂纹。'
  ];

  const note = dailyNotes[Math.floor(Math.random() * dailyNotes.length)];
  const now = new Date();
  const timeDetail = now.getHours().toString().padStart(2, '0') + ':' +
                     now.getMinutes().toString().padStart(2, '0');

  // 插入到最前面
  DATA.notes.unshift({
    id: Date.now(),
    text: note,
    time: '刚刚',
    timeDetail: timeDetail,
    likes: 0,
    liked: false
  });

  localStorage.setItem('bobby_last_note', today);

  // 刷新显示
  if (state.currentPage === 'notesPage') loadNotes();
  if (state.currentPage === 'profilePage') loadProfileNotes();
}

// ===== 定时更新 =====
function startScheduler() {
  setInterval(updateMood, 60000);
  checkDailyNote();
}

// ===== 初始化 =====
function init() {
  setupEvents();
  loadGifts();
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
