const Message = require('../models/Message');
const Note = require('../models/Note');
const User = require('../models/User');
const BobbyState = require('../models/BobbyState');
const aiService = require('./aiService');
const { EmotionEngine } = require('./emotionEngine');
const { MemoryService } = require('./memoryService');
const { CognitiveLoop } = require('./cognitiveLoop');
const { getTimeLabel, getTimePeriod } = require('../utils/time');
const { BOBBY_DEFAULTS } = require('../config/bobbyDefaults');
const bcfg = BOBBY_DEFAULTS;

// ═══ Andy 引擎集成 ═══
// 状态机委托给 Andy，保留 Bobby 自有状态机作为降级兜底
let _useAndy = false;
let _andyBridge = null;

// Bobby 自有状态机（Andy 未初始化时兜底使用）
const STATE_MACHINE = {
  '还没睡呢':    { next: ['在发呆', '在听歌', '在看窗外'], hours: [23,0,1,2] },
  '在发呆':      { next: ['在听歌', '困了但睡不着', '在看窗外'], hours: [23,0,1,2] },
  '在听歌':      { next: ['在发呆', '困了但睡不着', '还没睡呢'], hours: [23,0,1,2] },
  '在看窗外':    { next: ['在发呆', '还没睡呢', '在听歌'], hours: [23,0,1,2] },
  '困了但睡不着': { next: ['在发呆', '快睡了', '在听歌'], hours: [0,1,2] },
  '快睡了':      { next: ['困了但睡不着', '睡了'], hours: [1,2,3] },
  '睡了':        { next: ['还没睡呢'], hours: [3,4,5] },
  '刚醒':        { next: ['在发呆', '在洗漱'], hours: [6,7] },
  '在洗漱':      { next: ['在发呆', '刚出门'], hours: [6,7] },
  '刚出门':      { next: ['在上课', '在图书馆'], hours: [7,8] },
  '在上课':      { next: ['下课了', '在走神'], hours: [8,9,10,11,13,14,15] },
  '在走神':      { next: ['在上课', '下课了'], hours: [8,9,10,11,13,14,15] },
  '下课了':      { next: ['在图书馆', '在打工', '在食堂'], hours: [11,12,15,16,17] },
  '在图书馆':    { next: ['在发呆', '有点困', '下课了'], hours: [9,10,11,13,14,15,16] },
  '在打工':      { next: ['刚下班', '有点累'], hours: [16,17,18,19,20] },
  '在食堂':      { next: ['吃完了', '在图书馆'], hours: [11,12] },
  '吃完了':      { next: ['在图书馆', '在上课'], hours: [12,13] },
  '有点困':      { next: ['在图书馆', '在发呆', '趴一会'], hours: [13,14,15] },
  '趴一会':      { next: ['在图书馆', '在发呆', '有点困'], hours: [13,14,15] },
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
  earlyMorning: '快睡了',
  morning: '在上课',
  afternoon: '在图书馆',
  evening: '刚下班',
  night: '在看手机'
};

class BobbyEngine {
  constructor(io) {
    this.io = io;
    this.state = null;
    this.emotion = null;  // 情绪引擎实例
    this.cognitive = null; // 认知循环实例
    this.bridge = null;    // Andy 桥接层（可选）
  }

  /**
   * 注入 AndyBridge（在 app.js 初始化后调用）
   * @param {Object} bridge - AndyBridge 实例
   */
  setAndyBridge(bridge) {
    this.bridge = bridge;
    _andyBridge = bridge;
    _useAndy = !!bridge;
    console.log(`Andy 桥接层已注入 BobbyEngine（${_useAndy ? '启用' : '禁用'}）`);
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
        heartRate: state.emotionState.heartRate || bcfg.emotion.defaultHeartRate
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
    this.emotion.tick('', Math.min(hoursSinceLastTick, bcfg.chat.maxCompensationHours));

    // 初始化认知循环
    this.cognitive = new CognitiveLoop(this.emotion, this);

    // Andy 引擎初始化由 app.js 在 setAndyBridge() 后单独处理
    // （因为 init() 在 setAndyBridge() 之前调用）

    this.updateStatus();
  }

  // 原子更新 BobbyState（避免 ParallelSaveError）
  async _updateState(update) {
    this.state = await BobbyState.findOneAndUpdate(
      { _singleton: 'bobby' },
      update,
      { new: true }
    );
    return this.state;
  }

  // 持久化情绪状态到数据库
  async _persistEmotion() {
    if (!this.state || !this.emotion) return;
    const data = this.emotion.toJSON();
    await this._updateState({
      $set: {
        emotionState: {
          current: data.current,
          baseline: data.baseline,
          stress: data.stress,
          heartRate: data.heartRate
        },
        lastEmotionTick: new Date()
      }
    });
  }

