/**
 * IntimacySystem — 亲密关系系统
 *
 * 统一管理好感度等级、加减分、风格指南。
 * 从 User.js / aiService.js / BobbySDKAdapter.js / bobbyDefaults.js 中抽取，
 * 消除四处重复定义。
 *
 * 设计为纯函数 + 静态方法，无副作用，方便测试和复用。
 */

// 从 bobbyDefaults 读取（前端也用同一份配置）
const { BOBBY_DEFAULTS } = require('../../config/bobbyDefaults');
const LEVELS = BOBBY_DEFAULTS.intimacyLevels;
const POINTS = BOBBY_DEFAULTS.intimacyPoints;

// ═══════════════════════════════════════════
// 风格指南（回复长度 + 语气 + 行为）
// ═══════════════════════════════════════════

const STYLE_GUIDES = {
  '陌生': {
    replyLength: '2-5个字',
    tone: '礼貌但有距离感',
    examples: '"谢谢""嗯嗯""还好""哈哈"',
    behavior: '不会冷淡，但也不会主动展开',
    prompt: [
      '- 礼貌但有距离感',
      '- 回复简短客气，2-5个字',
      '- 常用："谢谢""嗯嗯""还好""哈哈"',
      '- 不会冷淡，但也不会主动展开',
    ].join('\n'),
  },
  '认识': {
    replyLength: '2-5个字',
    tone: '开始有点不知道怎么接话',
    examples: '"还行""嗯""哈哈 是""还行吧"',
    behavior: '有点笨拙，但不是冷漠',
    prompt: [
      '- 你们算认识了，开始有点不知道怎么接话',
      '- 回复偏简短，2-5个字，偶尔词不达意',
      '- 常用："还行""嗯""哈哈 是""还行吧"',
      '- 有点笨拙，但不是冷漠',
    ].join('\n'),
  },
  '熟悉': {
    replyLength: '3-8个字',
    tone: '自然放松',
    examples: '可以开玩笑、可以吐槽',
    behavior: '语气像朋友之间回评论',
    prompt: [
      '- 你们挺熟了，回复自然放松，3-8个字',
      '- 可以开玩笑、可以吐槽、可以说日常',
      '- 语气像朋友之间回评论',
    ].join('\n'),
  },
  '默契': {
    replyLength: '3-10个字',
    tone: '随意、温暖',
    examples: '可以提只有你们知道的事',
    behavior: '语气温暖但不刻意',
    prompt: [
      '- 你们之间有默契，回复可以更随意，3-10个字',
      '- 可以提只有你们知道的事',
      '- 语气温暖但不刻意',
    ].join('\n'),
  },
  '信赖': {
    replyLength: '4-12个字',
    tone: '走心、真诚',
    examples: '可以说平时不会说的话',
    behavior: '深夜知己',
    prompt: [
      '- 这个人是你的深夜知己，回复可以更走心',
      '- 可以说一些平时不会说的话',
      '- 4-12个字，真诚但保持你的性格',
    ].join('\n'),
  },
};

// aiService.buildSystemPrompt 中的亲密关系 prompt 片段
const PROMPT_INJECTIONS = {
  '陌生': '你们刚认识，不太会接话，但不会冷冰冰地推开对方。笨拙但真诚。',
  '认识': '你们算认识了，聊天会稍微放松一点，但还是会有点拘谨。',
  '熟悉': '你们挺熟了，可以自然地聊天，偶尔会开个小玩笑。',
  '默契': '你们之间有一种不需要说破的默契。可以更自然地分享日常，不用刻意找话题。',
  '信赖': '这个人是你可以说真心话的人。深夜的时候，那些白天不会说的话，会想告诉他/她。',
};

// ═══════════════════════════════════════════
// 核心 API
// ═══════════════════════════════════════════

class IntimacySystem {
  /**
   * 获取好感度等级
   * @param {number} intimacy - 好感度数值 0-100
   * @returns {{ name: string, desc: string, value: number }}
   */
  static getLevel(intimacy) {
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      if (intimacy >= LEVELS[i].threshold) {
        return { name: LEVELS[i].name, desc: LEVELS[i].desc, value: intimacy };
      }
    }
    return { name: LEVELS[0].name, desc: LEVELS[0].desc, value: intimacy };
  }

  /**
   * 计算加分后的新值（纯函数，不修改 user）
   * @param {number} current - 当前好感度
   * @param {number} points - 要加的点数（可为负）
   * @returns {{ newValue: number, upgraded: boolean, oldLevel: string, newLevel: string }}
   */
  static addPoints(current, points) {
    const oldLevel = IntimacySystem.getLevel(current).name;
    const newValue = Math.max(0, Math.min(100, current + points));
    const newLevel = IntimacySystem.getLevel(newValue).name;
    return {
      newValue,
      upgraded: oldLevel !== newLevel,
      oldLevel,
      newLevel,
    };
  }

  /**
   * 获取风格指南（供 adapter 和 comment reply 使用）
   * @param {string} levelName - 等级名称
   * @returns {string} 多行 prompt 文本
   */
  static getStyleGuide(levelName) {
    const guide = STYLE_GUIDES[levelName];
    return guide ? guide.prompt : STYLE_GUIDES['陌生'].prompt;
  }

  /**
   * 获取 prompt 注入文本（供 aiService.buildSystemPrompt 使用）
   * @param {string} levelName - 等级名称
   * @returns {string}
   */
  static getPromptInjection(levelName) {
    return PROMPT_INJECTIONS[levelName] || PROMPT_INJECTIONS['陌生'];
  }

  /**
   * 获取等级配置（只读）
   */
  static get LEVELS() { return LEVELS; }
  static get POINTS() { return { ...POINTS }; }
}

module.exports = { IntimacySystem, LEVELS, POINTS };
