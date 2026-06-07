/**
 * GiftSystem — 礼物系统
 *
 * 从 routes/gifts.js 抽取礼物定义和业务逻辑。
 * 路由层只负责 HTTP 协议，核心逻辑在此模块。
 */

const { IntimacySystem } = require('../intimacy');

// ═══════════════════════════════════════════
// 礼物定义
// ═══════════════════════════════════════════

const GIFTS = {
  coffee:   { name: '咖啡', emoji: '☕', type: 'good', effect: '嗯...好像清醒了一点' },
  medicine: { name: '感冒药', emoji: '💊', type: 'good', effect: '鼻子通了，终于' },
  taxi:     { name: '打车券', emoji: '🚕', type: 'good', effect: '到了。不用挤地铁了' },
  book:     { name: '一本书', emoji: '📖', type: 'good', effect: '在看一本新的，还不错' },
  blanket:  { name: '毯子', emoji: '🧸', type: 'good', effect: '暖和了，好困' },
  food:     { name: '宵夜', emoji: '🍜', type: 'good', effect: '饱了。谢谢...不知道该谢谁' },
  luckbox:  { name: '神秘包裹', emoji: '📦', type: 'random', effect: null },
  banana:   { name: '香蕉', emoji: '🍌', type: 'bad', effect: '踩到了。滑了一跤' },
  alarm:    { name: '十个闹钟', emoji: '⏰', type: 'bad', effect: '......谁放的。吵死了' },
  homework: { name: '一套卷子', emoji: '📝', type: 'bad', effect: '......写不完。太多了' },
  rain:     { name: '求雨符', emoji: '🌧️', type: 'bad', effect: '......下雨了。没带伞' },
  rock:     { name: '一块石头', emoji: '🪨', type: 'bad', effect: '......谁放的石头。踢到脚了' },
};

const LUCKBOX_EFFECTS = [
  { status: '捡到钱了。今天运气不错', type: 'good' },
  { status: '收到一张明信片。不知道谁寄的', type: 'good' },
  { status: '打开是空的...', type: 'bad' },
  { status: '里面是一只蟑螂', type: 'bad' },
  { status: '是一颗糖。还不错', type: 'good' },
];

const BAD_LUCK_NOTES = {
  banana: ['出门踩到香蕉皮了。裤子脏了。今天不宜出门。', '鞋底黏黏的...香蕉皮。'],
  alarm: ['不知道谁放了十个闹钟。全部同时响了。差点聋了。', '闹钟响了十个。心脏受不了。'],
  homework: ['桌上多了一套卷子。写到一半放弃了。', '谁给我寄的卷子...写不完。'],
  rain: ['突然下雨了。全身湿透。鞋子里面都是水。', '今天下雨了。没带伞。又。'],
  rock: ['踢到一块石头。脚趾头疼。新鞋也踢坏了。', '地上不知道哪来的石头。踢到了。'],
};

// ═══════════════════════════════════════════
// 核心 API
// ═══════════════════════════════════════════

class GiftSystem {
  /**
   * 获取礼物列表（给前端）
   * @returns {Array<{ id, name, emoji, type }>}
   */
  static getGiftList() {
    return Object.entries(GIFTS).map(([id, g]) => ({
      id,
      name: g.name,
      emoji: g.emoji,
      type: g.type,
    }));
  }

  /**
   * 获取礼物定义
   * @param {string} giftId
   * @returns {Object|null}
   */
  static getGift(giftId) {
    return GIFTS[giftId] || null;
  }

  /**
   * 计算好感度增益
   * @param {string} type - 礼物类型 'good' | 'bad' | 'random'
   * @returns {number}
   */
  static getIntimacyGain(type) {
    if (type === 'bad') return IntimacySystem.POINTS.giftBad;
    if (type === 'random') return IntimacySystem.POINTS.giftRandom;
    return IntimacySystem.POINTS.giftGood;
  }

  /**
   * 解析礼物效果（神秘包裹需要随机）
   * @param {string} giftId
   * @returns {{ status: string, type: string }}
   */
  static resolveEffect(giftId) {
    const gift = GIFTS[giftId];
    if (!gift) return null;

    if (giftId === 'luckbox') {
      return LUCKBOX_EFFECTS[Math.floor(Math.random() * LUCKBOX_EFFECTS.length)];
    }

    return { status: gift.effect, type: gift.type };
  }

  /**
   * 生成倒霉礼物的吐槽动态
   * @param {string} giftId
   * @returns {string|null}
   */
  static generateBadLuckNote(giftId) {
    const notes = BAD_LUCK_NOTES[giftId];
    if (!notes || notes.length === 0) return null;
    return notes[Math.floor(Math.random() * notes.length)];
  }

  /**
   * 完整送礼流程（纯逻辑，不含 DB 操作）
   * @param {string} giftId
   * @returns {{ gift, intimacyGain, effect, badLuckNote } | null}
   */
  static processGift(giftId) {
    const gift = GIFTS[giftId];
    if (!gift) return null;

    const intimacyGain = GiftSystem.getIntimacyGain(gift.type);
    const effect = GiftSystem.resolveEffect(giftId);
    const badLuckNote = gift.type === 'bad' && Math.random() < 0.5
      ? GiftSystem.generateBadLuckNote(giftId)
      : null;

    return { gift, intimacyGain, effect, badLuckNote };
  }
}

module.exports = { GiftSystem, GIFTS };