  // 获取当前时段（委托共享工具）
  getTimePeriod() {
    return getTimePeriod();
  }

  // 推进状态机
  async updateStatus() {
    if (!this.state) return;

    // ===== Andy 模式：状态由 Andy tick 驱动 =====
    if (_useAndy && this.bridge) {
      try {
        const andyStatus = this.bridge.getBobbyStatus();
        if (andyStatus && andyStatus !== this.state.currentStatus) {
          await this._updateState({
            $set: { currentStatus: andyStatus, statusChangedAt: new Date() }
          });
          this.broadcastStatus();
        }
        return;
      } catch (err) {
        this._degradeFromAndy(`状态更新失败: ${err.message}`);
      }
    }

    // ===== 降级：Bobby 自有状态机 =====
    const now = new Date();
    const hour = now.getHours();
    const elapsed = now - this.state.statusChangedAt;

    // 根据当前状态和时段动态调整切换节奏（更像真人）
    const currentStatus = this.state.currentStatus;
    let minDuration, maxExtra;

    // 活跃状态切换快，安静状态切换慢
    if (bcfg.activeStates.includes(currentStatus)) {
      ({ min: minDuration, extra: maxExtra } = bcfg.stateDuration.active);
    } else if (bcfg.quietStates.includes(currentStatus)) {
      ({ min: minDuration, extra: maxExtra } = bcfg.stateDuration.quiet);
    } else if (hour >= 23 || hour < 3) {
      ({ min: minDuration, extra: maxExtra } = bcfg.stateDuration.lateNight);
    } else {
      ({ min: minDuration, extra: maxExtra } = bcfg.stateDuration.default);
    }

    const rule = STATE_MACHINE[this.state.currentStatus];

    // 检查当前状态是否还适用于当前时段
    const periodChanged = rule && !rule.hours.includes(hour);

    if (periodChanged || !rule) {
      // 时段切换，使用初始状态
      const period = this.getTimePeriod();
      const newStatus = INITIAL_STATES[period] || '在发呆';
      await this._updateState({
        $set: { currentStatus: newStatus, statusChangedAt: now }
      });
      this.broadcastStatus();
      return;
    }

    // 正常推进（动态节奏 + 情绪加权）
    if (elapsed > minDuration + Math.random() * maxExtra) {
      const valid = rule.next.filter(s => {
        const r = STATE_MACHINE[s];
        return r ? r.hours.includes(hour) : true;
      });
      if (valid.length > 0) {
        const newStatus = this._emotionWeightedPick(valid);
        await this._updateState({
          $set: { currentStatus: newStatus, statusChangedAt: now }
        });
        this.broadcastStatus();
      }
    }
  }

