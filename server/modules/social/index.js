/**
 * SocialSystem — Bobby 社交关系系统
 *
 * V2 核心模块：Bobby 不是孤立存在的，他有自己的朋友和社交圈。
 *
 * 设计理念：
 *   - 朋友是预定义的 NPC，有自己的名字、性格、和 Bobby 的关系
 *   - 社交事件是 Bobby 生活的一部分，会影响他的情绪
 *   - Bobby 会提到朋友，但不会透露太多细节（保持神秘感）
 *   - 朋友关系是单向的——只从 Bobby 的视角描述
 *
 * 数据流：
 *   Friend 定义 → SocialEngine 生成事件 → 情绪引擎消费 → 碎片/对话引用
 */

const { BOBBY_DEFAULTS } = require('../../config/bobbyDefaults');

// ═══════════════════════════════════════════
// Bobby 的朋友（NPC 定义）
// ═══════════════════════════════════════════

const FRIENDS = [
  {
    id: 'xiaoyu',
    name: '小雨',
    gender: 'female',
    relation: '同班同学',
    personality: '开朗、话多、偶尔大大咧咧',
    traits: ['外向', '爱笑', '有点冒失'],
    closeness: 0.6,       // 与 Bobby 的亲密度 0-1
    interactionStyle: '主动找 Bobby 聊天，偶尔拉他出去',
    // 与 Bobby 互动的典型场景
    scenarios: [
      '小雨发了一张食堂的照片',
      '小雨问 Bobby 作业写了没',
      '小雨说今天上课老师点名了',
      '小雨发了一个搞笑视频',
      '小雨问周末要不要一起去海边',
    ],
  },
  {
    id: 'ahao',
    name: '阿浩',
    gender: 'male',
    relation: '便利店同事',
    personality: '沉默、靠谱、偶尔冷幽默',
    traits: ['安静', '细心', '不爱说话'],
    closeness: 0.5,
    interactionStyle: '一起打工时偶尔聊几句，下班后各回各家',
    scenarios: [
      '阿浩帮 Bobby 顶了一个晚班',
      '阿浩说今天便利店进了新口味的饭团',
      '阿浩下班时问 Bobby 要不要一起走',
      '阿浩默默递了一瓶水给 Bobby',
      '阿浩说他可能要辞职了',
    ],
  },
  {
    id: 'linjie',
    name: '隔壁的',
    gender: 'unknown',
    relation: '邻居',
    personality: '神秘、几乎不交流、但灯总是亮到很晚',
    closeness: 0.2,
    interactionStyle: '偶尔在走廊碰到点点头，几乎没有对话',
    scenarios: [
      '隔壁的灯又亮到很晚',
      '走廊里碰到隔壁的，点了个头',
      '隔壁好像在做饭，香味飘过来了',
      '隔壁传来吉他声',
      '隔壁好像搬走了，今天很安静',
    ],
  },
  {
    id: 'bianliyima',
    name: '便利店阿姨',
    gender: 'female',
    relation: '便利店常客关系',
    personality: '热心、爱唠叨、偶尔送东西',
    closeness: 0.35,
    interactionStyle: '每次去便利店都会聊几句',
    scenarios: [
      '便利店阿姨又送了个棒棒糖',
      '便利店阿姨问 Bobby 怎么又瘦了',
      '便利店阿姨说今天关东煮萝卜最好吃',
      '便利店阿姨帮他留了最后一个饭团',
      '便利店阿姨说她儿子也在这边上大学',
    ],
  },
  {
    id: 'maomi',
    name: '楼下的猫',
    gender: 'unknown',
    relation: '流浪猫（Bobby 单方面认定的朋友）',
    personality: '高冷、偶尔蹭人、来去自由',
    closeness: 0.45,
    interactionStyle: 'Bobby 偶尔下楼看它，给它倒水',
    scenarios: [
      '楼下的猫又来了',
      '猫在窗台上晒太阳',
      '给猫倒了点水，它闻了闻走了',
      '猫蹭了一下 Bobby 的腿',
      '好几天没看到那只猫了',
      '猫叼了一片树叶放在门口',
    ],
  },
];

// ═══════════════════════════════════════════
// 社交事件类型
// ═══════════════════════════════════════════

const EVENT_TYPES = {
  FRIEND_INTERACTION: 'friend_interaction',   // 与朋友的互动
  SOCIAL_THOUGHT: 'social_thought',           // 想起某个人
  SOCIAL_ABSENCE: 'social_absence',           // 某人不在/好久没联系
  SOCIAL_CONFLICT: 'social_conflict',         // 社交摩擦（轻微）
  SOCIAL_WARMTH: 'social_warmth',             // 社交温暖时刻
};

