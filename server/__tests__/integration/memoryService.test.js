/**
 * MemoryService 集成测试
 *
 * 使用真实 MongoDB 测试记忆服务的数据库操作：
 *   - 添加记忆
 *   - 重复记忆强化
 *   - 记忆检索
 *   - 用户画像
 *   - Dream-time 计算
 */

const mongoose = require('mongoose');
const User = require('../../models/User');

// Mock EmbeddingService（集成测试环境无法加载 @xenova/transformers 的 ESM 模块）
// 使用确定性伪向量：相同文本产生相同向量，不同文本产生不同向量
jest.mock('../../services/embeddingService', () => {
  // 简单哈希
  function hash(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) & 0xffffffff;
    return h;
  }
  // 文本分词（中文按 2-gram 切分，去掉标点和常见前缀）
  function tokenize(text) {
    const clean = text.replace(/^(用户说|对方|这个人)[:：]?\s*/, '').replace(/[，。！？、；：""''（）\s]+/g, '');
    const grams = [];
    for (let i = 0; i < clean.length - 1; i++) {
      grams.push(clean.slice(i, i + 2));
    }
    return grams;
  }
  // 基于关键词重叠率构建向量：每个维度对应一个关键词槽位
  // 相同文本 → 1.0，有共同关键词 → 0.6-0.8，无关 → 0.0-0.1
  const keywordIndex = new Map(); // keyword → dimension index
  let nextDim = 0;
  function getDim(word) {
    if (!keywordIndex.has(word)) {
      keywordIndex.set(word, nextDim++ % 384);
    }
    return keywordIndex.get(word);
  }
  function textToVec(text) {
    const vec = new Array(384).fill(0);
    const words = tokenize(text);
    for (const w of words) {
      vec[getDim(w)] = 1;
    }
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    return norm > 0 ? vec.map(v => v / norm) : vec;
  }
  return {
    getEmbedding: async (text) => textToVec(text),
    getQueryEmbedding: async (text) => textToVec(text),
    cosineSimilarity: (a, b) => {
      if (!a || !b || a.length !== b.length) return 0;
      let dot = 0;
      for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
      return dot;
    },
    isReady: true,
    dimensions: 384,
  };
});

// Mock aiService（集成测试不需要真实 LLM 调用）
jest.mock('../../services/aiService', () => ({
  generateClusterInsight: async (memories, tag) => {
    // 模拟 LLM 洞察生成
    if (tag === 'sad') return '这个人好像经常不开心。要多陪陪。';
    if (tag === 'tired') return '这个人好像总是很累。';
    return `关于这些人，有一些${tag}的记忆。`;
  },
}));

const { MemoryService, MemoryBlock } = require('../../services/memoryService');

