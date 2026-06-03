/**
 * Bobby 记忆服务测试
 *
 * 测试 MemoryService 的纯逻辑方法：
 *   - 事实提取
 *   - 情绪提取
 *   - 偏好提取
 *   - 关键词提取
 *   - 正则转义
 *   - 洞察生成
 */

// Mock mongoose
jest.mock('mongoose', () => {
  const mockSchema = function() {
    this.pre = jest.fn();
    this.index = jest.fn();
  };
  mockSchema.Types = { ObjectId: 'ObjectId' };

  return {
    Schema: mockSchema,
    model: jest.fn().mockReturnValue({
      find: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([])
          }),
          lean: jest.fn().mockResolvedValue([])
        }),
        lean: jest.fn().mockResolvedValue([])
      }),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
      bulkWrite: jest.fn().mockResolvedValue({}),
    }),
  };
});

const { MemoryService } = require('../../services/memoryService');

describe('Bobby 记忆服务', () => {

  // ═══════════════════════════════════════════
  // 事实提取
  // ═══════════════════════════════════════════
  describe('事实提取 (_extractFacts)', () => {
    it('提取名字信息', () => {
      const facts = MemoryService._extractFacts('我叫小明');
      expect(facts.length).toBe(1);
      expect(facts[0]).toContain('我叫小明');
    });

    it('提取住址信息', () => {
      const facts = MemoryService._extractFacts('我住在厦门');
      expect(facts.length).toBe(1);
      expect(facts[0]).toContain('我住在厦门');
    });

    it('提取喜好信息', () => {
      const facts = MemoryService._extractFacts('我喜欢吃火锅');
      expect(facts.length).toBe(1);
    });

    it('提取厌恶信息', () => {
      const facts = MemoryService._extractFacts('我讨厌下雨天');
      expect(facts.length).toBe(1);
    });

    it('问句不提取事实', () => {
      expect(MemoryService._extractFacts('你叫什么名字？').length).toBe(0);
      expect(MemoryService._extractFacts('你是谁吗').length).toBe(0);
      expect(MemoryService._extractFacts('好不好吧').length).toBe(0);
    });

    it('普通对话不提取', () => {
      const facts = MemoryService._extractFacts('今天天气不错');
      expect(facts.length).toBe(0);
    });

    it('空字符串不提取', () => {
      expect(MemoryService._extractFacts('').length).toBe(0);
    });

    it('截断过长文本', () => {
      const longText = '我叫' + '啊'.repeat(100);
      const facts = MemoryService._extractFacts(longText);
      if (facts.length > 0) {
        expect(facts[0].length).toBeLessThanOrEqual(40);
      }
    });
  });

  // ═══════════════════════════════════════════
  // 情绪提取
  // ═══════════════════════════════════════════
  describe('情绪提取 (_extractEmotion)', () => {
    it('检测疲惫', () => {
      const emotion = MemoryService._extractEmotion('今天好累');
      expect(emotion).toBeTruthy();
      expect(emotion.label).toBe('疲惫');
      expect(emotion.tag).toBe('tired');
    });

    it('检测难过', () => {
      const emotion = MemoryService._extractEmotion('我好难过');
      expect(emotion).toBeTruthy();
      expect(emotion.label).toBe('难过');
      expect(emotion.tag).toBe('sad');
    });

    it('检测开心', () => {
      const emotion = MemoryService._extractEmotion('哈哈太开心了');
      expect(emotion).toBeTruthy();
      expect(emotion.label).toBe('开心');
      expect(emotion.tag).toBe('warm');
    });

    it('检测孤独', () => {
      const emotion = MemoryService._extractEmotion('好孤独啊');
      expect(emotion).toBeTruthy();
      expect(emotion.label).toBe('孤独');
      expect(emotion.tag).toBe('lonely');
    });

    it('检测生气', () => {
      const emotion = MemoryService._extractEmotion('气死我了');
      expect(emotion).toBeTruthy();
      expect(emotion.label).toBe('生气');
    });

    it('检测感激', () => {
      const emotion = MemoryService._extractEmotion('谢谢你');
      expect(emotion).toBeTruthy();
      expect(emotion.label).toBe('感激');
      expect(emotion.tag).toBe('warm');
    });

    it('普通对话不检测情绪', () => {
      expect(MemoryService._extractEmotion('今天天气不错')).toBeNull();
    });

    it('问句不检测"一个人"作为孤独', () => {
      // "一个人" 在问句中不算孤独
      const emotion = MemoryService._extractEmotion('你一个人吗？');
      expect(emotion).toBeNull();
    });

    it('非问句中"一个人"算孤独', () => {
      const emotion = MemoryService._extractEmotion('我一个人');
      expect(emotion).toBeTruthy();
      expect(emotion.tag).toBe('lonely');
    });
  });

  // ═══════════════════════════════════════════
  // 偏好提取
  // ═══════════════════════════════════════════
  describe('偏好提取 (_extractPreferences)', () => {
    it('提取喜欢', () => {
      const prefs = MemoryService._extractPreferences('我喜欢吃火锅');
      expect(prefs.length).toBe(1);
      expect(prefs[0]).toContain('喜欢');
    });

    it('提取爱', () => {
      // _extractPreferences 将"爱"统一输出为"喜欢..."
      const prefs = MemoryService._extractPreferences('我爱看电影');
      expect(prefs.length).toBe(1);
      expect(prefs[0]).toContain('喜欢');
      expect(prefs[0]).toContain('看电影');
    });

    it('普通对话不提取', () => {
      expect(MemoryService._extractPreferences('今天天气不错').length).toBe(0);
    });

    it('截断过长偏好', () => {
      const prefs = MemoryService._extractPreferences('我喜欢' + '啊'.repeat(50));
      if (prefs.length > 0) {
        // "喜欢" + 最多10字
        expect(prefs[0].length).toBeLessThanOrEqual(15);
      }
    });
  });

  // ═══════════════════════════════════════════
  // 关键词提取
  // ═══════════════════════════════════════════
  describe('关键词提取 (_extractKeywords)', () => {
    it('提取有意义的词', () => {
      const keywords = MemoryService._extractKeywords('我今天去了图书馆');
      expect(keywords.length).toBeGreaterThan(0);
    });

    it('过滤短词', () => {
      const keywords = MemoryService._extractKeywords('我 你 他');
      // 单字被过滤
      expect(keywords.length).toBe(0);
    });

    it('最多 5 个关键词', () => {
      const longText = '第一个词 第二个词 第三个词 第四个词 第五个词 第六个词 第七个词';
      const keywords = MemoryService._extractKeywords(longText);
      expect(keywords.length).toBeLessThanOrEqual(5);
    });

    it('去除标点符号', () => {
      const keywords = MemoryService._extractKeywords('你好！今天？不错。');
      // 标点被替换为空格，然后分割
      for (const kw of keywords) {
        expect(kw).not.toMatch(/[，。！？、；：""''（）]/);
      }
    });

    it('空字符串返回空数组', () => {
      expect(MemoryService._extractKeywords('')).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════
  // 正则转义
  // ═══════════════════════════════════════════
  describe('正则转义 (_escapeRegex)', () => {
    it('转义特殊字符', () => {
      expect(MemoryService._escapeRegex('a.b')).toBe('a\\.b');
      expect(MemoryService._escapeRegex('a+b')).toBe('a\\+b');
      expect(MemoryService._escapeRegex('a*b')).toBe('a\\*b');
      expect(MemoryService._escapeRegex('a?b')).toBe('a\\?b');
      expect(MemoryService._escapeRegex('a(b)c')).toBe('a\\(b\\)c');
      expect(MemoryService._escapeRegex('[a]')).toBe('\\[a\\]');
    });

    it('普通文本不变', () => {
      expect(MemoryService._escapeRegex('你好世界')).toBe('你好世界');
    });

    it('空字符串不变', () => {
      expect(MemoryService._escapeRegex('')).toBe('');
    });
  });

  // ═══════════════════════════════════════════
  // 洞察生成
  // ═══════════════════════════════════════════
  describe('洞察生成 (_generateInsight)', () => {
    it('sad 标签生成正确洞察', () => {
      const insight = MemoryService._generateInsight('sad', []);
      expect(insight).toContain('不开心');
    });

    it('warm 标签生成正确洞察', () => {
      const insight = MemoryService._generateInsight('warm', []);
      expect(insight).toContain('很好');
    });

    it('funny 标签生成正确洞察', () => {
      const insight = MemoryService._generateInsight('funny', []);
      expect(insight).toContain('有意思');
    });

    it('tired 标签生成正确洞察', () => {
      const insight = MemoryService._generateInsight('tired', []);
      expect(insight).toContain('累');
    });

    it('lonely 标签生成正确洞察', () => {
      const insight = MemoryService._generateInsight('lonely', []);
      expect(insight).toContain('孤独');
    });

    it('未知标签生成通用洞察', () => {
      const insight = MemoryService._generateInsight('unknown', []);
      expect(insight).toBeTruthy();
    });
  });
});
