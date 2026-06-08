const mongoose = require('mongoose');

// Bobby 全局状态（单例文档）
const bobbyStateSchema = new mongoose.Schema({
  _singleton: { type: String, default: 'bobby', unique: true },

  // 当前状态
  currentStatus: { type: String, default: '还没睡呢' },
  statusChangedAt: { type: Date, default: Date.now },

  // 临时覆盖状态（礼物效果等，不破坏状态机）
  displayOverride: { type: String, default: null },
  overrideExpiry: { type: Date, default: null },

  // 今天发了几条低语
  whisperCount: { type: Number, default: 0 },
  whisperDate: { type: String, default: '' },

  // 今天发了几条碎片
  notesToday: { type: Number, default: 0 },
  notesDate: { type: String, default: '' },

  // 最近生成的碎片内容（防重复）
  recentNoteTexts: [String],

  // 情绪引擎状态（持久化）
  emotionState: {
    current: { type: Map, of: Number },
    baseline: { type: Map, of: Number },
    stress: { type: Number, default: 2 },
    heartRate: { type: Number, default: 70 }
  },

  // 上次情绪 tick 时间
  lastEmotionTick: { type: Date, default: Date.now },

  // 世界事件流（最近的生活片段，供前端展示）
  worldEvents: [{
    type: { type: String },  // 'status', 'weather', 'emotion', 'note', 'thought', 'social'
    content: { type: String },
    time: { type: Date, default: Date.now },
  }],

  // Andy 世界引擎状态（持久化，用于重启恢复）
  andyWorldState: { type: mongoose.Schema.Types.Mixed, default: null },

  // ═══ V2: 社交状态 ═══
  socialState: {
    // 最近的社交事件（保留最近 20 条）
    recentEvents: [{
      type: { type: String },        // EVENT_TYPES
      friendId: { type: String },
      friendName: { type: String },
      content: { type: String },
      time: { type: Date, default: Date.now },
    }],
    // 今天的社交互动次数
    interactionsToday: { type: Number, default: 0 },
    interactionsDate: { type: String, default: '' },
    // 最近一次社交事件时间
    lastSocialEventAt: { type: Date },
  },

  // ═══ V2: NPC 关系动态状态 ═══
  // closeness 随事件变化，不再是 FRIENDS 数组里的静态值
  npcRelationships: [{
    friendId: { type: String, required: true },
    closeness: { type: Number, default: 0.5 },   // 0-1 动态亲密度
    lastInteraction: { type: Date },
    interactionCount: { type: Number, default: 0 },
    recentAutonomous: [{
      content: { type: String },
      time: { type: Date, default: Date.now },
    }],
  }],
}, { timestamps: true });

module.exports = mongoose.model('BobbyState', bobbyStateSchema);
