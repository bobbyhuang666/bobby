/**
 * Andy-Bobby Bridge
 *
 * 对接层：将 Andy 引擎接入 Bobby 系统
 *
 * 职责：
 *   1. 初始化 Andy 世界，将 Bobby 注册为 Agent
 *   2. 同步 Andy 的状态机 → Bobby 的显示状态
 *   3. 同步 Andy 的情绪 → Bobby 的情绪引擎
 *   4. 将 Andy 世界事件注入 Bobby 的 system prompt
 *   5. 替换 worldEngine.js 的事件生成
 *
 * 数据流：
 *   Andy tick → Agent 状态/情绪/事件 → Bridge 转换 → Bobby system prompt
 */

const AndyEngine = require('../andy');
const Schedule = require('../andy/agent/Schedule');

// Bobby 在 Andy 世界里的 Agent ID
const BOBBY_AGENT_ID = 'bobby';

// Bobby 的 INFP 种子记忆（与 bobbyMemory.js SEED_MEMORIES 对应）
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

class AndyBridge {
  constructor() {
    this.andy = null;        // AndyEngine 实例
    this._bobbyAgent = null; // Bobby Agent 引用
    this._initialized = false;
    this._tickTimer = null;
  }

  // ═══════════════════════════════════════════
  // 初始化
  // ═══════════════════════════════════════════

  /**
   * 初始化 Andy 引擎 + 注册 Bobby Agent
   *
   * @param {Object} [options]
   * @param {Date} [options.startTime] - 世界起点（默认当前时间）
   * @param {Object} [options.savedState] - 从持久化恢复的 Andy 世界状态
   * @param {Object} [options.bobbyState] - Bobby 现有的 BobbyState（同步初始状态）
   */
  async init(options = {}) {
    const { startTime, savedState, bobbyState } = options;

    if (savedState) {
      // 从持久化恢复
      this.andy = AndyEngine.fromJSON(savedState);
    } else {
      // 创建新世界
      this.andy = new AndyEngine({
        startTime: startTime || new Date(),
        weather: 'sunny',
      });

      // 注册 Bobby Agent
      this._bobbyAgent = this.andy.addAgent({
        id: BOBBY_AGENT_ID,
        name: 'Bobby',
        personality: { mbti: 'INFP' },
        schedule: Schedule.createStudentSchedule({
          workDays: [2, 4, 6],   // Bobby 周二四六打工
          workStart: 17,
          workEnd: 21,
        }).toJSON(),
        seedMemories: BOBBY_SEED_MEMORIES,
        initialPosition: '宿舍',
        initialState: this._resolveInitialState(bobbyState),
      });

      // TODO: 添加更多角色（未来预设世界）
      // this.andy.addAgent({ id: 'alice', ... });
    }

    // 确保有 Bobby Agent 的引用
    if (!this._bobbyAgent) {
      this._bobbyAgent = this.andy.getAgent(BOBBY_AGENT_ID);
    }

    this._initialized = true;
    console.log('Andy-Bobby 桥接层已初始化');

    return this._bobbyAgent;
  }

  // ═══════════════════════════════════════════
  // Tick 驱动
  // ═══════════════════════════════════════════

  /**
   * 执行一个 Andy tick
   * 由 Bobby 系统的定时任务（cron）调用
   *
   * @returns {Object} tick 结果，包含 Bobby 的状态变化
   */
  tick() {
    if (!this._initialized) return null;

    const result = this.andy.tick();
    const bobbyResult = result.phase.agentThink?.results?.[BOBBY_AGENT_ID];

    return {
      time: result.time,
      bobbyStatus: this.getBobbyStatus(),
      bobbyEmotion: this.getBobbyEmotionSnapshot(),
      worldEvents: this._extractRelevantEvents(result),
      stateChanged: bobbyResult?.stateChanged || false,
    };
  }

  // ═══════════════════════════════════════════
  // 状态同步
  // ═══════════════════════════════════════════

  /**
   * 获取 Bobby 的当前状态（兼容 Bobby 系统格式）
   * @returns {string} 状态名，如 "在上课"
   */
  getBobbyStatus() {
    if (!this._bobbyAgent) return '在发呆';
    return this._bobbyAgent.stateMachine.currentState;
  }

  /**
   * 获取 Bobby 的位置
   * @returns {string}
   */
  getBobbyPosition() {
    if (!this._bobbyAgent) return '宿舍';
    return this._bobbyAgent.position;
  }

  /**
   * 获取 Bobby 的情绪快照（兼容 Bobby 系统格式）
   *
   * 返回一个可直接用于 Bobby prompt 注入的中文情绪描述
   * @returns {string}
   */
  getBobbyEmotionSnapshot() {
    if (!this._bobbyAgent) return '';
    return this._bobbyAgent.emotion.toPromptString();
  }

  /**
   * 获取 Bobby 的情绪数值（给 Bobby 现有 emotionEngine 作为参考）
   * @returns {{ valence: number, arousal: number, dominant: Array }}
   */
  getBobbyEmotionData() {
    if (!this._bobbyAgent) return { valence: 0, arousal: 0.5, dominant: [] };
    return {
      valence: this._bobbyAgent.emotion.getValence(),
      arousal: this._bobbyAgent.emotion.getArousal(),
      dominant: this._bobbyAgent.emotion.getDominant(5),
      stress: this._bobbyAgent.emotion.stress,
    };
  }