  /**
   * 情绪加权选择下一个状态
   * valence 低落时倾向安静状态，愉悦时倾向活跃状态
   */
  _emotionWeightedPick(candidates) {
    const et = bcfg.emotionTransition;
    let valence = 0;
    if (this.emotion && this.emotion.getValence) {
      valence = this.emotion.getValence();
    }

    // 中性区域：均匀随机，保持原有行为
    if (valence >= et.negativeThreshold && valence <= et.positiveThreshold) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    // 计算权重
    const weights = candidates.map(s => {
      let w = 1;
      if (valence < et.negativeThreshold) {
        // 低落模式：安静状态加权，活跃状态降权
        if (bcfg.quietStates.includes(s)) w = et.negativeQuietBoost;
        else if (bcfg.activeStates.includes(s)) w = et.negativeActivePenalty;
      } else {
        // 愉悦模式：活跃状态加权，安静状态降权
        if (bcfg.activeStates.includes(s)) w = et.positiveActiveBoost;
        else if (bcfg.quietStates.includes(s)) w = et.positiveQuietPenalty;
      }
      return w;
    });

    // 加权随机选择
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < candidates.length; i++) {
      r -= weights[i];
      if (r <= 0) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  /**
   * 状态感知碎片选择
   * 优先级：状态专属碎片 > 情绪倾向碎片 > 通用碎片池
   */
  selectFragment(dailyNotes) {
    const status = this.state ? this.state.currentStatus : '';
    const stateFragments = bcfg.stateFragments || {};
    const emotionFragments = bcfg.emotionFragments || {};

    // 60% 概率尝试状态专属碎片
    if (Math.random() < 0.6 && stateFragments[status]) {
      const pool = stateFragments[status];
      return pool[Math.floor(Math.random() * pool.length)];
    }

    // 情绪倾向碎片（valence 偏离中性时）
    if (this.emotion && this.emotion.getValence) {
      const valence = this.emotion.getValence();
      const et = bcfg.emotionTransition;
      if (valence < et.negativeThreshold && emotionFragments.negative && Math.random() < 0.4) {
        return emotionFragments.negative[Math.floor(Math.random() * emotionFragments.negative.length)];
      }
      if (valence > et.positiveThreshold && emotionFragments.positive && Math.random() < 0.4) {
        return emotionFragments.positive[Math.floor(Math.random() * emotionFragments.positive.length)];
      }
    }

    // 兜底：通用碎片池
    return dailyNotes[Math.floor(Math.random() * dailyNotes.length)];
  }

  /**
   * 获取情绪摘要（供前端低语系统使用）
   * 返回精简的 valence/arousal/status，不暴露完整情绪引擎状态
   */
  getEmotionSummary() {
    if (!this.emotion) return { valence: 0, arousal: 0.5, status: '' };
    return {
      valence: this.emotion.getValence ? this.emotion.getValence() : 0,
      arousal: this.emotion.getArousal ? this.emotion.getArousal() : 0.5,
      status: this.state ? this.state.currentStatus : ''
    };
  }

  // 广播状态变化给所有在线用户（附带情绪摘要供前端低语系统使用）
  broadcastStatus() {
    if (this.io) {
      // 如果有临时覆盖（礼物效果），优先显示覆盖状态
      const now = new Date();
      const isOverrideValid = this.state.displayOverride &&
        this.state.overrideExpiry && now < new Date(this.state.overrideExpiry);
      const emotion = this.getEmotionSummary();
      this.io.emit('status_update', {
        status: isOverrideValid ? this.state.displayOverride : this.state.currentStatus,
        changedAt: this.state.statusChangedAt,
        emotion  // { valence, arousal, status }
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
    user.lastTopic = text.slice(0, bcfg.chat.topicMaxLength);
    // 统一使用共享关键词检测用户情绪
    for (const [mood, regex] of Object.entries(bcfg.moodKeywords)) {
      if (regex.test(text)) { user.mood = mood; break; }
    }

    // ===== 情绪引擎：每次交互 tick =====
    // Andy 可用时：情绪演化由 Andy tick 驱动（每5分钟），这里只做用户情绪感染
    // Andy 不可用时：Bobby 自有引擎完整 tick（衰减+感染+昼夜+噪声+共激活）
    if (_useAndy && this.bridge) {
      // Andy 模式：用户消息情绪信号传给 Andy（通过 EmotionSignalBuffer）
      // 信号会在下一次 Andy tick 时被消费，注入 Bobby Agent 的情绪状态
      try {
        this.bridge.onUserMessage(text);
      } catch (e) {
        // 信号发送失败不影响聊天
      }
      // 同时感染 Bobby 本地情绪（作为即时响应，不等 Andy tick）
      this.emotion._emotionalContagion(text);
    } else {
      // 降级模式：Bobby 自有引擎完整演化
      const hoursSinceLastTick = this.state.lastEmotionTick
        ? (Date.now() - this.state.lastEmotionTick.getTime()) / 3600000
        : 0.5;
      this.emotion.tick(text, Math.min(hoursSinceLastTick, 4));
    }

    // ===== 并行：记忆检索 + 消息历史 + 最新动态 + Andy 叙事 =====
    const [memoryProfile, recentMessages, recentNotes, andyNarrative] = await Promise.all([
      // 记忆服务：检索相关记忆 + 用户画像
      (async () => {
        try {
          const [memories, profile] = await Promise.all([
            MemoryService.retrieve(userId, text, 3),
            MemoryService.getUserProfile(userId)
          ]);
          let mp = memories.length > 0 ? memories.map(m => m.content).join('；') : '';
          if (profile) mp = mp ? `${profile}\n相关记忆：${mp}` : profile;
          return mp;
        } catch (err) {
          console.error('记忆检索失败:', err.message);
          return '';
        }
      })(),
      // 消息历史
      Message.find({ userId }).sort({ createdAt: -1 }).limit(bcfg.chat.recentMessagesLimit).lean(),
      // 最新动态
      Note.find().sort({ publishedAt: -1 }).limit(bcfg.chat.recentNotesLimit).lean(),
      // Andy 内心叙事（替代原来的世界上下文文本拼接）
      // 传入用户消息 + 好感度，让叙事通过关系感知的共情反映用户情绪影响
      (_useAndy && this.bridge)
        ? Promise.resolve().then(() => {
            try { return this.bridge.getNarrative({ userText: text, intimacy: user.intimacy || 0 }); }
            catch (e) { return ''; }
          })
        : Promise.resolve('')
    ]);

    const reply = await aiService.generateReply({
      userText: text,
      history: recentMessages.reverse(),
      user,
      bobbyStatus: this.state.currentStatus,
      recentNotes,
      timeLabel: this.getTimeLabel(),
      emotionEngine: this.emotion,
      memoryProfile,
      recentThoughts: this.cognitive ? this.cognitive.getRecentThoughts() : [],
      andyNarrative  // Andy 引擎合成的内心叙事（替代 worldContext）
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

    // 合并保存：用户更新 + 情绪持久化（原子操作避免 ParallelSaveError）
    const data = this.emotion.toJSON();
    await Promise.all([
      user.save(),
      this._updateState({
        $set: {
          emotionState: {
            current: data.current,
            baseline: data.baseline,
            stress: data.stress,
            heartRate: data.heartRate
          },
          lastEmotionTick: new Date()
        }
      })
    ]);

    // ===== 记忆服务：从对话中学习 =====
    try {
      await MemoryService.learnFromConversation(userId, text, reply);
    } catch (err) {
      console.error('记忆学习失败:', err.message);
    }

    return { reply: msg, upgraded, intimacyLevel: user.getIntimacyLevel() };
  }

  // 处理评论
  async handleComment(userId, noteId, commentText, options = {}) {
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
    const replyChance = Math.min(bcfg.chat.replyChanceMax, bcfg.chat.replyChanceBase + user.intimacy * bcfg.chat.replyChanceIntimacyMul);
    let bobbyReply = null;

    if (Math.random() < replyChance) {
      // 延迟回复（模拟思考，测试环境可通过 options.skipDelay 跳过）
      if (!options.skipDelay) {
        const delay = bcfg.chat.replyDelayMin + Math.random() * bcfg.chat.replyDelayExtra;
        await new Promise(r => setTimeout(r, delay));
      }

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
    return getTimeLabel();
  }

  isNight() {
    const h = new Date().getHours();
    return h >= 23 || h < 3;
  }

  // ===== Andy 引擎接口 =====

  /**
   * 从 Andy 模式降级到 Bobby 自有模式
   * 清理所有 Andy 相关的 stale 数据，确保降级后状态一致
   */
  _degradeFromAndy(reason) {
    console.error(`Andy 降级: ${reason}，切换到 Bobby 自有模式`);
    _useAndy = false;

    // 清理 EmotionEngine 上的 stale Andy 注入数据
    if (this.emotion) {
      delete this.emotion._andyValence;
      delete this.emotion._andyArousal;
      delete this.emotion._andyStress;
      delete this.emotion._andyDominant;
    }
  }

  /**
   * 执行一次 Andy tick（由定时任务调用）
   * 推进 Andy 世界时间，同步 Bobby 状态和情绪
   */
  async tickAndy() {
    if (!_useAndy || !this.bridge) return null;

    try {
      const result = this.bridge.tick();

      // 同步 Andy 的状态到 Bobby 数据库
      if (result && result.stateChanged) {
        await this._updateState({
          $set: { currentStatus: result.bobbyStatus, statusChangedAt: new Date() }
        });
        this.broadcastStatus();
      }

      // Andy 模式：将 Andy 的情绪状态同步到 Bobby 的 EmotionEngine
      // Bobby 不再独立演化情绪，而是作为 Andy 情绪的同步镜像
      // 这样 toPromptString() 始终反映 Andy 的真实情绪状态
      if (result && result.bobbyEmotion && this.emotion) {
        const emotionData = this.bridge.getBobbyEmotionData();
        if (emotionData.valence !== undefined) {
          this.emotion._andyValence = emotionData.valence;
          this.emotion._andyArousal = emotionData.arousal;
          this.emotion._andyStress = emotionData.stress;
          this.emotion._andyDominant = emotionData.dominant || [];
        }
      }

      return result;
    } catch (err) {
      this._degradeFromAndy(`tick 失败: ${err.message}`);
      return null;
    }
  }

  /**
   * 持久化 Andy 世界状态到数据库
   */
  async persistAndyState() {
    if (!_useAndy || !this.bridge || !this.state) return;

    try {
      const worldState = this.bridge.toJSON();
      if (worldState) {
        await this._updateState({ $set: { andyWorldState: worldState } });
      }
    } catch (err) {
      console.error('Andy 状态持久化失败:', err.message);
    }
  }

  /**
   * 获取 Andy 世界上下文（供外部调用）
   */
  getAndyWorldContext() {
    if (!_useAndy || !this.bridge) return null;
    try {
      return this.bridge.getWorldContext();
    } catch (err) {
      return null;
    }
  }
}

module.exports = BobbyEngine;
