/**
 * Bobby EmotionEngine 测试
 *
 * 测试 30 维情绪系统的核心功能：
 *   - 初始化
 *   - 情绪衰减
 *   - 用户情绪感染
 *   - 昼夜节律
 *   - 共激活扩散
 *   - 情绪效价计算
 *   - 情绪描述生成
 *   - 序列化/反序列化
 */

const { EmotionEngine } = require('../../services/emotionEngine');

describe('Bobby EmotionEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new EmotionEngine();
  });

  // ═══════════════════════════════════════════
  // 初始化
  // ═══════════════════════════════════════════
  describe('初始化', () => {
    it('应有 30 个情绪维度', () => {
      const dims = Object.keys(engine.current);
      expect(dims.length).toBe(30);
    });

    it('基线人格：平静最高', () => {
      expect(engine.baseline.calm).toBe(0.3);
      expect(engine.baseline.loneliness).toBe(0.15);
      expect(engine.baseline.boredom).toBe(0.1);
    });

    it('初始压力为 2', () => {
      expect(engine.stress).toBe(2);
    });

    it('初始心率为 70', () => {
      expect(engine.heartRate).toBe(70);
    });

    it('当前值初始化为基线值', () => {
      expect(engine.current.calm).toBe(engine.baseline.calm);
      expect(engine.current.loneliness).toBe(engine.baseline.loneliness);
    });
  });

  // ═══════════════════════════════════════════
  // 情绪衰减
  // ═══════════════════════════════════════════
  describe('情绪衰减 (_decay)', () => {
    it('高情绪应向基线衰减', () => {
      engine.current.joy = 0.8;
      engine._decay(1); // 1小时
      expect(engine.current.joy).toBeLessThan(0.8);
      expect(engine.current.joy).toBeGreaterThan(engine.baseline.joy);
    });

    it('低情绪应向基线回升', () => {
      engine.current.sadness = -0.5;
      engine._decay(1);
      expect(engine.current.sadness).toBeGreaterThan(-0.5);
    });

    it('衰减速度与时间正相关', () => {
      engine.current.joy = 0.8;
      const before = engine.current.joy;
      engine._decay(0.5);
      const afterShort = engine.current.joy;

      engine.current.joy = 0.8;
      engine._decay(2);
      const afterLong = engine.current.joy;

      // 更长时间应衰减更多
      expect(before - afterLong).toBeGreaterThan(before - afterShort);
    });
  });

  // ═══════════════════════════════════════════
  // 用户情绪感染
  // ═══════════════════════════════════════════
  describe('用户情绪感染 (_emotionalContagion)', () => {
    it('用户说"难过"时 Bobby 同情心增加', () => {
      const before = engine.current.sympathy;
      engine._emotionalContagion('我今天好难过');
      expect(engine.current.sympathy).toBeGreaterThan(before);
    });

    it('用户说"开心"时 Bobby 快乐增加', () => {
      const before = engine.current.joy;
      engine._emotionalContagion('哈哈太开心了');
      expect(engine.current.joy).toBeGreaterThan(before);
    });

    it('用户说"累"时 Bobby 无聊感增加', () => {
      const before = engine.current.boredom;
      engine._emotionalContagion('今天好累');
      expect(engine.current.boredom).toBeGreaterThan(before);
    });

    it('用户说"生气"时 Bobby 紧张感增加', () => {
      const before = engine.current.nervousness;
      engine._emotionalContagion('气死我了');
      expect(engine.current.nervousness).toBeGreaterThan(before);
    });

    it('用户说"喜欢"时 Bobby 爱意增加', () => {
      const before = engine.current.love;
      engine._emotionalContagion('我喜欢你');
      expect(engine.current.love).toBeGreaterThan(before);
    });

    it('无情绪关键词时不改变情绪', () => {
      const before = { ...engine.current };
      engine._emotionalContagion('今天天气不错');
      // 只检查几个关键维度
      expect(engine.current.joy).toBe(before.joy);
      expect(engine.current.sadness).toBe(before.sadness);
    });
  });

  // ═══════════════════════════════════════════
  // 昼夜节律
  // ═══════════════════════════════════════════
  describe('昼夜节律 (_circadianRhythm)', () => {
    beforeEach(() => {
      // Mock 时间为凌晨2点
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-05-30 02:00:00'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('深夜时孤独感增加', () => {
      const before = engine.current.loneliness;
      engine._circadianRhythm();
      expect(engine.current.loneliness).toBeGreaterThan(before);
    });

    it('深夜时心率降低', () => {
      const before = engine.heartRate;
      engine._circadianRhythm();
      expect(engine.heartRate).toBeLessThan(before);
    });
  });

  // ═══════════════════════════════════════════
  // 共激活扩散
  // ═══════════════════════════════════════════
  describe('共激活扩散 (_coActivation)', () => {
    it('快乐应激活满足感', () => {
      engine.current.joy = 0.5;
      engine.current.contentment = 0;
      engine._coActivation();
      expect(engine.current.contentment).toBeGreaterThan(0);
    });

    it('悲伤应激活孤独感', () => {
      engine.current.sadness = 0.5;
      engine.current.loneliness = 0;
      engine._coActivation();
      expect(engine.current.loneliness).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════
  // 情绪效价计算
  // ═══════════════════════════════════════════
  describe('情绪效价 (getValence)', () => {
    it('正面情绪多时返回正值', () => {
      engine.current.joy = 0.5;
      engine.current.contentment = 0.3;
      engine.current.sadness = 0.1;
      expect(engine.getValence()).toBeGreaterThan(0);
    });

    it('负面情绪多时返回负值', () => {
      engine.current.sadness = 0.5;
      engine.current.loneliness = 0.3;
      engine.current.joy = 0.1;
      expect(engine.getValence()).toBeLessThan(0);
    });

    it('效价在 [-1, 1] 范围内', () => {
      engine.current.joy = 1;
      engine.current.sadness = 1;
      const valence = engine.getValence();
      expect(valence).toBeGreaterThanOrEqual(-1);
      expect(valence).toBeLessThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════════════
  // 唤醒度计算
  // ═══════════════════════════════════════════
  describe('唤醒度 (getArousal)', () => {
    it('高唤醒情绪多时返回高值', () => {
      engine.current.excitement = 0.5;
      engine.current.anger = 0.3;
      expect(engine.getArousal()).toBeGreaterThan(0.5);
    });

    it('低唤醒情绪多时返回低值', () => {
      engine.current.calm = 0.5;
      engine.current.boredom = 0.3;
      expect(engine.getArousal()).toBeLessThan(0.5);
    });

    it('唤醒度在 [0, 1] 范围内', () => {
      const arousal = engine.getArousal();
      expect(arousal).toBeGreaterThanOrEqual(0);
      expect(arousal).toBeLessThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════════════
  // 主导情绪
  // ═══════════════════════════════════════════
  describe('主导情绪 (getDominantEmotions)', () => {
    it('返回指定数量的主导情绪', () => {
      engine.current.joy = 0.5;
      engine.current.sadness = 0.3;
      engine.current.calm = 0.2;
      const dominant = engine.getDominantEmotions(3);
      expect(dominant.length).toBe(3);
    });

    it('按情绪值降序排列', () => {
      engine.current.joy = 0.5;
      engine.current.sadness = 0.3;
      engine.current.calm = 0.2;
      const dominant = engine.getDominantEmotions(3);
      expect(dominant[0].value).toBeGreaterThanOrEqual(dominant[1].value);
    });

    it('过滤掉低于 0.05 的情绪', () => {
      engine.current.joy = 0.5;
      engine.current.sadness = 0.04; // 低于阈值
      const dominant = engine.getDominantEmotions(3);
      const sadnessEntry = dominant.find(e => e.dim === 'sadness');
      expect(sadnessEntry).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════
  // 情绪描述生成
  // ═══════════════════════════════════════════
  describe('情绪描述 (toPromptString)', () => {
    it('返回非空字符串', () => {
      engine.current.joy = 0.5;
      const desc = engine.toPromptString();
      expect(desc).toBeTruthy();
      expect(typeof desc).toBe('string');
    });

    it('包含7级强度描述词', () => {
      engine.current.joy = 0.6;
      engine.current.loneliness = 0.4;
      const desc = engine.toPromptString();
      // 应该包含"挺"或"比较"
      expect(desc).toMatch(/挺|比较|很|非常|极度|有点|略微/);
    });

    it('包含情绪名称', () => {
      engine.current.joy = 0.5;
      const desc = engine.toPromptString();
      expect(desc).toContain('开心');
    });

    it('矛盾情绪时生成对比描述', () => {
      engine.current.joy = 0.4;
      engine.current.sadness = 0.4;
      const desc = engine.toPromptString();
      // 应该包含两种情绪
      expect(desc).toContain('开心');
      expect(desc).toContain('难过');
    });

    it('偏负面情绪时生成负面描述', () => {
      engine.current.sadness = 0.5;
      engine.current.loneliness = 0.4;
      engine.current.joy = 0.1;
      const desc = engine.toPromptString();
      expect(desc).toContain('难过');
      expect(desc).toContain('孤独');
    });
  });

  // ═══════════════════════════════════════════
  // Andy 数据注入
  // ═══════════════════════════════════════════
  describe('Andy 数据注入', () => {
    it('注入 Andy 数据后使用 Andy 风格描述', () => {
      engine._andyDominant = [
        { dim: 'loneliness', value: 0.6 },
        { dim: 'sadness', value: 0.4 },
      ];
      engine._andyValence = -0.2;
      engine._andyArousal = 0.4;
      engine._andyStress = 5;

      const desc = engine.toPromptString();
      expect(desc).toContain('孤独');
    });

    it('无 Andy 数据时使用 Bobby 自己的数据', () => {
      engine.current.joy = 0.5;
      engine._andyDominant = null;

      const desc = engine.toPromptString();
      expect(desc).toContain('开心');
    });
  });

  // ═══════════════════════════════════════════
  // 礼物效果
  // ═══════════════════════════════════════════
  describe('礼物效果 (applyGiftEffect)', () => {
    it('好礼物增加快乐和满足', () => {
      const joyBefore = engine.current.joy;
      const contentmentBefore = engine.current.contentment;
      engine.applyGiftEffect('good');
      expect(engine.current.joy).toBeGreaterThan(joyBefore);
      expect(engine.current.contentment).toBeGreaterThan(contentmentBefore);
    });

    it('好礼物降低压力', () => {
      const stressBefore = engine.stress;
      engine.applyGiftEffect('good');
      expect(engine.stress).toBeLessThan(stressBefore);
    });

    it('坏礼物增加烦躁', () => {
      const frustrationBefore = engine.current.frustration;
      engine.applyGiftEffect('bad');
      expect(engine.current.frustration).toBeGreaterThan(frustrationBefore);
    });

    it('坏礼物增加压力', () => {
      const stressBefore = engine.stress;
      engine.applyGiftEffect('bad');
      expect(engine.stress).toBeGreaterThan(stressBefore);
    });
  });

  // ═══════════════════════════════════════════
  // 序列化/反序列化
  // ═══════════════════════════════════════════
  describe('序列化/反序列化', () => {
    it('toJSON → fromJSON 往返不丢失数据', () => {
      engine.current.joy = 0.5;
      engine.stress = 5;
      engine.heartRate = 80;

      const json = engine.toJSON();
      const restored = EmotionEngine.fromJSON(json);

      expect(restored.current.joy).toBe(0.5);
      expect(restored.stress).toBe(5);
      expect(restored.heartRate).toBe(80);
    });

    it('fromJSON 恢复基线值', () => {
      const json = engine.toJSON();
      const restored = EmotionEngine.fromJSON(json);

      expect(restored.baseline.calm).toBe(engine.baseline.calm);
      expect(restored.baseline.loneliness).toBe(engine.baseline.loneliness);
    });
  });

  // ═══════════════════════════════════════════
  // 完整 tick 流程
  // ═══════════════════════════════════════════
  describe('完整 tick 流程', () => {
    it('tick 后情绪在有效范围内', () => {
      engine.current.joy = 0.8;
      engine.current.sadness = -0.5;
      engine.tick('我今天好难过', 1);

      // 所有维度应在 [-1, 1]
      for (const dim of Object.keys(engine.current)) {
        expect(engine.current[dim]).toBeGreaterThanOrEqual(-1);
        expect(engine.current[dim]).toBeLessThanOrEqual(1);
      }
    });

    it('tick 后压力在有效范围内', () => {
      engine.stress = 8;
      engine.tick('', 1);
      expect(engine.stress).toBeGreaterThanOrEqual(0);
      expect(engine.stress).toBeLessThanOrEqual(10);
    });

    it('tick 后心率在有效范围内', () => {
      engine.heartRate = 120;
      engine.tick('', 1);
      expect(engine.heartRate).toBeGreaterThanOrEqual(50);
      expect(engine.heartRate).toBeLessThanOrEqual(130);
    });
  });
});
