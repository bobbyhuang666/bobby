// ============================================
// Bobby - 存在物形式低压AI陪伴
// 前端交互逻辑（Mock版本）
// ============================================

// ===== Mock数据 =====
const MOCK_DATA = {
  // AI回复模板
  replies: [
    '嗯，还没睡',
    '...怎么了',
    '嗯',
    '有点累',
    '好安静',
    '睡不着吗',
    '...',
    '知道了',
    '今天也有点冷',
    '刚下班',
    '在发呆',
    '学习学不进去...'
  ],

  // 动态数据
  notes: [
    { id: 1, text: '下雨了。', time: '昨天 23:45', likes: 2, liked: false },
    { id: 2, text: '便利店的咖啡，今天也普普通通。', time: '昨天 15:20', likes: 1, liked: false },
    { id: 3, text: '学习学不进去...', time: '2天前 02:10', likes: 3, liked: false },
    { id: 4, text: '下班了。今天也好累。', time: '3天前 18:30', likes: 0, liked: false },
    { id: 5, text: '窗外好像能看到远处的楼。', time: '4天前 23:55', likes: 4, liked: false }
  ],

  // 礼物数据
  gifts: [
    { id: 'coffee', emoji: '☕', name: '咖啡', price: 100 },
    { id: 'medicine', emoji: '💊', name: '感冒药', price: 200 },
    { id: 'taxi', emoji: '🚕', name: '打车券', price: 500 },
    { id: 'book', emoji: '📚', name: '一本书', price: 300 },
    { id: 'blanket', emoji: '🧸', name: '毯子', price: 150 },
    { id: 'music', emoji: '🎵', name: '一首歌', price: 400 }
  ],

  // 状态变化
  statusVariations: [
    '还没睡呢',
    '在发呆',
    '有点累了',
    '在学习...',
    '刚下班',
    '刚洗完澡'
  ],

  // 礼物效果
  giftEffects: {
    coffee: '咖啡好像有点用',
    medicine: '药效好像上来了',
    taxi: '帮大忙了...',
    book: '在看新书',
    blanket: '暖和了一点',
    music: '在听歌'
  }
};

// ===== 状态管理 =====
const state = {
  currentPage: 'chatPage',
  messages: [],
  messageIdCounter: 0,
  isTyping: false,
  statusText: '还没睡呢',
  isOnline: true
};

// ===== DOM引用 =====
const elements = {
  msgList: document.getElementById('msgList'),
  inputBox: document.getElementById('inputBox'),
  sendBtn: document.getElementById('sendBtn'),
  typing: document.getElementById('typing'),
  chatArea: document.getElementById('chatArea'),
  statusText: document.getElementById('statusText'),
  notesList: document.getElementById('notesList'),
  profileNotes: document.getElementById('profileNotes'),
  giftGrid: document.getElementById('giftGrid'),
  giftPanel: document.getElementById('giftPanel'),
  toast: document.getElementById('toast'),
  conceptOverlay: document.getElementById('conceptOverlay')
};

// ===== 初始化 =====
function init() {
  setupEventListeners();
  loadGifts();
  loadNotes();
  loadProfileNotes();

  // 检查是否首次访问
  const hasVisited = localStorage.getItem('bobby_visited');
  if (!hasVisited) {
    showFirstVisitExperience();
    localStorage.setItem('bobby_visited', 'true');
  } else {
    // 显示打招呼
    setTimeout(() => {
      addMessage(getGreeting(), false);
    }, 1000);
  }

  // 每30秒更新状态
  setInterval(updateStatus, 30000);
}

// ===== 事件监听 =====
function setupEventListeners() {
  // 输入框
  elements.inputBox.addEventListener('input', () => {
    const hasValue = elements.inputBox.value.trim().length > 0;
    elements.sendBtn.disabled = !hasValue;
    elements.sendBtn.classList.toggle('active', hasValue);
  });

  elements.inputBox.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });

  // Tab切换
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const page = tab.dataset.page;
      showPage(page);
    });
  });
}

// ===== 页面切换 =====
function showPage(pageId) {
  // 隐藏所有页面
  document.querySelectorAll('.page').forEach(p => {
    p.classList.remove('active');
  });

  // 显示目标页面
  document.getElementById(pageId).classList.add('active');

  // 更新所有tab栏
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.page === pageId);
  });

  state.currentPage = pageId;

  // 切换时加载数据
  if (pageId === 'profilePage') {
    loadProfileNotes();
  } else if (pageId === 'notesPage') {
    loadNotes();
  }
}

// ===== 聊天功能 =====
function addMessage(text, isRight) {
  const msgId = `msg-${state.messageIdCounter++}`;

  const msg = document.createElement('div');
  msg.className = `msg ${isRight ? 'right' : 'left'}`;
  msg.id = msgId;

  if (isRight) {
    msg.innerHTML = `<div class="bubble">${text}</div>`;
  } else {
    msg.innerHTML = `
      <div class="avatar">
        <img src="images/ai-avatar.svg" alt="Bobby" />
      </div>
      <div class="bubble">${text}</div>
    `;
  }

  elements.msgList.appendChild(msg);

  // 滚动到底部
  setTimeout(() => {
    elements.chatArea.scrollTop = elements.chatArea.scrollHeight;
  }, 50);

  // 保存到状态
  state.messages.push({ id: msgId, text, isRight });

  // 保存到localStorage
  saveMessages();
}

