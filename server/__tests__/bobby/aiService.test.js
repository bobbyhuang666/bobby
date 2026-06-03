/**
 * Bobby AI 服务测试
 *
 * 测试 aiService.js：
 *   - callDeepSeek API 调用
 *   - generateReply 回复生成
 *   - generateCommentReply 评论回复
 *   - generateReflection 反思生成
 *   - generateInnerThought 内心独白
 *   - fallback 机制
 */

// Mock 外部依赖
jest.mock('../../services/weatherService', () => ({
  getWeatherContext: jest.fn().mockResolvedValue('晴天，26°C'),
}));

jest.mock('../../services/bobbyMemory', () => ({
  BobbyMemoryService: {
    retrieve: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../services/worldEngine', () => ({
  WorldEngine: {
    getUnusedEvents: jest.fn().mockResolvedValue([]),
  },
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

const { callDeepSeek, generateReply, generateCommentReply, generateReflection, generateInnerThought } = require('../../services/aiService');

describe('Bobby AI 服务', () => {

  beforeEach(() => {
    mockFetch.mockReset();
  });

  // ═══════════════════════════════════════════
  // callDeepSeek
  // ═══════════════════════════════════════════
  describe('callDeepSeek', () => {
    it('成功返回回复文本', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '嗯嗯' } }]
        })
      });

      const result = await callDeepSeek([{ role: 'user', content: '你好' }]);
      expect(result).toBe('嗯嗯');
    });

    it('去除首尾空白', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '  嗯  ' } }]
        })
      });

      const result = await callDeepSeek([{ role: 'user', content: '你好' }]);
      expect(result).toBe('嗯');
    });

    it('空内容返回"嗯"', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '' } }]
        })
      });

      const result = await callDeepSeek([{ role: 'user', content: '你好' }]);
      expect(result).toBe('嗯');
    });

    it('API 错误抛出异常', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(callDeepSeek([{ role: 'user', content: '你好' }]))
        .rejects.toThrow('DeepSeek API error: 500');
    });

    it('使用默认参数', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '嗯' } }]
        })
      });

      await callDeepSeek([{ role: 'user', content: '你好' }]);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.model).toBe('deepseek-chat');
      expect(body.max_tokens).toBe(100);
      expect(body.temperature).toBe(0.85);
      expect(body.stream).toBe(false);
    });

    it('支持自定义参数', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '嗯' } }]
        })
      });

      await callDeepSeek([{ role: 'user', content: '你好' }], { maxTokens: 50, temperature: 0.9 });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.max_tokens).toBe(50);
      expect(body.temperature).toBe(0.9);
    });
  });

  // ═══════════════════════════════════════════
  // generateReply
  // ═══════════════════════════════════════════
  describe('generateReply', () => {
    it('成功返回回复', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '在' } }]
        })
      });

      const result = await generateReply({
        userText: '在干嘛',
        history: [],
        user: null,
        bobbyStatus: '在发呆',
        recentNotes: [],
        timeLabel: '下午',
      });

      expect(result).toBe('在');
    });

    it('API 失败返回 fallback', async () => {
      mockFetch.mockRejectedValue(new Error('网络错误'));

      const result = await generateReply({
        userText: '你好',
        history: [],
        user: null,
        bobbyStatus: '在发呆',
        recentNotes: [],
        timeLabel: '下午',
      });

      const fallbacks = ['嗯', '...', '在', '嗯嗯'];
      expect(fallbacks).toContain(result);
    });

    it('传递历史消息', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '嗯' } }]
        })
      });

      await generateReply({
        userText: '你好',
        history: [
          { role: 'user', content: '早' },
          { role: 'assistant', content: '早' },
        ],
        user: null,
        bobbyStatus: '在发呆',
        recentNotes: [],
        timeLabel: '下午',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // system + 2 history messages = 3
      expect(body.messages.length).toBe(3);
    });

    it('最近消息限制 20 条', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '嗯' } }]
        })
      });

      const history = Array.from({ length: 30 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `消息${i}`
      }));

      await generateReply({
        userText: '你好',
        history,
        user: null,
        bobbyStatus: '在发呆',
        recentNotes: [],
        timeLabel: '下午',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // system + 20 history = 21
      expect(body.messages.length).toBe(21);
    });
  });

  // ═══════════════════════════════════════════
  // generateCommentReply
  // ═══════════════════════════════════════════
  describe('generateCommentReply', () => {
    it('成功返回评论回复', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '谢谢' } }]
        })
      });

      const result = await generateCommentReply('今天天气不错', '好看', '陌生');
      expect(result).toBe('谢谢');
    });

    it('API 失败返回 fallback', async () => {
      mockFetch.mockRejectedValue(new Error('网络错误'));

      const result = await generateCommentReply('今天天气不错', '好看', '陌生');

      const fallbacks = ['嗯', '...', '看到了', '嗯嗯'];
      expect(fallbacks).toContain(result);
    });

    it('不同好感度使用不同风格指南', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '嗯' } }]
        })
      });

      // 测试不同好感度等级
      const levels = ['陌生', '认识', '熟悉', '默契', '信赖'];
      for (const level of levels) {
        await generateCommentReply('测试', '评论', level);
      }

      // 每次都应该成功调用
      expect(mockFetch).toHaveBeenCalledTimes(levels.length);
    });
  });

  // ═══════════════════════════════════════════
  // generateReflection
  // ═══════════════════════════════════════════
  describe('generateReflection', () => {
    it('成功返回反思内容', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '今天过得好快...' } }]
        })
      });

      const result = await generateReflection([], null);
      expect(result).toBe('今天过得好快...');
    });

    it('API 失败返回 null', async () => {
      mockFetch.mockRejectedValue(new Error('网络错误'));

      const result = await generateReflection([], null);
      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════
  // generateInnerThought
  // ═══════════════════════════════════════════
  describe('generateInnerThought', () => {
    it('成功返回内心独白', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '在想什么呢...' } }]
        })
      });

      const result = await generateInnerThought('rumination', null);
      expect(result).toBe('在想什么呢...');
    });

    it('API 失败返回 null', async () => {
      mockFetch.mockRejectedValue(new Error('网络错误'));

      const result = await generateInnerThought('daydream', null);
      expect(result).toBeNull();
    });

    it('不同模块都能生成', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '思维' } }]
        })
      });

      const modules = ['rumination', 'reflection', 'daydream', 'self_evaluation', 'social_thinking', 'sensory_awareness'];
      for (const mod of modules) {
        const result = await generateInnerThought(mod, null);
        expect(result).toBeTruthy();
      }
    });
  });
});
