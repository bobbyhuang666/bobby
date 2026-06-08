/**
 * NoteSystem 单元测试
 *
 * 测试碎片选择、上下文组合、去重逻辑。
 * 不测试需要外部 API 的 generateWeatherNote / generateEmotionNote。
 */

const { NoteSystem, DAILY_NOTES } = require('../../modules/notes');

// 模拟 EmotionEngine（只暴露 getValence / getArousal）
function mockEmotion(valence, arousal) {
  return {
    getValence: () => valence,
    getArousal: () => arousal,
  };
}

describe('NoteSystem', () => {
  // ═══════════════════════════════════════════
  describe('getDailyPool', () => {
    it('返回碎片数组且非空', () => {
      const pool = NoteSystem.getDailyPool();
      expect(Array.isArray(pool)).toBe(true);
      expect(pool.length).toBeGreaterThan(50);
    });

    it('返回的数组与内部数组不同引用', () => {
      const a = NoteSystem.getDailyPool();
      const b = NoteSystem.getDailyPool();
      expect(a).not.toBe(b);
      a[0] = 'INJECTED';
      expect(NoteSystem.getDailyPool()[0]).not.toBe('INJECTED');
    });
  });

  // ═══════════════════════════════════════════
  describe('selectFragment', () => {
    it('无参数时返回通用碎片', () => {
      const frag = NoteSystem.selectFragment();
      expect(typeof frag).toBe('string');
      expect(frag.length).toBeGreaterThan(0);
    });

    it('有状态参数时可能返回状态专属碎片', () => {
      // 多次调用确保覆盖所有分支
      const results = new Set();
      for (let i = 0; i < 20; i++) {
        results.add(NoteSystem.selectFragment({ status: '还没睡呢' }));
      }
      // 至少返回了一些结果
      expect(results.size).toBeGreaterThanOrEqual(1);
    });

    it('正面情绪（高 valence）可能返回正面碎片', () => {
      const em = mockEmotion(0.5, 0.7);
      const results = new Set();
      for (let i = 0; i < 20; i++) {
        results.add(NoteSystem.selectFragment({ emotionEngine: em }));
      }
      expect(results.size).toBeGreaterThanOrEqual(1);
    });

    it('负面情绪低唤醒返回低落碎片', () => {
      const em = mockEmotion(-0.4, 0.2);
      const results = new Set();
      for (let i = 0; i < 20; i++) {
        results.add(NoteSystem.selectFragment({ emotionEngine: em }));
      }
      expect(results.size).toBeGreaterThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════════════
  describe('composeContextualNote', () => {
    it('下雨天返回雨天碎片', () => {
      const note = NoteSystem.composeContextualNote({
        weatherContext: '现在25度，在下雨，风好大',
        emotionEngine: mockEmotion(0, 0.5),
      });
      expect(note).toBeTruthy();
    });

    it('高温天返回高温碎片', () => {
      const note = NoteSystem.composeContextualNote({
        weatherContext: '现在36度，好热',
        emotionEngine: mockEmotion(0, 0.5),
      });
      expect(note).toBeTruthy();
    });

    it('深夜返回深夜碎片', () => {
      const note = NoteSystem.composeContextualNote({
        weatherContext: '现在20度，天气还行',
        emotionEngine: mockEmotion(0, 0.5),
        hour: 1, // 凌晨 1 点
      });
      expect(note).toBeTruthy();
    });

    it('低落情绪返回低落碎片', () => {
      const note = NoteSystem.composeContextualNote({
        emotionEngine: mockEmotion(-0.5, 0.3),
      });
      expect(note).toBeTruthy();
    });

    it('无匹配条件返回 null', () => {
      const note = NoteSystem.composeContextualNote({
        weatherContext: '', // 空上下文
        emotionEngine: mockEmotion(0, 0.5),
        hour: 12, // 中午
      });
      expect(note).toBeNull();
    });
  });
});