function showTyping() {
  state.isTyping = true;
  elements.typing.classList.add('show');
  elements.chatArea.scrollTop = elements.chatArea.scrollHeight;
}

function hideTyping() {
  state.isTyping = false;
  elements.typing.classList.remove('show');
}

function getRandomReply() {
  return MOCK_DATA.replies[Math.floor(Math.random() * MOCK_DATA.replies.length)];
}

function getGreeting() {
  const hour = new Date().getHours();
  const isNight = hour >= 23 || hour < 3;

  if (isNight) {
    const greetings = [
      '嗯，还没睡',
      '...还没睡？',
      '睡不着吗',
      '好安静'
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  } else {
    const greetings = [
      '早',
      '嗯？怎么了',
      '你好',
      '哦，怎么了'
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }
}

function sendMessage() {
  const text = elements.inputBox.value.trim();
  if (!text) return;

  // 添加用户消息
  addMessage(text, true);
  elements.inputBox.value = '';
  elements.sendBtn.disabled = true;
  elements.sendBtn.classList.remove('active');

  // 显示输入指示器
  showTyping();

  // 模拟AI回复
  const delay = 1000 + Math.random() * 2000;
  setTimeout(() => {
    hideTyping();
    addMessage(getRandomReply(), false);
  }, delay);
}

function saveMessages() {
  localStorage.setItem('bobby_messages', JSON.stringify(state.messages));
}

function loadMessages() {
  const saved = localStorage.getItem('bobby_messages');
  if (saved) {
    const messages = JSON.parse(saved);
    messages.forEach(msg => {
      addMessage(msg.text, msg.isRight);
    });
  }
}

// ===== 首次访问体验 =====
function showFirstVisitExperience() {
  // 显示概念浮层
  elements.conceptOverlay.classList.remove('hidden');

  // 1秒后显示内心独白
  setTimeout(() => {
    const thought = document.createElement('div');
    thought.className = 'thought';
    thought.innerHTML = '<span>有点眼熟，但已经想不起来什么时候加的了...</span>';
    elements.msgList.appendChild(thought);
  }, 500);

  // 3秒后AI打招呼
  setTimeout(() => {
    addMessage(getGreeting(), false);
  }, 3000);
}

function closeConcept() {
  elements.conceptOverlay.classList.add('hidden');
}

function showConcept() {
  elements.conceptOverlay.classList.remove('hidden');
}

// ===== 主页功能 =====
function loadProfileNotes() {
  const container = elements.profileNotes;
  container.innerHTML = MOCK_DATA.notes.slice(0, 3).map(note => `
    <div class="note-preview">
      <div class="note-text">${note.text}</div>
      <div class="note-date">${note.time}</div>
    </div>
  `).join('');
}

function updateStatus() {
  const hour = new Date().getHours();
  const isNight = hour >= 23 || hour < 3;

  if (isNight) {
    state.isOnline = true;
    state.statusText = MOCK_DATA.statusVariations[
      Math.floor(Math.random() * MOCK_DATA.statusVariations.length)
    ];
  } else {
    state.isOnline = false;
    state.statusText = '离线';
  }

  // 更新UI
  const statusEl = document.querySelector('.profile-status');
  if (statusEl) {
    statusEl.className = `profile-status ${state.isOnline ? 'online' : ''}`;
    elements.statusText.textContent = state.statusText;
  }
}

// ===== 动态功能 =====
function loadNotes() {
  const container = elements.notesList;
  container.innerHTML = MOCK_DATA.notes.map(note => `
    <div class="note-card">
      <div class="note-content">${note.text}</div>
      <div class="note-meta">
        <span class="note-time">${note.time}</span>
        <button class="note-like ${note.liked ? 'liked' : ''}" onclick="toggleLike(${note.id})">
          ${note.liked ? '❤️' : '♡'} ${note.likes}
        </button>
      </div>
    </div>
  `).join('');
}

function toggleLike(noteId) {
  const note = MOCK_DATA.notes.find(n => n.id === noteId);
  if (note) {
    note.liked = !note.liked;
    note.likes += note.liked ? 1 : -1;
    loadNotes();
  }
}

// ===== 礼物功能 =====
function loadGifts() {
  elements.giftGrid.innerHTML = MOCK_DATA.gifts.map(gift => `
    <div class="gift-item" onclick="sendGift('${gift.id}')">
      <span class="gift-emoji">${gift.emoji}</span>
      <span class="gift-name">${gift.name}</span>
      <span class="gift-price">¥${gift.price}</span>
    </div>
  `).join('');
}

function showGiftPanel() {
  elements.giftPanel.classList.add('show');
}

function hideGiftPanel() {
  elements.giftPanel.classList.remove('show');
}

function sendGift(giftId) {
  const gift = MOCK_DATA.gifts.find(g => g.id === giftId);
  if (!gift) return;

  // 隐藏面板
  hideGiftPanel();

  // 显示Toast
  showToast('已送出');

  // 延迟更新状态
  setTimeout(() => {
    const effect = MOCK_DATA.giftEffects[giftId];
    if (effect) {
      state.statusText = effect;
      const statusEl = document.querySelector('.profile-status');
      if (statusEl) {
        statusEl.className = 'profile-status online';
        elements.statusText.textContent = state.statusText;
      }
    }
  }, 60000); // 1分钟后
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add('show');

  setTimeout(() => {
    elements.toast.classList.remove('show');
  }, 2000);
}

// ===== 工具函数 =====
function formatTime(date) {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

// ===== 启动应用 =====
document.addEventListener('DOMContentLoaded', init);