// ═══════════════════════════════════════════
// SocialEngine
// ═══════════════════════════════════════════

class SocialEngine {
  constructor() {
    this.friends = FRIENDS;
    this.recentEvents = [];       // 最近的社交事件 [{ key, content }] — key 用于去重，content 用于上下文
    this.maxRecentEvents = 20;
  }

  /**
   * 获取所有朋友（只读）
   */
  getFriends() {
    return this.friends;
  }

  /**
   * 根据 ID 获取朋友
   */
  getFriend(id) {
    return this.friends.find(f => f.id === id) || null;
  }

  /**
   * 生成一个社交事件
   *
   * 策略：
   *   1. 40% 朋友互动（随机选一个朋友 + 场景）
   *   2. 25% 想起某人（内心独白）
   *   3. 20% 社交温暖时刻
   *   4. 15% 某人不在/好久没联系
   *
   * @param {Object} options
   * @param {Object} [options.emotionEngine] - 当前情绪状态
   * @param {string} [options.currentStatus] - Bobby 当前状态
   * @returns {Object|null} 社交事件
   */
  // generateEvent 定义在下方（带动态亲密度更新）

  /**
   * 生成碎片内容（社交相关）
   * 供 NoteSystem 使用，返回一段可以作为碎片发布的文字
   */
  generateSocialNote({ emotionEngine } = {}) {
    const event = this.generateEvent({ emotionEngine });
    if (!event) return null;

    // 将社交事件转化为碎片文字
    return this._eventToNote(event);
  }

  /**
   * 获取社交上下文（供 AI prompt 使用）
   * 返回 Bobby 最近的社交活动摘要
   */
  getSocialContext() {
    if (this.recentEvents.length === 0) return null;

    const recent = this.recentEvents.slice(-5).map(e => e.content);
    return `最近的社交动态：${recent.join('；')}`;
  }

  // ─── 内部方法 ───

  _generateInteraction() {
    const friend = this._pickFriend();
    if (!friend || !friend.scenarios.length) return null;

    const scenario = friend.scenarios[Math.floor(Math.random() * friend.scenarios.length)];

    return {
      type: EVENT_TYPES.FRIEND_INTERACTION,
      friendId: friend.id,
      friendName: friend.name,
      content: scenario,
      emotionImpact: this._getInteractionEmotion(friend),
    };
  }

  _generateSocialThought(emotionEngine) {
    const friend = this._pickFriend();
    if (!friend) return null;

    const thoughts = [
      `不知道${friend.name}在干嘛`,
      `好久没见${friend.name}了`,
      `${friend.name}应该在忙吧`,
      `想起${friend.name}上次说的`,
      `想给${friend.name}发消息，但算了`,
    ];

    // 孤独时更可能想起朋友
    if (emotionEngine && emotionEngine.current && emotionEngine.current.loneliness > 0.3) {
      thoughts.push(
        `要是${friend.name}在就好了`,
        `有点想找${friend.name}聊聊`,
        `一个人待着。想起${friend.name}`,
      );
    }

    return {
      type: EVENT_TYPES.SOCIAL_THOUGHT,
      friendId: friend.id,
      friendName: friend.name,
      content: thoughts[Math.floor(Math.random() * thoughts.length)],
      emotionImpact: { loneliness: -0.05, calm: 0.02 },
    };
  }

  _generateWarmth() {
    const friend = this._pickFriendWeighted();
    if (!friend) return null;

    const warmthTemplates = {
      xiaoyu: [
        '小雨发了一个搞笑视频过来。笑了一下。',
        '小雨说"你怎么又不回消息"。但语气不像是在生气。',
        '小雨帮 Bobby 占了个座。',
      ],
      ahao: [
        '阿浩下班时递了一瓶水。没说话。',
        '阿浩帮 Bobby 多做了一份关东煮。',
        '阿浩说"你先走吧，我来收"。',
      ],
      bianliyima: [
        '便利店阿姨说"年轻人要多吃点"。',
        '阿姨又送了个棒棒糖。不知道为什么。',
      ],
      maomi: [
        '猫今天主动蹭过来了。',
        '猫在脚边睡着了。不敢动。',
        '猫叼了一片树叶放在门口。',
      ],
      linjie: [
        '隔壁传来吉他声。挺好听的。',
        '走廊里碰到隔壁的，对方笑了笑。',
      ],
    };

    const templates = warmthTemplates[friend.id] || [`${friend.name}今天挺好的`];
    const content = templates[Math.floor(Math.random() * templates.length)];

    return {
      type: EVENT_TYPES.SOCIAL_WARMTH,
      friendId: friend.id,
      friendName: friend.name,
      content,
      emotionImpact: { joy: 0.08, contentment: 0.06, loneliness: -0.1 },
    };
  }

