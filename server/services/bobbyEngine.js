const Message = require('../models/Message');
const Note = require('../models/Note');
const User = require('../models/User');
const BobbyState = require('../models/BobbyState');
const aiService = require('./aiService');
const { EmotionEngine } = require('./emotionEngine');
const { MemoryService } = require('./memoryService');
const { CognitiveLoop } = require('./cognitiveLoop');

// 状态机定义
const STATE_MACHINE = {
  '还没睡呢':    { next: ['在发呆', '在听歌', '在看窗外'], hours: [23,0,1,2] },
  '在发呆':      { next: ['在听歌', '困了但睡不着', '在看窗外'], hours: [23,0,1,2] },
  '在听歌':      { next: ['在发呆', '困了但睡不着', '还没睡呢'], hours: [23,0,1,2] },
  '在看窗外':    { next: ['在发呆', '还没睡呢', '在听歌'], hours: [23,0,1,2] },
  '困了但睡不着': { next: ['在发呆', '快睡了', '在听歌'], hours: [0,1,2] },
  '快睡了':      { next: ['困了但睡不着', '睡了'], hours: [1,2,3] },
  '在上课':      { next: ['下课了', '在走神'], hours: [8,9,10,11,13,14,15] },
  '在走神':      { next: ['在上课', '下课了'], hours: [8,9,10,11,13,14,15] },
  '下课了':      { next: ['在图书馆', '在打工', '在食堂'], hours: [11,12,15,16,17] },
  '在图书馆':    { next: ['在发呆', '有点困', '下课了'], hours: [9,10,11,13,14,15,16] },
  '在打工':      { next: ['刚下班', '有点累'], hours: [16,17,18,19,20] },
  '在食堂':      { next: ['吃完了', '在图书馆'], hours: [11,12] },
  '吃完了':      { next: ['在图书馆', '在上课'], hours: [12,13] },
  '有点困':      { next: ['在图书馆', '在发呆', '趴一会'], hours: [13,14,15] },
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
  '有点累':      { next: ['在发呆', '在休息', '先躺一会'], hours: [17,18,19,20,21,22] },
  '在休息':      { next: ['在看手机', '在发呆', '在做饭'], hours: [17,18,19,20] },
  '离线':        { next: ['在上课', '在打工', '在图书馆'], hours: [8,9,10,11,13,14,15,16] }
};

const INITIAL_STATES = {
  lateNight: '还没睡呢',
  morning: '在上课',
  afternoon: '在图书馆',
  evening: '刚下班',
  night: '在做饭'
};

class BobbyEngine {
  constructor(io) {
    this.io = io;
    this.state = null;
    this.emotion = null;  // 情绪引擎实例
    this.cognitive = null; // 认知循环实例
  }

  // 初始化 Bobby 状态
  async init() {
    let state = await BobbyState.findOne({ _singleton: 'bobby' });
    if (!state) {
      state = await BobbyState.create({});
    }
    this.state = state;

    // 从持久化数据恢复情绪引擎
    if (state.emotionState && state.emotionState.current) {
      const emotionData = {
        current: {},
        baseline: {},
        stress: state.emotionState.stress || 2,
        heartRate: state.emotionState.heartRate || 70
      };
      // Map 转普通对象
      if (state.emotionState.current instanceof Map) {
        state.emotionState.current.forEach((v, k) => { emotionData.current[k] = v; });
      } else {
        Object.assign(emotionData.current, state.emotionState.current || {});
      }
      if (state.emotionState.baseline instanceof Map) {
        state.emotionState.baseline.forEach((v, k) => { emotionData.baseline[k] = v; });
      } else {
        Object.assign(emotionData.baseline, state.emotionState.baseline || {});
      }
      this.emotion = EmotionEngine.fromJSON(emotionData);
    } else {
      this.emotion = new EmotionEngine();
    }

    // 恢复后立即执行一次 tick，补偿离线时间
    const hoursSinceLastTick = state.lastEmotionTick
      ? (Date.now() - state.lastEmotionTick.getTime()) / 3600000
      : 0.5;
    this.emotion.tick('', Math.min(hoursSinceLastTick, 24)); // 最多补偿24小时

    // 初始化认知循环
    this.cognitive = new CognitiveLoop(this.emotion, this);

    this.updateStatus();
  }

  // 持久化情绪状态到数据库
  async _persistEmotion() {
    if (!this.state || !this.emotion) return;
    const data = this.emotion.toJSON();
    this.state.emotionState = {
      current: data.current,
      baseline: data.baseline,
      stress: data.stress,
      heartRate: data.heartRate
    };
    this.state.lastEmotionTick = new Date();
    await this.state.save();
  }

  // 获取当前时段
  getTimePeriod() {
    const h = new Date().getHours();
    if (h >= 23 || h < 3) return 'lateNight';
    if (h >= 3 && h < 6) return 'earlyMorning';
    if (h >= 6 && h < 12) return 'morning';
    if (h >= 12 && h < 17) return 'afternoon';
    if (h >= 17 && h < 21) return 'evening';
    return 'night';
  }

