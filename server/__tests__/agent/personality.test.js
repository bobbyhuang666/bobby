/**
 * Personality 模块测试
 *
 * 测试 Big Five (OCEAN) + MBTI 人格系统：
 *   - MBTI → OCEAN 映射
 *   - 直接 OCEAN 赋值
 *   - OCEAN → 行为参数转换
 *   - 序列化/反序列化
 *   - MBTI + OCEAN 覆盖合并
 */

const Personality = require('../../andy/agent/Personality');

describe('Personality', () => {
  // ───────── 创建 ─────────
  describe('构造与映射', () => {
    it('INFP → 高开放性、低外向性', () => {
      const p = new Personality({ mbti: 'INFP' });
      expect(p.ocean.openness).toBeGreaterThan(0.7);
      expect(p.ocean.extraversion).toBeLessThan(0.3);
      // INFP 情绪惯性应中高（Fi 内倾情感）
      expect(p.behavior.emotionalInertia).toBeGreaterThan(0.4);
    });

    it('使用直接 OCEAN 值创建', () => {
      const p = new Personality({ ocean: { openness: 0.9, extraversion: 0.8 } });
      expect(p.ocean.openness).toBe(0.9);
      expect(p.ocean.extraversion).toBe(0.8);
    });

    it('默认 MBTI 为 INFP', () => {
      const p = new Personality();
      expect(p.mbti).toBe('INFP');
    });
  });

  // ───────── 序列化 ─────────
  describe('序列化/反序列化', () => {
    it('toJSON → fromJSON 往返不丢失数据', () => {
      const original = new Personality({ mbti: 'INFP' });
      const restored = Personality.fromJSON(original.toJSON());

      expect(restored.ocean.openness).toBe(original.ocean.openness);
      expect(restored.ocean.conscientiousness).toBe(original.ocean.conscientiousness);
      expect(restored.mbti).toBe('INFP');
    });
  });

  // ───────── 行为参数 ─────────
  describe('OCEAN → 行为参数映射', () => {
    it('所有行为参数在 [0, 1] 范围内', () => {
      const p = new Personality({ mbti: 'INFP' });
      const b = p.behavior;

      expect(b.emotionalInertia).toBeGreaterThanOrEqual(0);
      expect(b.emotionalInertia).toBeLessThanOrEqual(1);
      expect(b.susceptibility).toBeGreaterThanOrEqual(0);
      expect(b.susceptibility).toBeLessThanOrEqual(1);
      expect(b.expressiveness).toBeGreaterThanOrEqual(0);
      expect(b.expressiveness).toBeLessThanOrEqual(1);
      expect(b.socialInitiative).toBeGreaterThanOrEqual(0);
      expect(b.socialInitiative).toBeLessThanOrEqual(1);
    });
  });

  // ───────── MBTI + OCEAN 覆盖 ─────────
  describe('MBTI + OCEAN 合并', () => {
    it('显式 OCEAN 覆盖 MBTI 默认值', () => {
      const p = new Personality({ mbti: 'INFJ', ocean: { neuroticism: 0.85 } });
      expect(p.ocean.neuroticism).toBe(0.85);
      // 未覆盖的维度保持 MBTI 默认
      expect(p.ocean.openness).toBe(0.80); // INFJ openness
      expect(p.mbti).toBe('INFJ');
    });

    it('高神经质覆盖产生更高的情绪惯性', () => {
      const highNeuro = new Personality({ mbti: 'INFJ', ocean: { neuroticism: 0.85 } });
      const normalInfj = new Personality({ mbti: 'INFJ' }); // neuroticism=0.50

      expect(highNeuro.behavior.emotionalInertia)
        .toBeGreaterThan(normalInfj.behavior.emotionalInertia);
    });
  });

  // ───────── 批量 MBTI 验证 ─────────
  describe('MBTI 类型完整性', () => {
    const types = ['INFP', 'INFJ', 'INTJ', 'INTP', 'ENFP', 'ENTP', 'ISTJ'];

    test.each(types)('%s 产生合法的 OCEAN 和行为参数', (mbti) => {
      const p = new Personality({ mbti });
      // OCEAN 各维度在 [0,1]
      for (const dim of ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism']) {
        expect(p.ocean[dim]).toBeGreaterThanOrEqual(0);
        expect(p.ocean[dim]).toBeLessThanOrEqual(1);
      }
      // 所有行为参数有效
      for (const [key, val] of Object.entries(p.behavior)) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    });
  });
});
