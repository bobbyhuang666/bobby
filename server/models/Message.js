const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // 消息内容
  role: { type: String, enum: ['user', 'assistant'], required: true },
  content: { type: String, required: true },

  // 消息类型
  type: { type: String, enum: ['text', 'photo', 'voice', 'thought'], default: 'text' },

  // 照片消息额外数据
  photo: {
    scene: String,   // emoji 场景
    caption: String   // 描述文字
  },

  // 语音消息额外数据
  voice: {
    duration: Number  // 秒数
  },

  // 已读状态
  isRead: { type: Boolean, default: false },
  readAt: { type: Date },

  // 批次 ID（同一批用户消息共享一个 batchId）
  batchId: { type: String, index: true }
}, { timestamps: true });

// 索引：按用户和时间查询
messageSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
