/**
 * Bobby SDK Adapter
 *
 * 用 Andy Engine SDK 替代旧的 andyBridge.js。
 * 封装 Bobby 特有逻辑：多用户上下文、共情共鸣、天气/碎片注入。
 *
 * 数据流：
 *   SDK Character → 引擎状态/情绪/记忆/叙事
 *   Adapter → 叠加 Bobby 专属层（天气、碎片、亲密风格）
 *   BobbyEngine → Socket.IO 广播 + MongoDB 持久化
 */

const path = require('path');
const Schedule = require(path.resolve(__dirname, '../../../andy-engine/agent/Schedule'));
const { Character, NarrativeBuilder } = require(path.resolve(__dirname, '../../../andy-engine/sdk'));
const { getTimeLabel: getSharedTimeLabel } = require('../utils/time');
const { IntimacySystem } = require('../modules/intimacy');
const { SocialEngine } = require('../modules/social');

const BOBBY_AGENT_ID = 'bobby';

// Bobby 的 INFP 种子记忆
const BOBBY_SEED_MEMORIES = [
  { content: '经常吃泡面，康师傅红烧牛肉面', category: 'food', importance: 0.9, emotionTag: 'neutral' },
  { content: '便利店的饭团还不错，金枪鱼的', category: 'food', importance: 0.8, emotionTag: 'neutral' },
  { content: '经常失眠，躺在床上翻来覆去', category: 'sleep', importance: 0.95, emotionTag: 'sad' },
  { content: '凌晨三点还没睡是常有的事', category: 'sleep', importance: 0.8, emotionTag: 'sad' },
  { content: '学的工商管理，感觉什么都没学精', category: 'study', importance: 0.9, emotionTag: 'sad' },
  { content: '对毕业以后有点迷茫，想过一些方向但没信心', category: 'study', importance: 0.85, emotionTag: 'sad' },
  { content: '在便利店兼职，时薪18', category: 'work', importance: 0.8, emotionTag: 'neutral' },
  { content: '打工回来太晚，所以从宿舍搬出来了', category: 'work', importance: 0.85, emotionTag: 'neutral' },
  { content: '老家在泉州，放假有时候会回去', category: 'social', importance: 0.8, emotionTag: 'neutral' },
  { content: '父母在泉州，偶尔打电话，但不常联系', category: 'social', importance: 0.75, emotionTag: 'neutral' },
  { content: '一个人住，没有室友', category: 'social', importance: 0.9, emotionTag: 'neutral' },
  { content: '小单间不大，一张床、一张桌子、一个衣柜', category: 'room', importance: 0.9, emotionTag: 'neutral' },
  { content: '窗户外能看到别人的阳台和一棵树', category: 'room', importance: 0.75, emotionTag: 'neutral' },
  { content: '经常拿起手机又放下，不知道在找什么', category: 'hobby', importance: 0.8, emotionTag: 'neutral' },
  { content: '最近有点丧，但说不上为什么', category: 'mood', importance: 0.7, emotionTag: 'sad' },
];

class BobbySDKAdapter {
  constructor() {
    this._character = null;
    this._initialized = false;
    this._social = new SocialEngine();
  }

  // ═══════════════════════════════════════════
  // 初始化
  // ═══════════════════════════════════════════

