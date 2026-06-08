/**
 * User 模型测试
 *
 * 直接测试 IntimacySystem（User.js 的真实委托目标），
 * 而非用 MockUser 类重新实现逻辑后绕过委托链。
 */

const { IntimacySystem } = require('../../modules/intimacy');
const { BOBBY_DEFAULTS } = require('../../config/bobbyDefaults');
const { intimacyLevels } = BOBBY_DEFAULTS;

describe('User 好感度系统 (委托 IntimacySystem)', () => {
  // ═══════════════════════════════════════════
  // 好感度等级计算 — 直接测试 User.js 调用的 IntimacySystem.getLevel()
  // ═══════════════════════════════════════════
  describe('getLevel (User.getIntimacyLevel 的委托目标)', () => {
    it('好感度 0 → 陌生', () => {
      expect(IntimacySystem.getLevel(0).name).toBe('陌生');
    });

    it('好感度 9 → 陌生', () => {
      expect(IntimacySystem.getLevel(9).name).toBe('陌生');
    });

    it('好感度 10 → 认识', () => {
      expect(IntimacySystem.getLevel(10).name).toBe('认识');
    });

    it('好感度 24 → 认识', () => {
      expect(IntimacySystem.getLevel(24).name).toBe('认识');
    });

    it('好感度 25 → 熟悉', () => {
      expect(IntimacySystem.getLevel(25).name).toBe('熟悉');
    });

    it('好感度 44 → 熟悉', () => {
      expect(IntimacySystem.getLevel(44).name).toBe('熟悉');
    });

    it('好感度 45 → 默契', () => {
      expect(IntimacySystem.getLevel(45).name).toBe('默契');
    });

    it('好感度 69 → 默契', () => {
      expect(IntimacySystem.getLevel(69).name).toBe('默契');
    });

    it('好感度 70 → 信赖', () => {
      expect(IntimacySystem.getLevel(70).name).toBe('信赖');
    });

    it('好感度 100 → 信赖', () => {
      expect(IntimacySystem.getLevel(100).name).toBe('信赖');
    });

    it('返回正确的描述', () => {
      const level = IntimacySystem.getLevel(0);
      expect(level.desc).toBe('你们还不太熟');
    });

    it('返回正确的好感度值', () => {
      const level = IntimacySystem.getLevel(35);
      expect(level.value).toBe(35);
    });

    it('超出范围（>100）仍正确返回信赖', () => {
      expect(IntimacySystem.getLevel(150).name).toBe('信赖');
    });

    it('负数仍正确返回陌生', () => {
      expect(IntimacySystem.getLevel(-5).name).toBe('陌生');
    });
  });

  // ═══════════════════════════════════════════
  // 好感度增减 — 直接测试 User.addIntimacy 调用的 IntimacySystem.addPoints()
  // ═══════════════════════════════════════════
  describe('addPoints (User.addIntimacy 的委托目标)', () => {
    it('正常增加好感度', () => {
      const result = IntimacySystem.addPoints(0, 5);
      expect(result.newValue).toBe(5);
      expect(result.upgraded).toBe(false);
    });

    it('好感度不能超过 100', () => {
      const result = IntimacySystem.addPoints(95, 10);
      expect(result.newValue).toBe(100);
    });

    it('好感度不能低于 0', () => {
      const result = IntimacySystem.addPoints(5, -10);
      expect(result.newValue).toBe(0);
    });

    it('跨等级时 upgraded 为 true', () => {
      const result = IntimacySystem.addPoints(9, 1); // 陌生 → 认识
      expect(result.upgraded).toBe(true);
      expect(result.oldLevel).toBe('陌生');
      expect(result.newLevel).toBe('认识');
      expect(result.newValue).toBe(10);
    });

    it('同等级内 upgraded 为 false', () => {
      const result = IntimacySystem.addPoints(5, 1);
      expect(result.upgraded).toBe(false);
      expect(result.newValue).toBe(6);
    });

    it('连续跨多级', () => {
      const r1 = IntimacySystem.addPoints(9, 1);   // 陌生 → 认识
      expect(r1.upgraded).toBe(true);
      expect(r1.newLevel).toBe('认识');

      const r2 = IntimacySystem.addPoints(r1.newValue, 15); // 认识 → 熟悉
      expect(r2.upgraded).toBe(true);
      expect(r2.newLevel).toBe('熟悉');
      expect(r2.newValue).toBe(25);
    });

    it('减分后降级', () => {
      const result = IntimacySystem.addPoints(10, -1); // 认识 → 陌生
      expect(result.upgraded).toBe(true);
      expect(result.oldLevel).toBe('认识');
      expect(result.newLevel).toBe('陌生');
      expect(result.newValue).toBe(9);
    });
  });

  // ═══════════════════════════════════════════
  // 风格指南 — getStyleGuide（供 AI prompt 使用）
  // ═══════════════════════════════════════════
  describe('getStyleGuide', () => {
    it('陌生返回礼貌但有距离感的指南', () => {
      const guide = IntimacySystem.getStyleGuide('陌生');
      expect(guide).toContain('礼貌但有距离感');
    });

    it('信赖返回走心真诚的指南', () => {
      const guide = IntimacySystem.getStyleGuide('信赖');
      expect(guide).toContain('走心');
    });

    it('不存在的等级回退到陌生', () => {
      const guide = IntimacySystem.getStyleGuide('不存在');
      expect(guide).toContain('礼貌但有距离感');
    });
  });

  // ═══════════════════════════════════════════
  // 好感度等级配置
  // ═══════════════════════════════════════════
  describe('好感度等级配置', () => {
    it('有 5 个等级', () => {
      expect(intimacyLevels.length).toBe(5);
    });

    it('等级按阈值升序排列', () => {
      for (let i = 1; i < intimacyLevels.length; i++) {
        expect(intimacyLevels[i].threshold).toBeGreaterThan(intimacyLevels[i - 1].threshold);
      }
    });

    it('第一个等级阈值为 0', () => {
      expect(intimacyLevels[0].threshold).toBe(0);
    });

    it('每个等级都有名称和描述', () => {
      for (const level of intimacyLevels) {
        expect(level.name).toBeTruthy();
        expect(level.desc).toBeTruthy();
      }
    });
  });
});
