/**
 * Bobby 认知循环测试
 *
 * 测试 CognitiveLoop：
 *   - 认知模块选择
 *   - 思维生成
 *   - 主动消息决策
 *   - 消息类型决策
 */

// Mock aiService
jest.mock('../../services/aiService', () => ({
  generateReflection: jest.fn().mockResolvedValue('深夜的碎片'),
  generateInnerThought: jest.fn().mockResolvedValue('AI生成的思维'),
}));

// Mock Note model
jest.mock('../../models/Note', () => ({
  find: jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      })
    })
  }),
  create: jest.fn().mockResolvedValue({ _id: 'note1', content: '深夜的碎片' }),
}));

const { CognitiveLoop, COGNITIVE_MODULES } = require('../../services/cognitiveLoop');
const { EmotionEngine } = require('../../services/emotionEngine');

describe('Bobby 认知循环', () => {
  let cognitive;
  let emotion;
  let mockBobby;

  beforeEach(() => {
    emotion = new EmotionEngine();
    mockBobby = {
      state: { currentStatus: '在发呆' }
    };
    cognitive = new CognitiveLoop(emotion, mockBobby);
  });

  // ═══════════════════════════════════════════
  // 认知模块常量
  // ═══════════════════════════════════════════
  describe('认知模块常量', () => {
    it('有 6 个认知模块', () => {
      expect(Object.keys(COGNITIVE_MODULES).length).toBe(6);
    });

    it('包含所有模块', () => {
      expect(COGNITIVE_MODULES.RUMINATION).toBe('rumination');
      expect(COGNITIVE_MODULES.REFLECTION).toBe('reflection');
      expect(COGNITIVE_MODULES.DAYDREAM).toBe('daydream');
      expect(COGNITIVE_MODULES.SELF_EVAL).toBe('self_evaluation');
      expect(COGNITIVE_MODULES.SOCIAL).toBe('social_thinking');
      expect(COGNITIVE_MODULES.SENSORY).toBe('sensory_awareness');
    });
  });

  // ═══════════════════════════════════════════
  // 初始化
  // ═══════════════════════════════════════════
  describe('初始化', () => {
    it('思维队列初始为空', () => {
      expect(cognitive.thoughtQueue).toEqual([]);
    });

    it('最近思维记录初始为空', () => {
      expect(cognitive.recentThoughts).toEqual([]);
    });

    it('活跃模块初始为 null', () => {
      expect(cognitive.activeModule).toBeNull();
    });

    it('上次反思时间为 0', () => {
      expect(cognitive.lastReflection).toBe(0);
    });
  });

  // ═══════════════════════════════════════════
  // 认知模块选择
  // ═══════════════════════════════════════════
  describe('认知模块选择 (_selectCognitiveModule)', () => {
    it('负面情绪时主要选择反刍或自我评价', () => {
      // 设置极端负面情绪：valence < -0.2
      emotion.current.sadness = 0.8;
      emotion.current.loneliness = 0.5;
      emotion.current.joy = 0;
      emotion.current.calm = 0;
      emotion.current.excitement = 0;

      const counts = {};
      const iterations = 200;
      for (let i = 0; i < iterations; i++) {
        const mod = cognitive._selectCognitiveModule();
        counts[mod] = (counts[mod] || 0) + 1;
      }

      // 负面时 60% rumination + 40% self_evaluation
      const primaryCount = (counts[COGNITIVE_MODULES.RUMINATION] || 0) + (counts[COGNITIVE_MODULES.SELF_EVAL] || 0);
      expect(primaryCount / iterations).toBeGreaterThan(0.8);
    });

    it('高唤醒时主要选择白日梦或社交思考', () => {
      // 设置高唤醒：arousal > 0.5，valence > -0.2
      emotion.current.excitement = 0.8;
      emotion.current.anger = 0.3;
      emotion.current.joy = 0.2;
      emotion.current.sadness = 0;
      emotion.current.calm = 0;

      const counts = {};
      const iterations = 200;
      for (let i = 0; i < iterations; i++) {
        const mod = cognitive._selectCognitiveModule();
        counts[mod] = (counts[mod] || 0) + 1;
      }

      const primaryCount = (counts[COGNITIVE_MODULES.DAYDREAM] || 0) + (counts[COGNITIVE_MODULES.SOCIAL] || 0);
      expect(primaryCount / iterations).toBeGreaterThan(0.8);
    });

    it('低唤醒时主要选择感官觉察或反思', () => {
      // 设置低唤醒：arousal < 0.3，valence > -0.2
      emotion.current.calm = 0.6;
      emotion.current.boredom = 0.3;
      emotion.current.joy = 0.15;
      emotion.current.excitement = 0;
      emotion.current.sadness = 0;

      const counts = {};
      const iterations = 200;
      for (let i = 0; i < iterations; i++) {
        const mod = cognitive._selectCognitiveModule();
        counts[mod] = (counts[mod] || 0) + 1;
      }

      const primaryCount = (counts[COGNITIVE_MODULES.SENSORY] || 0) + (counts[COGNITIVE_MODULES.REFLECTION] || 0);
      expect(primaryCount / iterations).toBeGreaterThan(0.8);
    });

    it('默认情况返回有效模块', () => {
      const module = cognitive._selectCognitiveModule();
      expect(Object.values(COGNITIVE_MODULES)).toContain(module);
    });
  });

  // ═══════════════════════════════════════════
  // 沉思周期 (reverie)
  // ═══════════════════════════════════════════
  describe('沉思周期 (reverie)', () => {
    it('生成思维内容', async () => {
      const thought = await cognitive.reverie();
      expect(thought).toBeTruthy();
      expect(typeof thought).toBe('string');
    });

    it('思维被加入队列', async () => {
      await cognitive.reverie();
      expect(cognitive.thoughtQueue.length).toBe(1);
    });

    it('思维队列不超过 10 条', async () => {
      for (let i = 0; i < 15; i++) {
        await cognitive.reverie();
      }
      expect(cognitive.thoughtQueue.length).toBeLessThanOrEqual(10);
    });

    it('更新上次反思时间', async () => {
      const before = cognitive.lastReflection;
      await cognitive.reverie();
      expect(cognitive.lastReflection).toBeGreaterThan(before);
    });

    it('记录最近思维', async () => {
      await cognitive.reverie();
      expect(cognitive.recentThoughts.length).toBe(1);
    });

    it('最近思维记录不超过 20 条', async () => {
      for (let i = 0; i < 25; i++) {
        await cognitive.reverie();
      }
      expect(cognitive.recentThoughts.length).toBeLessThanOrEqual(20);
    });
  });

  // ═══════════════════════════════════════════
  // 主动消息决策
  // ═══════════════════════════════════════════
  describe('主动消息决策 (shouldProactiveMessage)', () => {
    let user;

    beforeEach(() => {
      user = { intimacy: 50, vipLevel: null, whisperCountToday: 0 };
    });

    it('基础返回布尔值', () => {
      const result = cognitive.shouldProactiveMessage(user);
      expect(typeof result).toBe('boolean');
    });

    it('每天上限 2 条', () => {
      user.whisperCountToday = 2;
      expect(cognitive.shouldProactiveMessage(user)).toBe(false);
    });

    it('高好感度增加概率', () => {
      // 统计概率差异（多次采样）
      let lowCount = 0, highCount = 0;
      const iterations = 1000;

      user.intimacy = 0;
      for (let i = 0; i < iterations; i++) {
        if (cognitive.shouldProactiveMessage(user)) lowCount++;
      }

      user.intimacy = 80;
      user.whisperCountToday = 0;
      for (let i = 0; i < iterations; i++) {
        if (cognitive.shouldProactiveMessage(user)) highCount++;
      }

      expect(highCount).toBeGreaterThan(lowCount);
    });

    it('高孤独感增加概率', () => {
      let normalCount = 0, lonelyCount = 0;
      const iterations = 1000;

      emotion.current.loneliness = 0;
      for (let i = 0; i < iterations; i++) {
        if (cognitive.shouldProactiveMessage(user)) normalCount++;
      }

      emotion.current.loneliness = 0.5;
      user.whisperCountToday = 0;
      for (let i = 0; i < iterations; i++) {
        if (cognitive.shouldProactiveMessage(user)) lonelyCount++;
      }

      expect(lonelyCount).toBeGreaterThan(normalCount);
    });
  });

  // ═══════════════════════════════════════════
  // 消息类型决策
  // ═══════════════════════════════════════════
  describe('消息类型决策 (decideMessageType)', () => {
    it('返回有效消息类型', () => {
      const validTypes = ['whisper', 'mutter', 'photo', 'voice'];
      const type = cognitive.decideMessageType();
      expect(validTypes).toContain(type);
    });

    it('孤独时倾向 whisper', () => {
      emotion.current.loneliness = 0.5;
      const types = new Set();
      for (let i = 0; i < 100; i++) {
        types.add(cognitive.decideMessageType());
      }
      expect(types.has('whisper')).toBe(true);
    });

    it('无聊时倾向 mutter', () => {
      emotion.current.boredom = 0.5;
      emotion.current.loneliness = 0;
      const types = new Set();
      for (let i = 0; i < 100; i++) {
        types.add(cognitive.decideMessageType());
      }
      expect(types.has('mutter')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════
  // 获取最近思维
  // ═══════════════════════════════════════════
  describe('获取最近思维 (getRecentThoughts)', () => {
    it('初始返回空数组', () => {
      expect(cognitive.getRecentThoughts()).toEqual([]);
    });

    it('最多返回 5 条', async () => {
      for (let i = 0; i < 8; i++) {
        await cognitive.reverie();
      }
      const thoughts = cognitive.getRecentThoughts();
      expect(thoughts.length).toBeLessThanOrEqual(5);
    });
  });
});
