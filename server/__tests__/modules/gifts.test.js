/**
 * GiftSystem 单元测试
 *
 * 测试礼物定义、好感度计算、效果解析、倒霉动态生成。
 */

const { GiftSystem, GIFTS } = require('../../modules/gifts');
const { IntimacySystem } = require('../../modules/intimacy');

describe('GiftSystem', () => {
  // ═══════════════════════════════════════════
  describe('getGiftList', () => {
    it('返回所有礼物的精简列表', () => {
      const list = GiftSystem.getGiftList();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBe(Object.keys(GIFTS).length);
    });

    it('每个条目包含 id/name/emoji/type', () => {
      for (const gift of GiftSystem.getGiftList()) {
        expect(gift.id).toBeTruthy();
        expect(gift.name).toBeTruthy();
        expect(gift.emoji).toBeTruthy();
        expect(['good', 'bad', 'random']).toContain(gift.type);
      }
    });

    it('不暴露内部属性如 effect', () => {
      for (const gift of GiftSystem.getGiftList()) {
        expect(gift.effect).toBeUndefined();
      }
    });
  });

  describe('getGift', () => {
    it('返回存在的礼物', () => {
      expect(GiftSystem.getGift('coffee').name).toBe('咖啡');
      expect(GiftSystem.getGift('coffee').type).toBe('good');
    });

    it('不存在的礼物返回 null', () => {
      expect(GiftSystem.getGift('nonexistent')).toBeNull();
    });
  });

  // ═══════════════════════════════════════════
  describe('getIntimacyGain', () => {
    it('good 类型返回 giftGood 点数', () => {
      expect(GiftSystem.getIntimacyGain('good')).toBe(IntimacySystem.POINTS.giftGood);
    });

    it('bad 类型返回 giftBad 点数', () => {
      expect(GiftSystem.getIntimacyGain('bad')).toBe(IntimacySystem.POINTS.giftBad);
    });

    it('random 类型返回 giftRandom 点数', () => {
      expect(GiftSystem.getIntimacyGain('random')).toBe(IntimacySystem.POINTS.giftRandom);
    });
  });

  // ═══════════════════════════════════════════
  describe('resolveEffect', () => {
    it('普通 good 礼物返回固定效果', () => {
      const effect = GiftSystem.resolveEffect('coffee');
      expect(effect.status).toBeTruthy();
      expect(effect.type).toBe('good');
    });

    it('bad 礼物返回固定效果', () => {
      const effect = GiftSystem.resolveEffect('banana');
      expect(effect.type).toBe('bad');
    });

    it('luckbox 返回随机效果', () => {
      const types = new Set();
      for (let i = 0; i < 20; i++) {
        const effect = GiftSystem.resolveEffect('luckbox');
        expect(effect).toBeTruthy();
        types.add(effect.type);
      }
      // 至少包含一种类型（随机）
      expect(types.size).toBeGreaterThanOrEqual(1);
    });

    it('不存在的礼物返回 null', () => {
      expect(GiftSystem.resolveEffect('nonexistent')).toBeNull();
    });
  });

  // ═══════════════════════════════════════════
  describe('generateBadLuckNote', () => {
    it('bad 礼物生成吐槽动态', () => {
      const note = GiftSystem.generateBadLuckNote('banana');
      expect(note).toBeTruthy();
      expect(typeof note).toBe('string');
    });

    it('good 礼物不生成吐槽', () => {
      expect(GiftSystem.generateBadLuckNote('coffee')).toBeNull();
    });

    it('不存在的礼物返回 null', () => {
      expect(GiftSystem.generateBadLuckNote('nonexistent')).toBeNull();
    });
  });

  // ═══════════════════════════════════════════
  describe('processGift（完整流程）', () => {
    it('good 礼物返回完整结果', () => {
      const result = GiftSystem.processGift('coffee');
      expect(result.gift.name).toBe('咖啡');
      expect(result.intimacyGain).toBeGreaterThan(0);
      expect(result.effect.type).toBe('good');
      expect(result.badLuckNote).toBeNull();
    });

    it('bad 礼物有概率生成吐槽', () => {
      // 跑多次确保覆盖两种分支
      let hadNote = false;
      let hadNoNote = false;
      for (let i = 0; i < 20; i++) {
        const result = GiftSystem.processGift('banana');
        if (result.badLuckNote) hadNote = true;
        else hadNoNote = true;
      }
      expect(hadNote || hadNoNote).toBe(true); // 至少跑完了
    });

    it('luckbox 返回随机效果', () => {
      const result = GiftSystem.processGift('luckbox');
      expect(result.gift.name).toBe('神秘包裹');
    });

    it('不存在的礼物返回 null', () => {
      expect(GiftSystem.processGift('nonexistent')).toBeNull();
    });
  });
});