  // ═══════════════════════════════════════════
  // 世界上下文（替代 worldEngine.js）
  // ═══════════════════════════════════════════

  /**
   * 获取 Bobby 的世界上下文（用于 system prompt 注入）
   *
   * 替代原来的 worldEngine.getUnusedEvents()
   * 返回格式化的中文文本，可直接拼接到 prompt 里
   *
   * @returns {{ eventTexts: string, nearbyPeople: string, environment: Object }}
   */
  getWorldContext() {
    if (!this._initialized) return null;

    const ctx = this.andy.getWorldContextForBobby(BOBBY_AGENT_ID);
    if (!ctx) return null;

    return {
      // 最近的事件（注入 system prompt）
      eventTexts: ctx.recentEvents || '没有特别的事情发生',

      // 附近的人（注入 system prompt）
      nearbyPeople: ctx.nearbyPeople || '附近没有人',

      // 环境信息
      environment: {
        weather: ctx.weather,
        timeOfDay: ctx.timeOfDay,
        season: ctx.season,
        hour: ctx.hour,
      },

      // Bobby 的需求状态（可选注入）
      needsState: ctx.needsState || '',

      // 情绪调节状态（可选注入）
      emotionRegulation: ctx.emotionRegulation || '',

      // Bobby 的记忆上下文（Andy 记忆系统）
      memoryContext: ctx.memoryContext || '',
    };
  }

  /**
   * 生成 Bobby 今天遇到的世界事件摘要（一行文字，注入 prompt）
   * @returns {string}
   */
  getTodayEventsText() {
    const ctx = this.getWorldContext();
    if (!ctx) return '';

    const parts = [];
    if (ctx.eventTexts && ctx.eventTexts !== '没有特别的事情发生') {
      parts.push(ctx.eventTexts);
    }
    if (ctx.nearbyPeople && ctx.nearbyPeople !== '附近没有人') {
      parts.push(`周围有${ctx.nearbyPeople}`);
    }
    return parts.join('。') || '';
  }

  // ═══════════════════════════════════════════
  // 持久化
  // ═══════════════════════════════════════════

  /**
   * 序列化 Andy 世界状态（用于 MongoDB 或文件持久化）
   * @returns {Object}
   */
  toJSON() {
    if (!this.andy) return null;
    return this.andy.toJSON();
  }

  /**
   * 从 JSON 恢复
   * @param {Object} data
   * @returns {AndyBridge}
   */
  static fromJSON(data) {
    const bridge = new AndyBridge();
    bridge.andy = AndyEngine.fromJSON(data);
    bridge._bobbyAgent = bridge.andy.getAgent(BOBBY_AGENT_ID);
    bridge._initialized = true;
    return bridge;
  }

  // ═══════════════════════════════════════════
  // 内部方法
  // ═══════════════════════════════════════════

  /**
   * 从 Bobby 现有状态推断 Andy 初始状态
   * @private
   * @param {Object} bobbyState - BobbyState MongoDB 文档
   * @returns {string} Andy 状态机的初始状态
   */
  _resolveInitialState(bobbyState) {
    if (!bobbyState || !bobbyState.currentStatus) {
      // 根据当前时间选择初始状态
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

    // Bobby 状态名和 Andy 状态名大部分一致，直接映射
    // 需要特殊映射的少数状态
    const stateMapping = {
      '离线': '在图书馆',  // Andy 没有"离线"概念
    };

    return stateMapping[bobbyState.currentStatus] || bobbyState.currentStatus;
  }

  /**
   * 从 Andy tick 结果中提取 Bobby 相关的事件
   * @private
   */
  _extractRelevantEvents(tickResult) {
    if (!tickResult || !tickResult.phase) return [];

    const events = [];
    const agentResult = tickResult.phase.agentThink?.results?.[BOBBY_AGENT_ID];

    // 1. Agent 思考产生的事件（心智游移、内心独白等）
    if (agentResult?.newEvents) {
      for (const evt of agentResult.newEvents) {
        if (evt.content || evt.type === 'mind_wander') {
          events.push({
            type: evt.type,
            content: evt.content || '',
            thoughtType: evt.thoughtType || '',
            time: evt.time || tickResult.time,
          });
        }
      }
    }

    // 2. 状态变化事件
    if (agentResult?.stateChanged) {
      events.push({
        type: 'state_change',
        content: agentResult.newState || '',
        time: tickResult.time,
      });
    }

    // 3. 交互阶段的相遇事件（同区域其他 Agent）
    const interactionResult = tickResult.phase.interaction?.results;
    if (interactionResult) {
      for (const [pairKey, interaction] of Object.entries(interactionResult)) {
        if (pairKey.includes(BOBBY_AGENT_ID) && interaction?.events) {
          for (const evt of interaction.events) {
            events.push({
              type: 'encounter',
              content: evt.content || '',
              withAgent: evt.withAgent || '',
              time: tickResult.time,
            });
          }
        }
      }
    }

    return events;
  }
}

module.exports = { AndyBridge, BOBBY_AGENT_ID };