  /**
   * 初始化 Bobby 的 SDK Character 实例
   *
   * @param {Object} options
   * @param {Object} [options.savedState] - 从 MongoDB 恢复的 Andy 世界状态
   * @param {Object} [options.bobbyState] - BobbyState 文档（用于推断初始状态）
   */
  async init(options = {}) {
    const { savedState, bobbyState } = options;

    const llmConfig = {
      provider: 'openai-compatible',
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      baseUrl: (process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1').replace(/\/chat\/completions$/, ''),
      maxTokens: 150,
      temperature: 0.85,
    };

    const studentSchedule = Schedule.createStudentSchedule({
      workDays: [2, 4, 6],
      workStart: 17,
      workEnd: 21,
    }).toJSON();

    if (savedState) {
      // 从持久化恢复
      this._character = Character.load(savedState, llmConfig);
    } else {
      // 创建新的
      this._character = new Character({
        id: BOBBY_AGENT_ID,
        name: 'Bobby',
        personality: 'INFP',
        backstory: BOBBY_SEED_MEMORIES.map(m => m.content),
        schedule: studentSchedule,
        initialPosition: '宿舍',
        initialState: this._resolveInitialState(bobbyState),
        llm: llmConfig,
        autoTick: { tickIntervalMinutes: 5, maxCatchupTicks: 288 },
      });

      // 注入种子记忆到 Agent 的记忆系统
      const agent = this._character._engine.world.getAgent(BOBBY_AGENT_ID);
      if (agent && agent.memory) {
        for (const mem of BOBBY_SEED_MEMORIES) {
          agent.memory.addExperience({
            content: mem.content,
            category: mem.category,
            importance: mem.importance,
            emotionTag: mem.emotionTag,
          }, agent.emotion);
        }
      }
    }

    this._initialized = true;
    console.log('BobbySDKAdapter 已初始化（Character SDK 模式）');
    return this._character._agent;
  }

  // ═══════════════════════════════════════════
  // Tick 驱动
  // ═══════════════════════════════════════════

  /**
   * 推进 Andy 世界一个 tick
   * 由定时任务（cron）调用
   *
   * @returns {Object|null} tick 结果
   */
  tick() {
    if (!this._initialized) return null;

    const engine = this._character._engine;
    const agent = engine.world.getAgent(BOBBY_AGENT_ID);
    const prevStatus = agent ? agent.stateMachine.currentState : null;

    // 推进世界
    const tickResult = engine.tick();

    // 检测状态变化
    const newStatus = agent ? agent.stateMachine.currentState : null;
    const stateChanged = prevStatus !== newStatus;

    // 提取 Bobby 相关事件
    const events = this._extractEvents(tickResult);

    // 获取情绪数据
    const emotionData = this.getEmotionData();

    return {
      tickResult,
      stateChanged,
      bobbyStatus: this.getBobbyStatus(),
      bobbyEmotion: emotionData,
      events,
      time: tickResult ? tickResult.time : null,
    };
  }

  // ═══════════════════════════════════════════
  // 事件注入
  // ═══════════════════════════════════════════

  /**
   * 接收用户消息，让 Character 感知用户情绪
   * @param {string} userText - 用户输入的文本
   */
  onUserMessage(userText) {
    if (!this._initialized || !userText) return;

    try {
      const agent = this._character._engine.world.getAgent(BOBBY_AGENT_ID);
      if (agent && agent.emotion) {
        // 将用户情绪信号注入 Character 情绪引擎
        // Character SDK 的情绪引擎通常有 applyEffect 或类似方法
        if (typeof agent.emotion.applyContagion === 'function') {
          agent.emotion.applyContagion(userText);
        } else if (typeof agent.emotion.applyEffect === 'function') {
          // 备用：尝试用 EmotionEffectClassifier 分类后注入
          try {
            const { EmotionEffectClassifier } = require('../andy/core/EmotionEffectClassifier');
            const effect = EmotionEffectClassifier.classify(userText);
            if (effect && Object.keys(effect).length > 0) {
              agent.emotion.applyEffect(effect, 0.3); // 低强度，避免过度反应
            }
          } catch (e) {
            // 分类器不可用时静默失败
          }
        }
      }
    } catch (e) {
      // 情绪感染失败不影响聊天
    }
  }

  // ═══════════════════════════════════════════
  // 状态查询
  // ═══════════════════════════════════════════

  /**
   * 获取 Bobby 当前状态名（中文）
   * @returns {string}
   */
  getBobbyStatus() {
    if (!this._initialized) return '在发呆';
    const agent = this._character._engine.world.getAgent(BOBBY_AGENT_ID);
    return agent ? agent.stateMachine.currentState : '在发呆';
  }

  /**
   * 获取 Bobby 情绪数据
   * @returns {Object} { valence, arousal, stress, dominant, heartRate, current, baseline }
   */
  getEmotionData() {
    if (!this._initialized) return { valence: 0, arousal: 0.5, stress: 2, dominant: [], heartRate: 70, current: {}, baseline: {} };

    const agent = this._character._engine.world.getAgent(BOBBY_AGENT_ID);
    if (!agent || !agent.emotion) return { valence: 0, arousal: 0.5, stress: 2, dominant: [], heartRate: 70, current: {}, baseline: {} };

    const emotion = agent.emotion;
    return {
      valence: emotion.getValence(),
      arousal: emotion.getArousal(),
      stress: agent.stress || 2,
      dominant: emotion.getDominantEmotions(5),
      heartRate: agent.heartRate || 70,
      current: emotion.current,
      baseline: emotion.baseline,
    };
  }

  /**
   * 获取 Bobby 世界上下文（用于构建 system prompt）
   * @returns {Object|null}
   */
  getWorldContext() {
    if (!this._initialized) return null;
    return this._character._engine.getWorldContext(BOBBY_AGENT_ID);
  }

  /**
   * 获取 Andy 引擎的叙事文本
   * @param {Object} [options]
   * @param {string} [options.userText] - 用户消息（用于共情反应）
   * @param {number} [options.relationship] - 关系强度 0-100
   * @returns {string}
   */
  getNarrative(options = {}) {
    if (!this._initialized) return '';
    return this._character._engine.getNarrative(BOBBY_AGENT_ID, options) || '';
  }

  /**
   * 构建 Bobby 的完整 system prompt
   * SDK NarrativeBuilder 处理核心叙事 + Bobby 叠加层处理专属内容
   *
   * @param {Object} params
   * @param {Object} params.user - 用户信息
   * @param {string} params.userText - 用户消息
   * @param {Array}  params.recentNotes - 最近的碎片
   * @param {string} params.weatherContext - 天气信息
   * @param {string} params.bobbySelfMemory - Bobby 自我记忆
   * @param {string} params.memoryProfile - 用户画像
   * @param {Array}  params.recentThoughts - 最近的内心独白
   * @returns {string}
   */
  buildSystemPrompt({ user, userText, recentNotes, weatherContext, bobbySelfMemory, memoryProfile, recentThoughts }) {
    // 1. 用 SDK 的 NarrativeBuilder 生成基础 prompt
    const worldContext = this.getWorldContext();
    if (!worldContext) return '';

    const basePrompt = NarrativeBuilder.buildSystemPrompt(worldContext, {
      characterName: 'Bobby',
      backstory: BOBBY_SEED_MEMORIES.map(m => m.content),
    });

    // 2. Bobby 叠加层
    const overlay = this._buildBobbyOverlay({
      user, userText, recentNotes, weatherContext, bobbySelfMemory, memoryProfile, recentThoughts, worldContext
    });

    return basePrompt + overlay;
  }

  /**
   * 共情共鸣：根据关系强度和人格计算共情系数
   *
   * @param {number} intimacy - 好感度 0-100
   * @returns {number} 0-1 的共情系数
   */
  computeEmpathy(intimacy) {
    if (!this._initialized) return 0.3;

    const agent = this._character._engine.world.getAgent(BOBBY_AGENT_ID);
    if (!agent) return 0.3;

    // 关系因子：sigmoid 曲线
    const relationshipFactor = 1 / (1 + Math.exp(-(intimacy - 25) / 15));

    // 人格因子：宜人性
    const personalityFactor = agent.personality
      ? agent.personality.ocean.agreeableness
      : 0.75;

    // 状态因子
    let stateFactor = 1.0;
    if (agent.socialEnergy < 0.3) stateFactor *= 0.5;
    if (agent.emotion && agent.emotion.getValence() < -0.15) stateFactor *= 0.6;
    if (agent.needs && agent.needs.needs.energy < 0.3) stateFactor *= 0.7;

    return Math.min(1, relationshipFactor * personalityFactor * stateFactor);
  }

  // ═══════════════════════════════════════════
  // 持久化
  // ═══════════════════════════════════════════

  /**
   * 序列化世界状态（存入 MongoDB）
   * @returns {Object}
   */
  toJSON() {
    if (!this._initialized) return null;
    return this._character.save();
  }

  /**
   * 从 JSON 恢复
   * @param {Object} data - toJSON() 返回的状态
   * @returns {BobbySDKAdapter}
   */
  static fromJSON(data) {
    const adapter = new BobbySDKAdapter();
    const llmConfig = {
      provider: 'openai-compatible',
      apiKey: process.env.DEEPSEEK_API_KEY,
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      baseUrl: (process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1').replace(/\/chat\/completions$/, ''),
      maxTokens: 150,
      temperature: 0.85,
    };
    adapter._character = Character.load(data, llmConfig);
    adapter._initialized = true;
    return adapter;
  }

  // ═══════════════════════════════════════════
  // 内部方法
  // ═══════════════════════════════════════════

  /**
   * 构建 Bobby 专属叠加层（追加到 NarrativeBuilder 输出之后）
   * @private
   */
  _buildBobbyOverlay({ user, userText, recentNotes, weatherContext, bobbySelfMemory, memoryProfile, recentThoughts, worldContext }) {
    const sections = [];

    // Bobby 身份细节（NarrativeBuilder 的身份声明太通用，需要补充）
    sections.push(`# 你是 Bobby
一个独居的大学生，在厦门上学，课余在便利店打工（晚班）。
你之前住宿舍，但打工回来太晚吵到室友，大三搬出来自己租了个小单间。
你住在厦门，偶尔会提到厦门的日常——海风、天气、小吃、公交，但不会刻意强调城市名。
你老家在泉州，放假有时候会回去。几乎没离开过福建。
你是 INFP，容易想太多，心里戏很多但嘴上说不出几句。
你容易失眠，睡眠很浅。不太会做饭，经常吃泡面或便利店的饭团。
你有几个朋友：小雨是同班同学，话多但人好；阿浩是便利店同事，沉默但靠谱；楼下有只流浪猫，你经常去看它。`);

    // V2: 社交上下文注入
    const socialCtx = this._social.getSocialContext();
    if (socialCtx) {
      sections.push(socialCtx + '。这些是你和朋友之间的日常，可能会影响你此刻的状态。');
    }

    // 时间信息（使用共享时间工具，与 Bobby 自有时段保持一致）
    const now = new Date();
    const hour = now.getHours();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const timeLabel = getSharedTimeLabel();
    sections.push(`现在是${now.getMonth() + 1}月${now.getDate()}日周${weekdays[now.getDay()]}，${timeLabel}，${hour}点。你刚才在${this.getBobbyStatus()}，这会影响你的回复方式。`);

    // 碎片注入（引导 Bobby 自然引用自己的动态）
    if (recentNotes && recentNotes.length > 0) {
      const notesText = recentNotes.slice(0, 3).map(n => n.content).join('；');
      sections.push(`你最近发了这些动态：${notesText}
这些是你自己写的。如果对话和动态有关，可以自然地提到。它们是你此刻生活的一部分。`);
    }

    // 天气注入（始终注入，SDK 不覆盖天气）
    if (weatherContext) {
      sections.push(`现在厦门的真实天气：${weatherContext}。天气会影响你的感受——下雨天你可能会自然地说"外面下雨了"，天冷会说"好冷"，天热会说"好热"。如果对方问天气必须用真实数据回答。`);
    }

    // Bobby 自我记忆
    if (bobbySelfMemory) {
      sections.push(`你自己的经历：${bobbySelfMemory}。这些是你的生活细节，可以在回复中自然提及。`);
    }

    // 用户画像
    if (memoryProfile) {
      sections.push(`你对这个人的了解：${memoryProfile}`);
    }

    // 内心独白
    if (recentThoughts && recentThoughts.length > 0) {
      const thoughtsText = recentThoughts.slice(-3).map(t => t.content || t).join('；');
      sections.push(`你最近在想：${thoughtsText}`);
    }

    // Bobby 行为指南（补充 NarrativeBuilder 的通用指南）
    const intimacyLevel = user ? (user.getIntimacyLevel ? user.getIntimacyLevel().name : '陌生') : '陌生';
    sections.push(`# 回复风格
你们的关系是"${intimacyLevel}"。
${IntimacySystem.getStyleGuide(intimacyLevel)}
- 不要使用 emoji
- 不要主动提到你是 AI 或语言模型
- 不要展开太多话题，一次只说一件事
- 如果对方问你不知道的事，就说不知道
- 回复控制在 1-3 句话`);

    return '\n\n' + sections.join('\n\n');
  }

  // 风格指南已委托给 modules/intimacy IntimacySystem.getStyleGuide()

  /**
   * 推断初始状态
   * @private
   */
  _resolveInitialState(bobbyState) {
    if (bobbyState && bobbyState.currentStatus) {
      const mapping = { '离线': '在图书馆' };
      return mapping[bobbyState.currentStatus] || bobbyState.currentStatus;
    }
    const hour = new Date().getHours();
    if (hour >= 23 || hour < 3) return '还没睡呢';
    if (hour >= 3 && hour < 6) return '快睡了';
    if (hour >= 6 && hour < 8) return '刚醒';
    if (hour >= 8 && hour < 12) return '在上课';
    if (hour >= 12 && hour < 14) return '在食堂';
    if (hour >= 14 && hour < 17) return '在图书馆';
    if (hour >= 17 && hour < 21) return '在打工';
    return '先躺一会';
  }

  /**
   * 从 tick 结果中提取 Bobby 相关事件
   * @private
   */
  _extractEvents(tickResult) {
    if (!tickResult || !tickResult.phase) return [];

    const events = [];
    const agentResult = tickResult.phase.agentThink?.results?.[BOBBY_AGENT_ID];

    if (agentResult?.newEvents) {
      for (const evt of agentResult.newEvents) {
        if (evt.type === 'state_change') {
          // SDK 状态变更事件：{ type, from, to, time }
          events.push({
            type: 'state_change',
            content: evt.to || '',
            time: evt.time || tickResult.time,
          });
        } else if (evt.content || evt.type === 'mind_wander') {
          events.push({
            type: evt.type,
            content: evt.content || '',
            thoughtType: evt.thoughtType || '',
            time: evt.time || tickResult.time,
          });
        }
      }
    }

    return events;
  }
}

module.exports = { BobbySDKAdapter, BOBBY_AGENT_ID };
