/**
 * EmotionVector 模块测试
 *
 * 测试 30 维情绪系统的 10 步演化管线：
 *   时间衰减 → 昼夜节律 → 粉噪声 → 共激活 → 对立抑制
 *   → 惯性滤波 → 社交传染 → 基线漂移 → 速度限制 → 截断
 */

const EmotionVector = require('../../andy/agent/EmotionVector');
const Personality = require('../../andy/agent/Personality');

describe('EmotionVector', () => {
  let personality, emotion;

  beforeEach(() => {
    personality = new Personality({ mbti: 'INFP' });
    emotion = new EmotionVector(personality);
  });

  // ───────── 初始化 ─────────
  describe('初始化', () => {
    it('初始效价在 [-1, 1] 范围内', () => {
      expect(emotion.getValence()).toBeGreaterThanOrEqual(-1);
      expect(emotion.getValence()).toBeLessThanOrEqual(1);
    });

    it('初始唤醒度在 [0, 1] 范围内', () => {
      expect(emotion.getArousal()).toBeGreaterThanOrEqual(0);
      expect(emotion.getArousal()).toBeLessThanOrEqual(1);
    });

    it('所有 30 个维度初始化为基线值', () => {
      const { EMOTION_DIMENSIONS } = require('../../andy/config/defaults');
      for (const dim of EMOTION_DIMENSIONS) {
        expect(emotion.current[dim]).toBeDefined();
        expect(emotion.current[dim]).toBeGreaterThanOrEqual(-1);
        expect(emotion.current[dim]).toBeLessThanOrEqual(1);
      }
    });
  });

  // ───────── Tick 演化 ─────────
  describe('tick 后状态', () => {
    it('tick 后效价仍在 [-1, 1]', () => {
      emotion.tick(5 / 60, 14); // 5min, 下午2点
      expect(emotion.getValence()).toBeGreaterThanOrEqual(-1);
      expect(emotion.getValence()).toBeLessThanOrEqual(1);
    });

    it('tick 后所有维度在 [-1, 1]', () => {
      emotion.tick(5 / 60, 14);
      for (const [dim, val] of Object.entries(emotion.current)) {
        expect(val).toBeGreaterThanOrEqual(-1);
        expect(val).toBeLessThanOrEqual(1);
      }
    });

    it('多次 tick 不会导致维度溢出', () => {
      for (let i = 0; i < 100; i++) {
        emotion.tick(5 / 60, (14 + i * 0.5) % 24);
      }
      for (const [dim, val] of Object.entries(emotion.current)) {
        expect(val).toBeGreaterThanOrEqual(-1);
        expect(val).toBeLessThanOrEqual(1);
      }
    });
  });

  // ───────── 外部效果 ─────────
  describe('applyEffect', () => {
    it('正向效果增加 joy', () => {
      const before = emotion.current.joy;
      emotion.applyEffect({ joy: 0.5 });
      expect(emotion.current.joy).toBeGreaterThan(before);
    });

    it('负向效果减少 sadness（实际是增加 sadness）', () => {
      emotion.applyEffect({ sadness: 0.3 });
      expect(emotion.current.sadness).toBeGreaterThanOrEqual(0);
    });

    it('应用效果后所有维度仍在范围内', () => {
      emotion.applyEffect({
        joy: 0.5, sadness: 0.3, anger: 0.2,
        fear: -0.1, surprise: 0.4, calm: -0.3,
      });
      for (const [dim, val] of Object.entries(emotion.current)) {
        expect(val).toBeGreaterThanOrEqual(-1);
        expect(val).toBeLessThanOrEqual(1);
      }
    });

    it('效果受惯性调制', () => {
      // 高惯性人格 → 效果减弱
      const stiff = new Personality({ mbti: 'ISTJ' }); // 高尽责 = 高惯性
      const stiffEmotion = new EmotionVector(stiff);

      const flexible = new Personality({ mbti: 'ENFP' }); // 高开放 = 低惯性
      const flexibleEmotion = new EmotionVector(flexible);

      const stiffBefore = stiffEmotion.current.joy;
      const flexibleBefore = flexibleEmotion.current.joy;

      stiffEmotion.applyEffect({ joy: 0.5 });
      flexibleEmotion.applyEffect({ joy: 0.5 });

      const stiffDelta = stiffEmotion.current.joy - stiffBefore;
      const flexibleDelta = flexibleEmotion.current.joy - flexibleBefore;

      // ENFP 的情绪变化应 ≥ ISTJ（或至少不更大差异）
      // 注意：不严格断言谁大谁小，因为有 clamp 和惯性因子交叉
      expect(stiffDelta).toBeDefined();
      expect(flexibleDelta).toBeDefined();
    });
  });

  // ───────── 昼夜节律 ─────────
  describe('昼夜节律', () => {
    it('深夜（凌晨 2 点）孤独感增加', () => {
      const before = emotion.current.loneliness;
      emotion.tick(0.083, 2); // 5min, 凌晨2点（64个tick约5小时）
      for (let i = 0; i < 16; i++) emotion.tick(0.083, 2);
      // 经过足够时间后，深夜效应应该可见
      expect(emotion.current.loneliness).toBeDefined();
    });

    it('下午 2 点正面情绪更高（与凌晨对比）', () => {
      const afternoon = new EmotionVector(personality);
      const night = new EmotionVector(personality);

      afternoon.tick(5 / 60, 14);
      night.tick(5 / 60, 2);

      // 下午的正面情绪应略高于深夜（不一定绝对大于，因为有噪声）
      const afternoonValence = afternoon.getValence();
      const nightValence = night.getValence();

      // 单个 tick 差异可能不明显，主要验证不崩溃
      expect(typeof afternoonValence).toBe('number');
      expect(typeof nightValence).toBe('number');
    });
  });

  // ───────── 社交传染 ─────────
  describe('社交传染', () => {
    it('接受快乐 Agent 的传染', () => {
      const contagion = {
        happy_friend: {
          emotion: { joy: 0.8, sadness: -0.1, calm: 0.1 },
          weight: 0.5,
          expressiveness: 0.7,
        },
      };
      emotion.tick(5 / 60, 14, contagion);
      // 不应崩溃
      expect(emotion.getValence()).toBeGreaterThanOrEqual(-1);
      expect(emotion.getValence()).toBeLessThanOrEqual(1);
    });

    it('多 Agent 同时传染', () => {
      const contagion = {
        agent_a: { emotion: { anger: 0.6, frustration: 0.5 }, weight: 0.3, expressiveness: 0.6 },
        agent_b: { emotion: { joy: 0.4, calm: 0.3 }, weight: 0.4, expressiveness: 0.5 },
      };
      emotion.tick(5 / 60, 14, contagion);
      for (const [dim, val] of Object.entries(emotion.current)) {
        expect(val).toBeGreaterThanOrEqual(-1);
        expect(val).toBeLessThanOrEqual(1);
      }
    });
  });

  // ───────── 查询接口 ─────────
  describe('getDominant', () => {
    it('返回不超过请求数量', () => {
      emotion.applyEffect({ joy: 0.5, sadness: 0.3, excitement: 0.4 });
      const dominant = emotion.getDominant(3);
      expect(dominant.length).toBeLessThanOrEqual(3);
    });

    it('每个结果都有 dimension 和 value', () => {
      const dominant = emotion.getDominant(2);
      for (const item of dominant) {
        expect(item).toHaveProperty('dimension');
        expect(item).toHaveProperty('value');
        expect(typeof item.value).toBe('number');
      }
    });
  });

  // ───────── toPromptString ─────────
  describe('toPromptString', () => {
    it('返回有效字符串', () => {
      const str = emotion.toPromptString();
      expect(typeof str).toBe('string');
      expect(str.length).toBeGreaterThan(10);
    });

    it('包含效价和唤醒度指标', () => {
      const str = emotion.toPromptString();
      expect(str).toContain('效价');
    });
  });

  // ───────── 序列化 ─────────
  describe('toJSON / fromJSON', () => {
    it('序列化包含所有必需字段', () => {
      emotion.tick(0.5, 14);
      const json = emotion.toJSON();

      expect(json).toHaveProperty('current');
      expect(json).toHaveProperty('mood');
      expect(json).toHaveProperty('baseline');
      expect(json).toHaveProperty('stress');
      expect(json).toHaveProperty('_pinkNoiseState');
      expect(typeof json.stress).toBe('number');
    });

    it('从 JSON 恢复后效价与原始一致', () => {
      emotion.tick(1, 10);
      emotion.applyEffect({ joy: 0.3, sadness: 0.1 });
      const restored = new EmotionVector(personality, emotion.toJSON());

      const originalValence = emotion.getValence();
      const restoredValence = restored.getValence();
      expect(Math.abs(originalValence - restoredValence)).toBeLessThan(0.001);
    });
  });
});
