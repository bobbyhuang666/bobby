const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  content: { type: String, required: true },
  isBobby: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const noteSchema = new mongoose.Schema({
  // 动态内容
  content: { type: String, required: true },

  // 时间信息（Bobby 发布的时间感）
  timeLabel: { type: String, default: '深夜' },  // "深夜"、"凌晨"、"下午"
  timeDetail: { type: String },                    // "01:23"

  // 发布时间
  publishedAt: { type: Date, default: Date.now, index: true },

  // Bobby 的当前状态（发布时）
  bobbyStatus: { type: String },

  // 互动
  likes: { type: Number, default: 0 },
  comments: [commentSchema],

  // 点赞记录（防重复）
  likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // 类型
  type: { type: String, enum: ['daily', 'complaint', 'giftReaction', 'milestone'], default: 'daily' }
}, { timestamps: true });

noteSchema.index({ publishedAt: -1 });

module.exports = mongoose.model('Note', noteSchema);