  _generateAbsence() {
    const friend = this._pickFriend();
    if (!friend) return null;

    const absenceTemplates = [
      `好几天没看到${friend.name}了`,
      `${friend.name}好像很忙。没联系`,
      `想给${friend.name}发消息。但不知道说什么`,
      `${friend.name}今天没来`,
    ];

    // 低亲密度的朋友不产生缺席感
    if (friend.closeness < 0.3) return null;

    return {
      type: EVENT_TYPES.SOCIAL_ABSENCE,
      friendId: friend.id,
      friendName: friend.name,
      content: absenceTemplates[Math.floor(Math.random() * absenceTemplates.length)],
      emotionImpact: { loneliness: 0.08, sadness: 0.03 },
    };
  }

  /**
   * 随机选择一个朋友
   */
  _pickFriend() {
    return this.friends[Math.floor(Math.random() * this.friends.length)];
  }

  /**
   * 互动事件的情绪影响
   */
  _getInteractionEmotion(friend) {
    // 亲密度越高，正面情绪影响越大
    const warmth = friend.closeness * 0.1;
    return {
      joy: warmth * 0.5,
      contentment: warmth * 0.3,
      loneliness: -warmth * 0.4,
    };
  }

  /**
   * 将社交事件转化为碎片文字
   */
  _eventToNote(event) {
    if (event.type === EVENT_TYPES.FRIEND_INTERACTION || event.type === EVENT_TYPES.SOCIAL_WARMTH) {
      return event.content;
    }
    if (event.type === EVENT_TYPES.SOCIAL_THOUGHT) {
      return event.content;
    }
    if (event.type === EVENT_TYPES.SOCIAL_ABSENCE) {
      return event.content;
    }
    return null;
  }

  // ═══════════════════════════════════════════
  // V2: NPC 关系动态演化
  // ═══════════════════════════════════════════

  /**
   * 加载持久化的 NPC 关系数据，替换 FRIENDS 的静态 closeness
   * @param {Array} npcRelationships - BobbyState.npcRelationships
   */
  loadRelationships(npcRelationships) {
    if (!npcRelationships || !Array.isArray(npcRelationships)) return;
    for (const rel of npcRelationships) {
      const friend = this.friends.find(f => f.id === rel.friendId);
      if (friend) {
        friend.closeness = rel.closeness;
        friend._lastInteraction = rel.lastInteraction;
        friend._interactionCount = rel.interactionCount || 0;
        friend._recentAutonomous = rel.recentAutonomous || [];
      }
    }
  }

  /**
   * 导出当前动态关系状态（用于持久化到 BobbyState）
   * @returns {Array}
   */
  exportRelationships() {
    return this.friends.map(f => ({
      friendId: f.id,
      closeness: f.closeness,
      lastInteraction: f._lastInteraction || null,
      interactionCount: f._interactionCount || 0,
      recentAutonomous: (f._recentAutonomous || []).slice(-5),
    }));
  }

  /**
   * 事件发生后更新亲密度
   * @param {string} friendId
   * @param {number} delta - closeness 变化量
   */
  updateCloseness(friendId, delta) {
    const friend = this.friends.find(f => f.id === friendId);
    if (!friend) return;
    friend.closeness = Math.max(0.05, Math.min(1.0, friend.closeness + delta));
    friend._lastInteraction = new Date();
    friend._interactionCount = (friend._interactionCount || 0) + 1;
  }

