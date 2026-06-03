/**
 * Bobby 共享配置测试
 *
 * 测试 bobbyDefaults.js 配置完整性：
 *   - 所有必要字段存在
 *   - 数据类型正确
 *   - 值范围合理
 *   - 等级配置一致性
 */

const { BOBBY_DEFAULTS } = require('../../config/bobbyDefaults');

describe('Bobby 共享配置', () => {

  // ═══════════════════════════════════════════
  // 配置完整性
  // ═══════════════════════════════════════════
  describe('配置完整性', () => {
    it('存在 BOBBY_DEFAULTS', () => {
      expect(BOBBY_DEFAULTS).toBeDefined();
      expect(typeof BOBBY_DEFAULTS).toBe('object');
    });

    it('包含所有必要模块', () => {
      expect(BOBBY_DEFAULTS.moodKeywords).toBeDefined();
      expect(BOBBY_DEFAULTS.intimacyLevels).toBeDefined();
      expect(BOBBY_DEFAULTS.intimacyPoints).toBeDefined();
      expect(BOBBY_DEFAULTS.stateDuration).toBeDefined();
      expect(BOBBY_DEFAULTS.emotion).toBeDefined();
      expect(BOBBY_DEFAULTS.chat).toBeDefined();
      expect(BOBBY_DEFAULTS.frontend).toBeDefined();
      expect(BOBBY_DEFAULTS.weather).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════
  // 情绪关键词
  // ═══════════════════════════════════════════
  describe('moodKeywords', () => {
    it('包含所有必要情绪类型', () => {
      const required = ['tired', 'sad', 'happy', 'insomnia', 'angry', 'anxious', 'loving', 'confused', 'hopeful', 'grateful'];
      for (const mood of required) {
        expect(BOBBY_DEFAULTS.moodKeywords[mood]).toBeDefined();
      }
    });

    it('每个情绪关键词都是正则表达式', () => {
      for (const [mood, regex] of Object.entries(BOBBY_DEFAULTS.moodKeywords)) {
        expect(regex).toBeInstanceOf(RegExp);
      }
    });

    it('情绪关键词能正确匹配', () => {
      expect(BOBBY_DEFAULTS.moodKeywords.tired.test('好累')).toBe(true);
      expect(BOBBY_DEFAULTS.moodKeywords.sad.test('难过')).toBe(true);
      expect(BOBBY_DEFAULTS.moodKeywords.happy.test('开心')).toBe(true);
      expect(BOBBY_DEFAULTS.moodKeywords.insomnia.test('睡不着')).toBe(true);
      expect(BOBBY_DEFAULTS.moodKeywords.angry.test('生气')).toBe(true);
      expect(BOBBY_DEFAULTS.moodKeywords.loving.test('喜欢')).toBe(true);
      expect(BOBBY_DEFAULTS.moodKeywords.grateful.test('谢谢')).toBe(true);
    });

    it('情绪关键词不误匹配', () => {
      expect(BOBBY_DEFAULTS.moodKeywords.tired.test('今天天气不错')).toBe(false);
      expect(BOBBY_DEFAULTS.moodKeywords.sad.test('普通对话')).toBe(false);
      expect(BOBBY_DEFAULTS.moodKeywords.angry.test('你好')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════
  // 好感度等级
  // ═══════════════════════════════════════════
  describe('intimacyLevels', () => {
    it('有 5 个等级', () => {
      expect(BOBBY_DEFAULTS.intimacyLevels.length).toBe(5);
    });

    it('等级按阈值升序排列', () => {
      const levels = BOBBY_DEFAULTS.intimacyLevels;
      for (let i = 1; i < levels.length; i++) {
        expect(levels[i].threshold).toBeGreaterThan(levels[i - 1].threshold);
      }
    });

    it('第一个等级阈值为 0', () => {
      expect(BOBBY_DEFAULTS.intimacyLevels[0].threshold).toBe(0);
    });

    it('每个等级有 name、desc、threshold', () => {
      for (const level of BOBBY_DEFAULTS.intimacyLevels) {
        expect(level.name).toBeTruthy();
        expect(level.desc).toBeTruthy();
        expect(typeof level.threshold).toBe('number');
      }
    });

    it('等级名称正确', () => {
      const names = BOBBY_DEFAULTS.intimacyLevels.map(l => l.name);
      expect(names).toEqual(['陌生', '认识', '熟悉', '默契', '信赖']);
    });
  });

  // ═══════════════════════════════════════════
  // 好感度点数
  // ═══════════════════════════════════════════
  describe('intimacyPoints', () => {
    it('包含所有交互类型', () => {
      expect(BOBBY_DEFAULTS.intimacyPoints.chatMessage).toBeDefined();
      expect(BOBBY_DEFAULTS.intimacyPoints.comment).toBeDefined();
      expect(BOBBY_DEFAULTS.intimacyPoints.giftGood).toBeDefined();
      expect(BOBBY_DEFAULTS.intimacyPoints.likeNote).toBeDefined();
    });

    it('所有点数为正整数', () => {
      for (const [key, value] of Object.entries(BOBBY_DEFAULTS.intimacyPoints)) {
        expect(value).toBeGreaterThan(0);
        expect(Number.isInteger(value)).toBe(true);
      }
    });

    it('好礼物 > 随机礼物 > 差礼物', () => {
      const { giftGood, giftRandom, giftBad } = BOBBY_DEFAULTS.intimacyPoints;
      expect(giftGood).toBeGreaterThan(giftRandom);
      expect(giftRandom).toBeGreaterThanOrEqual(giftBad);
    });
  });

  // ═══════════════════════════════════════════
  // 状态机节奏
  // ═══════════════════════════════════════════
  describe('stateDuration', () => {
    it('包含所有时段配置', () => {
      expect(BOBBY_DEFAULTS.stateDuration.active).toBeDefined();
      expect(BOBBY_DEFAULTS.stateDuration.quiet).toBeDefined();
      expect(BOBBY_DEFAULTS.stateDuration.lateNight).toBeDefined();
      expect(BOBBY_DEFAULTS.stateDuration.default).toBeDefined();
    });

    it('每个时段有 min 和 extra', () => {
      for (const [key, val] of Object.entries(BOBBY_DEFAULTS.stateDuration)) {
        expect(typeof val.min).toBe('number');
        expect(typeof val.extra).toBe('number');
        expect(val.min).toBeGreaterThan(0);
        expect(val.extra).toBeGreaterThan(0);
      }
    });

    it('活跃状态切换最快', () => {
      const { active, quiet, lateNight, default: def } = BOBBY_DEFAULTS.stateDuration;
      expect(active.min).toBeLessThan(quiet.min);
      expect(active.min).toBeLessThan(def.min);
    });

    it('安静状态切换最慢', () => {
      const { active, quiet, default: def } = BOBBY_DEFAULTS.stateDuration;
      expect(quiet.min).toBeGreaterThanOrEqual(def.min);
      expect(quiet.min).toBeGreaterThan(active.min);
    });
  });

  // ═══════════════════════════════════════════
  // 情绪引擎参数
  // ═══════════════════════════════════════════
  describe('emotion 配置', () => {
    it('心率范围合理', () => {
      const { heartRateMin, heartRateMax, defaultHeartRate } = BOBBY_DEFAULTS.emotion;
      expect(heartRateMin).toBeLessThan(defaultHeartRate);
      expect(defaultHeartRate).toBeLessThan(heartRateMax);
      expect(heartRateMin).toBeGreaterThan(0);
    });

    it('衰减参数合理', () => {
      expect(BOBBY_DEFAULTS.emotion.decayLambda).toBeGreaterThan(0);
      expect(BOBBY_DEFAULTS.emotion.decayLambda).toBeLessThan(1);
    });

    it('噪声幅度合理', () => {
      expect(BOBBY_DEFAULTS.emotion.pinkNoiseAmplitude).toBeGreaterThan(0);
      expect(BOBBY_DEFAULTS.emotion.pinkNoiseAmplitude).toBeLessThan(0.1);
    });
  });

  // ═══════════════════════════════════════════
  // 对话参数
  // ═══════════════════════════════════════════
  describe('chat 配置', () => {
    it('回复概率在合理范围', () => {
      expect(BOBBY_DEFAULTS.chat.replyChanceBase).toBeGreaterThan(0);
      expect(BOBBY_DEFAULTS.chat.replyChanceBase).toBeLessThanOrEqual(1);
      expect(BOBBY_DEFAULTS.chat.replyChanceMax).toBeLessThanOrEqual(1);
    });

    it('消息限制为正整数', () => {
      expect(BOBBY_DEFAULTS.chat.recentMessagesLimit).toBeGreaterThan(0);
      expect(BOBBY_DEFAULTS.chat.recentNotesLimit).toBeGreaterThan(0);
    });

    it('延迟参数合理', () => {
      expect(BOBBY_DEFAULTS.chat.replyDelayMin).toBeGreaterThan(0);
      expect(BOBBY_DEFAULTS.chat.replyDelayExtra).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════
  // 天气配置
  // ═══════════════════════════════════════════
  describe('weather 配置', () => {
    it('厦门坐标合理', () => {
      // 厦门纬度 24.48, 经度 118.09
      expect(BOBBY_DEFAULTS.weather.lat).toBeCloseTo(24.48, 0);
      expect(BOBBY_DEFAULTS.weather.lon).toBeCloseTo(118.09, 0);
    });

    it('缓存时间合理', () => {
      expect(BOBBY_DEFAULTS.weather.cacheDurationMs).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════
  // 活跃/安静状态分类
  // ═══════════════════════════════════════════
  describe('状态分类', () => {
    it('活跃状态列表非空', () => {
      expect(BOBBY_DEFAULTS.activeStates.length).toBeGreaterThan(0);
    });

    it('安静状态列表非空', () => {
      expect(BOBBY_DEFAULTS.quietStates.length).toBeGreaterThan(0);
    });

    it('活跃和安静状态无重叠', () => {
      const overlap = BOBBY_DEFAULTS.activeStates.filter(s => BOBBY_DEFAULTS.quietStates.includes(s));
      expect(overlap.length).toBe(0);
    });
  });
});
