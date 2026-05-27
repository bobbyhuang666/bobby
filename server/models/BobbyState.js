const mongoose = require('mongoose');

// Bobby 全局状态（单例文档）
const bobbyStateSchema = new mongoose.Schema({
  _singleton: { type: String, default: 'bobby', unique: true },

  // 当前状态
  currentStatus: { type: String, default: '还没睡呢' },
  statusChangedAt: { type: Date, default: Date.now },

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
  lastEmotionTick: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('BobbyState', bobbyStateSchema);