  /**
   * 重写 generateEvent，事件后自动更新亲密度
   */
  generateEvent({ emotionEngine, currentStatus } = {}) {
    const roll = Math.random();
    let event;

    if (roll < 0.40) {
      event = this._generateInteraction();
    } else if (roll < 0.65) {
      event = this._generateSocialThought(emotionEngine);
    } else if (roll < 0.85) {
      event = this._generateWarmth();
    } else {
      event = this._generateAbsence();
    }

    if (!event) return null;

    // 去重（同时存储 key 和 content）
    const key = `${event.friendId}_${event.type}_${event.content.slice(0, 10)}`;
    if (this.recentEvents.some(e => e.key === key)) return null;

    this.recentEvents.push({ key, content: event.content });
    if (this.recentEvents.length > this.maxRecentEvents) {
      this.recentEvents.shift();
    }

    // 动态更新亲密度
    if (event.emotionImpact) {
      const delta = event.emotionImpact.joy > 0 ? 0.01 : (event.emotionImpact.loneliness > 0 ? -0.005 : 0.005);
      this.updateCloseness(event.friendId, delta);
    }

    return event;
  }

  /**
   * 重写 _pickFriendWeighted，使用动态 closeness
   */
  _pickFriendWeighted() {
    const total = this.friends.reduce((sum, f) => sum + f.closeness, 0);
    let r = Math.random() * total;
    for (const f of this.friends) {
      r -= f.closeness;
      if (r <= 0) return f;
    }
    return this.friends[this.friends.length - 1];
  }

  // ═══════════════════════════════════════════
  // V2: NPC 自主行为
  // ═══════════════════════════════════════════

  // NPC 自主行为模板：每个 NPC 独立于 Bobby 做的事情
  static NPC_AUTONOMOUS = {
    xiaoyu: [
      '小雨在图书馆自习到很晚',
      '小雨发了条朋友圈，是一张天空的照片',
      '小雨今天穿了一件新衣服，挺好看的',
      '小雨和别的同学去吃火锅了',
      '小雨在群里发了一个表情包',
    ],
    ahao: [
      '阿浩今天帮人修了个电脑',
      '阿浩一个人坐在便利店后面发呆',
      '阿浩买了个新耳机',
      '阿浩今天话比平时多一点',
      '阿浩提前把货架理好了',
    ],
    linjie: [
      '隔壁又在做饭，今天是咖喱的味道',
      '隔壁凌晨两点还亮着灯',
      '隔壁好像在看什么搞笑的节目',
      '走廊里有快递，不知道是不是隔壁的',
      '隔壁今天很安静',
    ],
    bianliyima: [
      '便利店阿姨今天心情不错，一直在哼歌',
      '阿姨说她女儿要回来了',
      '阿姨换了个新发型',
      '阿姨今天送了关东煮给流浪猫',
      '阿姨在看广场舞视频',
    ],
    maomi: [
      '猫在垃圾桶旁边翻东西',
      '猫趴在车顶上晒太阳',
      '猫追了一只蝴蝶，没追到',
      '猫今天躲起来了，叫不出来',
      '猫在草地上打滚',
    ],
  };

  /**
   * 生成一个 NPC 自主行为（不经过 Bobby，NPC 自己在做的事）
   * @param {Object} options
   * @param {Object} [options.emotionEngine] - Bobby 的情绪状态
   * @returns {Object|null} { friendId, friendName, content, type }
   */
  generateAutonomousBehavior({ emotionEngine } = {}) {
    // 按亲密度加权选择 NPC（亲密度高的更可能出现）
    const friend = this._pickFriendWeighted();
    if (!friend) return null;

    const templates = SocialEngine.NPC_AUTONOMOUS[friend.id];
    if (!templates || templates.length === 0) return null;

    const content = templates[Math.floor(Math.random() * templates.length)];

    // 去重（和最近的自主行为对比）
    const recent = friend._recentAutonomous || [];
    if (recent.some(r => r.content === content)) return null;

    // 记录
    friend._recentAutonomous = friend._recentAutonomous || [];
    friend._recentAutonomous.push({ content, time: new Date() });
    if (friend._recentAutonomous.length > 5) {
      friend._recentAutonomous.shift();
    }

    return {
      friendId: friend.id,
      friendName: friend.name,
      content,
      type: 'autonomous',
    };
  }

  /**
   * 获取 NPC 关系摘要（供 prompt 注入）
   */
  getRelationshipSummary() {
    const lines = this.friends
      .filter(f => f._interactionCount > 0)
      .sort((a, b) => b.closeness - a.closeness)
      .slice(0, 3)
      .map(f => {
        const closenessLabel = f.closeness >= 0.7 ? '亲近' : f.closeness >= 0.4 ? '普通' : '疏远';
        return `${f.name}（${f.relation}，关系${closenessLabel}）`;
      });
    return lines.length > 0 ? '你身边的人：' + lines.join('、') : null;
  }
}

module.exports = { SocialEngine, FRIENDS, EVENT_TYPES };
