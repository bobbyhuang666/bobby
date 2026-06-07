/**
 * Bobby 认知循环
 *
 * 设计来源：
 * - Docketeer: Reverie（沉思）+ Consolidation（整合）
 * - ProactiveAgent: Wake-Decide-Respond-Sleep
 * - open-strix: 自主调度
 *
 * 核心理念：Bobby 不是在等你说话时才"思考"。
 * 它有独立的内心活动：沉思、回忆、计划、发呆。
 * 你看到的碎片和低语，只是它内心世界的冰山一角。
 */

const Note = require('../../models/Note');
const aiService = require('../../services/aiService');

// Bobby 的认知模块（并发运行）
const COGNITIVE_MODULES = {
  RUMINATION: 'rumination',       // 反刍思维：反复想某件事
  REFLECTION: 'reflection',       // 反思：回顾最近的经历
  DAYDREAM: 'daydream',           // 白日梦：想象未来
  SELF_EVAL: 'self_evaluation',   // 自我评价：审视自己
  SOCIAL: 'social_thinking',      // 社交思考：想起某个人
  SENSORY: 'sensory_awareness',   // 感官觉察：注意周围环境
};

// 每个认知模块的思维产出模板
const THOUGHT_TEMPLATES = {
  rumination: [
    '为什么那件事会那样...',
    '如果当时...',
    '总觉得哪里不对...',
    '一直在想那个...',
  ],
  reflection: [
    '今天好像做了不少事...',
    '最近过得还挺快的',
    '好像比以前好一点了',
    '时间过得好快...',
  ],
  daydream: [
    '如果能去海边就好了',
    '以后想养一只猫',
    '什么时候能睡个好觉',
    '想去看一场电影',
  ],
  self_evaluation: [
    '我是不是太安静了...',
    '好像不太会说话',
    '有时候觉得自己挺奇怪的',
    '算了，就这样吧',
  ],
  social_thinking: [
    '不知道那个人在干嘛',
    '好久没联系了...',
    '好像有人一直在',
    '有人给我送了东西...',
  ],
  sensory: [
    '风变大了',
    '外面好像有鸟叫',
    '空气里有股雨的味道',
    '灯泡好像快坏了，一闪一闪的',
  ],
};

class CognitiveLoop {
  constructor(emotionEngine, bobbyEngine) {
    this.emotion = emotionEngine;
    this.bobby = bobbyEngine;
    this.lastReflection = 0;
    this.lastConsolidation = 0;
    this.thoughtQueue = [];       // 待处理的思维
    this.recentThoughts = [];     // 最近的思维记录（防重复）
    this.activeModule = null;     // 当前活跃的认知模块
  }

  // ===== Reverie（沉思周期）：每 30 分钟 =====
  // Bobby 在空闲时"沉思"——生成内心独白和碎片素材
  async reverie() {
    const now = Date.now();

    // 根据当前情绪选择活跃的认知模块
    this.activeModule = this._selectCognitiveModule();

    // 生成思维内容
    const thought = await this._generateThought(this.activeModule);

    if (thought) {
      this.thoughtQueue.push({
        content: thought,
        module: this.activeModule,
        timestamp: now,
        emotion: this.emotion.getDominantEmotions(2)
      });

      // 保持队列合理大小
      if (this.thoughtQueue.length > 10) {
        this.thoughtQueue.shift();
      }

      // 记录
      this.recentThoughts.push(thought);
      if (this.recentThoughts.length > 20) {
        this.recentThoughts.shift();
      }
    }

    this.lastReflection = now;
    return thought;
  }

  // ===== Consolidation（整合周期）：每天凌晨 =====
  // Bobby 在深夜"整合"一天的记忆
  async consolidation() {
    this.lastConsolidation = Date.now(); // 先设置时间戳，防止重试风暴

    try {
      // 获取最近的对话和动态
      const recentNotes = await Note.find()
        .sort({ publishedAt: -1 })
        .limit(10)
        .lean();

      // 让 AI 生成一条整合性的碎片
      const thought = await aiService.generateReflection(recentNotes, this.emotion);

      if (thought) {
        // 生成一条深度碎片
        const nowDate = new Date();
        const note = await Note.create({
          content: thought,
          timeLabel: '深夜',
          timeDetail: nowDate.getHours().toString().padStart(2, '0') + ':' +
                      nowDate.getMinutes().toString().padStart(2, '0'),
          publishedAt: nowDate,
          bobbyStatus: this.bobby?.state?.currentStatus || '在发呆',
          type: 'daily'
        });

        return note;
      }
    } catch (err) {
      console.error('整合周期失败:', err.message);
    }

    return null;
  }