  // 推进状态机
  async updateStatus() {
    if (!this.state) return;

    const now = new Date();
    const hour = now.getHours();
    const elapsed = now - this.state.statusChangedAt;
    const minDuration = 5 * 60 * 1000; // 5分钟最短持续

    const rule = STATE_MACHINE[this.state.currentStatus];

    // 检查当前状态是否还适用于当前时段
    const periodChanged = rule && !rule.hours.includes(hour);

    if (periodChanged || !rule) {
      // 时段切换，使用初始状态
      const period = this.getTimePeriod();
      this.state.currentStatus = INITIAL_STATES[period] || '在发呆';
      this.state.statusChangedAt = now;
      await this.state.save();
      this.broadcastStatus();
      return;
    }

    // 正常推进（最少5分钟）
    if (elapsed > minDuration + Math.random() * 10 * 60 * 1000) {
      const valid = rule.next.filter(s => {
        const r = STATE_MACHINE[s];
        return r ? r.hours.includes(hour) : true;
      });
      if (valid.length > 0) {
        this.state.currentStatus = valid[Math.floor(Math.random() * valid.length)];
        this.state.statusChangedAt = now;
        await this.state.save();
        this.broadcastStatus();
      }
    }
  }

  // 广播状态变化给所有在线用户
  broadcastStatus() {
    if (this.io) {
      this.io.emit('status_update', {
        status: this.state.currentStatus,
        changedAt: this.state.statusChangedAt
      });
    }
  }

  // 处理用户消息
  async handleMessage(userId, text) {
    const user = await User.findById(userId);
    if (!user) return null;

    // 保存用户消息
    const batchId = `batch_${Date.now()}`;
    await Message.create({
      userId,
      role: 'user',
      content: text,
      batchId
    });

    // 更新用户记忆（旧版简单记忆，保留兼容）
    user.lastTopic = text.slice(0, 50);
    if (/累|疲|辛苦/.test(text)) user.mood = 'tired';
    else if (/难过|伤心|哭|烦/.test(text)) user.mood = 'sad';
    else if (/开心|高兴|哈哈/.test(text)) user.mood = 'happy';
    else if (/睡不着|失眠/.test(text)) user.mood = 'insomnia';
    await user.save();

    // ===== 情绪引擎：每次交互 tick =====
    const hoursSinceLastTick = this.state.lastEmotionTick
      ? (Date.now() - this.state.lastEmotionTick.getTime()) / 3600000
      : 0.5;
    this.emotion.tick(text, Math.min(hoursSinceLastTick, 4));

    // 记忆学习放在生成回复之后（需要同时传入用户文本和 Bobby 回复）

    // ===== 记忆服务：检索相关记忆 =====
    let memoryProfile = '';
    try {
      const memories = await MemoryService.retrieve(userId, text, 3);
      if (memories.length > 0) {
        memoryProfile = memories.map(m => m.content).join('；');
      }
      // 获取用户画像
      const profile = await MemoryService.getUserProfile(userId);
      if (profile) {
        memoryProfile = memoryProfile ? `${profile}\n相关记忆：${memoryProfile}` : profile;
      }
    } catch (err) {
      console.error('记忆检索失败:', err.message);
    }

    // 生成回复
    const recentMessages = await Message.find({ userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const recentNotes = await Note.find()
      .sort({ publishedAt: -1 })
      .limit(5)
      .lean();

    const reply = await aiService.generateReply({
      userText: text,
      history: recentMessages.reverse(),
      user,
      bobbyStatus: this.state.currentStatus,
      recentNotes,
      timeLabel: this.getTimeLabel(),
      emotionEngine: this.emotion,
      memoryProfile,
      recentThoughts: this.cognitive ? this.cognitive.getRecentThoughts() : []
    });

    // 保存 Bobby 回复
    const msg = await Message.create({
      userId,
      role: 'assistant',
      content: reply,
      type: 'text',
      batchId
    });

    // 增加好感度
    const upgraded = user.addIntimacy(1);
    await user.save();

    // ===== 记忆服务：从 Bobby 的回复中也学习 =====
    try {
      await MemoryService.learnFromConversation(userId, text, reply);
    } catch (err) {
      // 静默失败
    }

    // ===== 持久化情绪状态 =====
    try {
      await this._persistEmotion();
    } catch (err) {
      console.error('情绪状态持久化失败:', err.message);
    }

    return { reply: msg, upgraded, intimacyLevel: user.getIntimacyLevel() };
  }

  // 处理评论
  async handleComment(userId, noteId, commentText) {
    const user = await User.findById(userId);
    const note = await Note.findById(noteId);
    if (!user || !note) return null;

    // 添加用户评论
    note.comments.push({ userId, content: commentText, isBobby: false });
    await note.save();

    // 好感度 +2
    user.addIntimacy(2);
    await user.save();

    // 情绪感染（评论也会影响 Bobby 的情绪）
    if (this.emotion) {
      this.emotion.tick(commentText, 0);
    }

    // Bobby 有概率回复（基于好感度）
    const replyChance = Math.min(0.9, 0.5 + user.intimacy * 0.004);
    let bobbyReply = null;

    if (Math.random() < replyChance) {
      // 延迟回复（模拟思考）
      const delay = 2000 + Math.random() * 4000;
      await new Promise(r => setTimeout(r, delay));

      bobbyReply = await aiService.generateCommentReply(note.content, commentText, user.getIntimacyLevel().name);

      note.comments.push({ content: bobbyReply, isBobby: true });
      await note.save();

      // 通知用户（如果在线）
      if (this.io) {
        this.io.to(`user_${userId}`).emit('bobby_comment_reply', {
          noteId,
          reply: bobbyReply
        });
      }
    }

    return { bobbyReply };
  }

  getTimeLabel() {
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

  isNight() {
    const h = new Date().getHours();
    return h >= 23 || h < 3;
  }
}

module.exports = BobbyEngine;
