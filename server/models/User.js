const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
// 延迟导入，避免 Mongoose Model 与业务模块的循环依赖风险
let _intimacySystem = null;
function getIntimacySystem() {
  if (!_intimacySystem) _intimacySystem = require('../modules/intimacy').IntimacySystem;
  return _intimacySystem;
}

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

  // 主动消息追踪
  proactiveCountToday: { type: Number, default: 0 },
  lastProactiveDate: { type: String, default: '' },
  lastProactiveAt: { type: Date },

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

// 获取好感度等级（委托 IntimacySystem，延迟加载避免循环依赖）
userSchema.methods.getIntimacyLevel = function() {
  return getIntimacySystem().getLevel(this.intimacy);
};

// 增加好感度（委托 IntimacySystem）
userSchema.methods.addIntimacy = function(points) {
  const result = getIntimacySystem().addPoints(this.intimacy, points);
  this.intimacy = result.newValue;
  return result.upgraded;
};

module.exports = mongoose.model('User', userSchema);