  // 根据情绪状态选择认知模块
  _selectCognitiveModule() {
    const valence = this.emotion.getValence();
    const arousal = this.emotion.getArousal();

    // 负面情绪 → 反刍或自我评价
    if (valence < -0.2) {
      return Math.random() < 0.6 ? COGNITIVE_MODULES.RUMINATION : COGNITIVE_MODULES.SELF_EVAL;
    }

    // 高唤醒 → 白日梦或社交思考
    if (arousal > 0.5) {
      return Math.random() < 0.5 ? COGNITIVE_MODULES.DAYDREAM : COGNITIVE_MODULES.SOCIAL;
    }

    // 低唤醒 → 感官觉察或反思
    if (arousal < 0.3) {
      return Math.random() < 0.5 ? COGNITIVE_MODULES.SENSORY : COGNITIVE_MODULES.REFLECTION;
    }

    // 默认随机
    const modules = Object.values(COGNITIVE_MODULES);
    return modules[Math.floor(Math.random() * modules.length)];
  }

  // 生成思维内容
  async _generateThought(module) {
    // 80% 使用模板（快速、低成本），20% 使用 AI 生成（更丰富）
    if (Math.random() < 0.8) {
      const templates = THOUGHT_TEMPLATES[module] || THOUGHT_TEMPLATES.reflection;
      const thought = templates[Math.floor(Math.random() * templates.length)];

      // 检查是否和最近的思维重复
      if (this.recentThoughts.includes(thought)) {
        return templates[(templates.indexOf(thought) + 1) % templates.length];
      }
      return thought;
    }

    // AI 生成（更丰富但更贵）
    try {
      return await aiService.generateInnerThought(module, this.emotion);
    } catch (err) {
      const templates = THOUGHT_TEMPLATES[module] || THOUGHT_TEMPLATES.reflection;
      return templates[Math.floor(Math.random() * templates.length)];
    }
  }

  // ===== ProactiveAgent: Wake-Decide-Respond-Sleep =====

  // 决策：是否应该主动联系用户？
  shouldProactiveMessage(user) {
    const h = new Date().getHours();
    const isNight = h >= 23 || h < 3;

    // 基础概率
    let probability = isNight ? 0.08 : 0.03;

    // 好感度加成
    if (user.intimacy > 50) probability += 0.03;
    if (user.intimacy > 80) probability += 0.02;

    // 情绪加成：孤独时更想找人说话
    if (this.emotion.current.loneliness > 0.3) probability += 0.05;

    // VIP 加成
    if (user.vipLevel === 'moonlight') probability *= 1.3;
    if (user.vipLevel === 'star') probability *= 1.6;

    // 每天上限
    if (user.whisperCountToday >= 2) return false;

    return Math.random() < probability;
  }

  // 决定主动消息的类型
  decideMessageType() {
    const valence = this.emotion.getValence();
    const dominant = this.emotion.getDominantEmotions(1);

    // 孤独时 → 找人说话
    if (this.emotion.current.loneliness > 0.3) return 'whisper';

    // 无聊时 → 碎碎念
    if (this.emotion.current.boredom > 0.3) return 'mutter';

    // 兴奋时 → 发照片
    if (this.emotion.current.excitement > 0.2) return 'photo';

    // 平静时 → 发语音
    if (this.emotion.current.calm > 0.3 && Math.random() < 0.3) return 'voice';

    // 默认
    return Math.random() < 0.5 ? 'whisper' : 'mutter';
  }

  // 获取最近的思维队列（用于 prompt 注入）
  getRecentThoughts() {
    return this.thoughtQueue.slice(-5);
  }
}

module.exports = { CognitiveLoop, COGNITIVE_MODULES };
