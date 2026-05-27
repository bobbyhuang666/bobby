const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // 基本信息
  username: { type: String, required: true, unique: true, trim: true, minlength: 2, maxlength: 20 },
  password: { type: String, required: true, minlength: 6 },
  nickname: { type: String, default: '' },

  // Bobby 关系
  intimacy: { type: Number, default: 0, min: 0, max: 100 },
  visitCount: { type: Number, default: 0 },
  lastVisit: { type: Date, default: Date.now },
  firstVisit: { type: Date, default: Date.now },

  // 礼物记录
  giftsSent: [{
    giftId: String,
    sentAt: { type: Date, default: Date.now }
  }],

  // VIP 状态
  vipLevel: { type: String, enum: ['free', 'moonlight', 'star'], default: 'free' },
  vipExpiry: { type: Date },

  // 用户情绪（Bobby 记住的）
  mood: { type: String, default: '' },
  lastTopic: { type: String, default: '' },

  // 设置
  settings: {
    notifications: { type: Boolean, default: true },
    soundEnabled: { type: Boolean, default: true }
  }
}, { timestamps: true });

// 密码哈希
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// 验证密码
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// 获取好感度等级
userSchema.methods.getIntimacyLevel = function() {
  const i = this.intimacy;
  if (i < 10) return { name: '陌生', desc: '你们还不太熟' };
  if (i < 25) return { name: '认识', desc: '算是在网上见过' };
  if (i < 45) return { name: '熟悉', desc: '有一种安静的默契' };
  if (i < 70) return { name: '默契', desc: '不需要说太多' };
  return { name: '信赖', desc: '你是它的深夜知己' };
};

// 增加好感度
userSchema.methods.addIntimacy = function(points) {
  const oldLevel = this.getIntimacyLevel().name;
  this.intimacy = Math.min(100, this.intimacy + points);
  const newLevel = this.getIntimacyLevel().name;
  return oldLevel !== newLevel; // 返回是否升级
};

module.exports = mongoose.model('User', userSchema);