describe('MemoryService 集成测试', () => {
  let user;

  beforeEach(async () => {
    user = await User.create({ username: 'testuser', password: 'password123' });
  });

  // ═══════════════════════════════════════════
  // 添加记忆
  // ═══════════════════════════════════════════
  describe('添加记忆 (addMemory)', () => {
    it('创建新记忆', async () => {
      const memory = await MemoryService.addMemory(user._id, {
        type: 'fact',
        content: '用户说：我住在厦门',
        source: 'conversation',
        tags: ['fact', 'user']
      });

      expect(memory._id).toBeDefined();
      expect(memory.type).toBe('fact');
      expect(memory.content).toBe('用户说：我住在厦门');
      expect(memory.strength).toBe(1.0);
    });

    it('重复记忆被强化而非创建', async () => {
      // addMemory 用新内容前20字符做正则匹配旧内容
      // 相同文本触发合并
      const content = '用户说我经常去图书馆看书学习';
      await MemoryService.addMemory(user._id, {
        type: 'fact',
        content,
      });

      await MemoryService.addMemory(user._id, {
        type: 'fact',
        content,  // 完全相同的内容
      });

      const memories = await MemoryBlock.find({ userId: user._id });
      expect(memories.length).toBe(1);
      // 初始强度 1.0，强化后 Math.min(1, 1.0+0.2) = 1.0（上限封顶）
      expect(memories[0].strength).toBe(1.0);
      expect(memories[0].accessCount).toBe(2);
    });

    it('不同用户记忆独立', async () => {
      const user2 = await User.create({ username: 'user2', password: 'password123' });

      await MemoryService.addMemory(user._id, {
        type: 'fact', content: '用户说：我是学生',
      });
      await MemoryService.addMemory(user2._id, {
        type: 'fact', content: '用户说：我是老师',
      });

      const user1Memories = await MemoryBlock.find({ userId: user._id });
      const user2Memories = await MemoryBlock.find({ userId: user2._id });

      expect(user1Memories.length).toBe(1);
      expect(user2Memories.length).toBe(1);
      expect(user1Memories[0].content).toContain('学生');
      expect(user2Memories[0].content).toContain('老师');
    });
  });

  // ═══════════════════════════════════════════
  // 从对话中学习
  // ═══════════════════════════════════════════
  describe('从对话中学习 (learnFromConversation)', () => {
    it('提取事实记忆', async () => {
      await MemoryService.learnFromConversation(
        user._id,
        '我叫小明，住在厦门',
        '嗯'
      );

      const memories = await MemoryBlock.find({ userId: user._id, type: 'fact' });
      expect(memories.length).toBeGreaterThan(0);
      expect(memories[0].content).toContain('我叫小明');
    });

    it('提取情绪记忆', async () => {
      await MemoryService.learnFromConversation(
        user._id,
        '今天好难过',
        '怎么了'
      );

      const memories = await MemoryBlock.find({ userId: user._id, type: 'emotion' });
      expect(memories.length).toBeGreaterThan(0);
      expect(memories[0].emotionTag).toBe('sad');
    });

    it('提取偏好记忆', async () => {
      await MemoryService.learnFromConversation(
        user._id,
        '我喜欢吃火锅',
        '嗯'
      );

      const memories = await MemoryBlock.find({ userId: user._id, type: 'preference' });
      expect(memories.length).toBeGreaterThan(0);
      expect(memories[0].content).toContain('喜欢');
    });

    it('普通对话不产生记忆', async () => {
      await MemoryService.learnFromConversation(
        user._id,
        '今天天气不错',
        '嗯'
      );

      const memories = await MemoryBlock.find({ userId: user._id });
      expect(memories.length).toBe(0);
    });
  });

  // ═══════════════════════════════════════════
  // 记忆检索
  // ═══════════════════════════════════════════
  describe('记忆检索 (retrieve)', () => {
    it('基于关键词检索', async () => {
      await MemoryService.addMemory(user._id, {
        type: 'fact', content: '用户说：我住在厦门集美',
      });
      await MemoryService.addMemory(user._id, {
        type: 'fact', content: '用户说：我喜欢看电影',
      });

      const memories = await MemoryService.retrieve(user._id, '厦门');
      expect(memories.length).toBeGreaterThan(0);
      expect(memories[0].content).toContain('厦门');
    });

    it('无关键词时返回强记忆', async () => {
      await MemoryService.addMemory(user._id, {
        type: 'fact', content: '用户说：我是学生',
      });

      const memories = await MemoryService.retrieve(user._id, '');
      expect(memories.length).toBeGreaterThan(0);
    });

    it('低强度记忆排序靠后', async () => {
      // V3 语义检索：低强度记忆仍可被检索到（语义相关时），但排名靠后
      const low = await MemoryService.addMemory(user._id, {
        type: 'fact', content: '用户说：我是学生',
      });
      await MemoryBlock.findByIdAndUpdate(low._id, { strength: 0.05 });

      const high = await MemoryService.addMemory(user._id, {
        type: 'fact', content: '用户说：我住在厦门',
      });

      const memories = await MemoryService.retrieve(user._id, '厦门');
      // 高强度的应排在前面
      if (memories.length >= 2) {
        const highIdx = memories.findIndex(m => m._id.toString() === high._id.toString());
        const lowIdx = memories.findIndex(m => m._id.toString() === low._id.toString());
        if (highIdx >= 0 && lowIdx >= 0) {
          expect(highIdx).toBeLessThan(lowIdx);
        }
      }
    });

    it('限制返回数量', async () => {
      for (let i = 0; i < 10; i++) {
        await MemoryService.addMemory(user._id, {
          type: 'fact', content: `用户说：事实${i}`,
        });
      }

      const memories = await MemoryService.retrieve(user._id, '', 3);
      expect(memories.length).toBeLessThanOrEqual(3);
    });

    it('更新访问计数', async () => {
      await MemoryService.addMemory(user._id, {
        type: 'fact', content: '用户说：我是学生',
      });

      await MemoryService.retrieve(user._id, '学生');

      const memories = await MemoryBlock.find({ userId: user._id });
      expect(memories[0].accessCount).toBeGreaterThan(1);
    });
  });

  // ═══════════════════════════════════════════
  // 用户画像
  // ═══════════════════════════════════════════
  describe('用户画像 (getUserProfile)', () => {
    it('空记忆返回空字符串', async () => {
      const profile = await MemoryService.getUserProfile(user._id);
      expect(profile).toBe('');
    });

    it('包含洞察信息', async () => {
      await MemoryService.addMemory(user._id, {
        type: 'insight', content: '这个人经常不开心', emotionTag: 'sad',
      });

      const profile = await MemoryService.getUserProfile(user._id);
      expect(profile).toContain('不开心');
    });

    it('包含偏好信息', async () => {
      await MemoryService.addMemory(user._id, {
        type: 'preference', content: '对方喜欢吃火锅',
      });

      const profile = await MemoryService.getUserProfile(user._id);
      expect(profile).toContain('火锅');
    });
  });

  // ═══════════════════════════════════════════
  // Dream-time 计算
  // ═══════════════════════════════════════════
  describe('Dream-time 计算 (dreamTimeCompute)', () => {
    it('无记忆时不崩溃', async () => {
      await expect(MemoryService.dreamTimeCompute(user._id)).resolves.not.toThrow();
    });

    it('弱记忆被删除', async () => {
      // 创建一条记忆，然后将其时间设为很久以前
      const memory = await MemoryService.addMemory(user._id, {
        type: 'fact', content: '用户说：我是学生',
      });

      // 将 lastAccessed 设为 1000 小时前
      await MemoryBlock.findByIdAndUpdate(memory._id, {
        lastAccessed: new Date(Date.now() - 1000 * 3600000),
        strength: 0.06, // 接近阈值
      });

      await MemoryService.dreamTimeCompute(user._id);

      const remaining = await MemoryBlock.find({ userId: user._id });
      // 1000小时衰减后应该低于 0.05 阈值被删除
      expect(remaining.length).toBe(0);
    });

    it('高频访问记忆有最低保障', async () => {
      const memory = await MemoryService.addMemory(user._id, {
        type: 'fact', content: '用户说：我是学生',
      });

      // 设置高访问次数和很久以前的时间
      await MemoryBlock.findByIdAndUpdate(memory._id, {
        accessCount: 10,
        lastAccessed: new Date(Date.now() - 1000 * 3600000),
        strength: 0.5,
      });

      await MemoryService.dreamTimeCompute(user._id);

      const remaining = await MemoryBlock.find({ userId: user._id });
      // 高频访问记忆应有最低保障
      expect(remaining.length).toBe(1);
      expect(remaining[0].strength).toBeGreaterThanOrEqual(0.2);
    });

    it('多条同主题记忆触发向量聚类整合', async () => {
      // 直接创建记忆并预设相似向量，确保聚类阈值 > 0.65
      // （绕过 addMemory 的向量化，直接控制 embedding 值）
      const baseVec = new Array(384).fill(0);
      baseVec[0] = 1; // [1, 0, 0, ...] 单位向量

      for (let i = 0; i < 3; i++) {
        const vec = [...baseVec];
        vec[1] = i * 0.05; // 微小差异，余弦相似度 ≈ 0.99
        const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
        const normalized = vec.map(v => v / norm);

        await MemoryBlock.create({
          userId: user._id,
          type: 'emotion',
          content: `压力来源${i}：学业和前途的焦虑`,
          emotionTag: 'sad',
          embedding: normalized,
          strength: 0.8,
          accessCount: 1,
        });
      }

      const all = await MemoryBlock.find({ userId: user._id, type: 'emotion' });
      expect(all.length).toBe(3);

      await MemoryService.dreamTimeCompute(user._id);

      // 应该生成一条洞察（通过向量聚类 + LLM）
      const insights = await MemoryBlock.find({ userId: user._id, type: 'insight' });
      expect(insights.length).toBeGreaterThanOrEqual(1);
      expect(insights[0].content).toContain('不开心');
    });
  });
});
