/**
 * Bobby 记忆服务 V3 — 向量语义检索
 *
 * 设计来源：
 * - Letta: Memory Blocks + Dream-time Compute
 * - Mem0: Add-Learn-Retrieve 三步循环
 * - Transformers.js: 本地 Embedding，零外部 API
 *
 * V3 变更：
 * - addMemory: 用向量余弦相似度做去重（替代正则前缀匹配）
 * - retrieve: 用向量语义检索（替代关键词正则匹配）
 * - Dream-time: 用向量空间聚类做记忆整合
 */

const mongoose = require('mongoose');
const EmbeddingService = require('./embeddingService');

// 记忆块 schema
const memoryBlockSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // 记忆类型
  type: {
    type: String,
    enum: ['fact', 'emotion', 'preference', 'event', 'insight'],
    required: true
  },

  // 记忆内容
  content: { type: String, required: true },

  // V3: 384 维语义向量
  embedding: { type: [Number], required: false },

  // 情绪关联
  emotionTag: { type: String },
  emotionIntensity: { type: Number, default: 0.5, min: 0, max: 1 },

  // 记忆强度（会随时间衰减）
  strength: { type: Number, default: 1.0, min: 0, max: 1 },

  // 访问计数
  accessCount: { type: Number, default: 0 },

  // 最后被想起的时间
  lastAccessed: { type: Date, default: Date.now },

  // 来源
  source: { type: String, enum: ['conversation', 'gift', 'note', 'inference'], default: 'conversation' },

  // 标签
  tags: [String]
}, { timestamps: true });

memoryBlockSchema.index({ userId: 1, type: 1, strength: -1 });

const MemoryBlock = mongoose.model('MemoryBlock', memoryBlockSchema);

// ===== 记忆服务 =====
class MemoryService {

  /**
   * 添加记忆（Add）— 向量语义去重
   *
   * 流程：
   * 1. 将新内容向量化
   * 2. 与同类型已有记忆做余弦相似度比对
   * 3. 相似度 > 0.88 → 强化已有记忆（合并）
   * 4. 否则 → 创建新记忆
   */
  static async addMemory(userId, { type, content, emotionTag, source, tags }) {
    // 向量化新记忆
    let newEmbedding;
    try {
      newEmbedding = await EmbeddingService.getEmbedding(content);
    } catch (err) {
      console.error('[Memory] 向量化失败，回退到创建:', err.message);
      // 降级：无向量时直接创建，不做过滤
      return MemoryBlock.create({
        userId, type, content,
        emotionTag: emotionTag || 'neutral',
        emotionIntensity: 0.5,
        strength: 1.0, accessCount: 1,
        source: source || 'conversation',
        tags: tags || []
      });
    }

    // 获取同类型已有记忆（预过滤，减少比对范围）
    const sameType = await MemoryBlock.find({
      userId, type,
      embedding: { $exists: true, $ne: [] }
    }).lean();

    // 在内存中做极速向量比对
    let bestMatch = null;
    let highestScore = 0;

    for (const mem of sameType) {
      if (!mem.embedding || mem.embedding.length === 0) continue;
      const score = EmbeddingService.cosineSimilarity(newEmbedding, mem.embedding);
      if (score > highestScore) {
        highestScore = score;
        bestMatch = mem;
      }
    }

    // 语义高度相似 → 合并/强化（阈值 0.88 代表语义几乎相同）
    if (highestScore > 0.88 && bestMatch) {
      // 如果新内容更长/更具体，用新内容覆盖
      const useNewContent = content.length > bestMatch.content.length;
      const updated = await MemoryBlock.findByIdAndUpdate(bestMatch._id, {
        $set: {
          lastAccessed: new Date(),
          content: useNewContent ? content : bestMatch.content,
          embedding: useNewContent ? newEmbedding : bestMatch.embedding,
        },
        $inc: { accessCount: 1 },
        $min: { strength: 1 },
      }, { new: true });

      // strength 单独处理（$min + $inc 不能混用）
      updated.strength = Math.min(1, updated.strength + 0.15);
      await updated.save();
      return updated;
    }

    // 无相似记忆 → 创建全新记忆
    return MemoryBlock.create({
      userId, type, content,
      emotionTag: emotionTag || 'neutral',
      emotionIntensity: 0.5,
      embedding: newEmbedding,
      strength: 1.0, accessCount: 1,
      source: source || 'conversation',
      tags: tags || []
    });
  }

  // 学习：从对话中提取记忆（Learn）
  static async learnFromConversation(userId, userText, bobbyReply) {
    const facts = this._extractFacts(userText);
    for (const fact of facts) {
      await this.addMemory(userId, {
        type: 'fact',
        content: `用户说：${fact}`,
        source: 'conversation',
        tags: ['fact', 'user']
      });
    }

    const emotion = this._extractEmotion(userText);
    if (emotion) {
      await this.addMemory(userId, {
        type: 'emotion',
        content: `对方${emotion.label}：${userText.slice(0, 20)}`,
        emotionTag: emotion.tag,
        source: 'conversation',
        tags: ['emotion', emotion.tag]
      });
    }

    const preferences = this._extractPreferences(userText);
    for (const pref of preferences) {
      await this.addMemory(userId, {
        type: 'preference',
        content: `对方${pref}`,
        source: 'conversation',
        tags: ['preference', 'user']
      });
    }
  }

  /**
   * 检索：语义向量检索（Retrieve）— V3 核心升级
   *
   * 流程：
   * 1. 将查询文本向量化
   * 2. 拉取用户所有记忆（单用户 < 5000 条，内存完全够）
   * 3. 综合打分：语义相似度(70%) + 记忆强度(30%)
   * 4. 返回 top-N
   */
  static async retrieve(userId, context = '', limit = 5) {
    if (!context.trim()) {
      // 无上下文时返回强度最高的核心记忆
      return MemoryBlock.find({ userId, strength: { $gt: 0.3 } })
        .sort({ strength: -1, accessCount: -1 })
        .limit(limit)
        .lean();
    }

    // 查询向量化
    let queryEmbedding;
    try {
      queryEmbedding = await EmbeddingService.getQueryEmbedding(context);
    } catch (err) {
      // 向量化失败，回退到关键词检索
      console.error('[Memory] 查询向量化失败，回退关键词:', err.message);
      return this._fallbackRetrieve(userId, context, limit);
    }

    // 拉取用户所有记忆（单用户量级，完全可内存操作）
    const allMemories = await MemoryBlock.find({ userId }).lean();

    if (allMemories.length === 0) return [];

    // 综合打分
    const scored = allMemories.map(mem => {
      const hasEmbedding = mem.embedding && mem.embedding.length > 0;
      const semanticScore = hasEmbedding
        ? EmbeddingService.cosineSimilarity(queryEmbedding, mem.embedding)
        : 0;

      // 公式：语义相似度(70%) + 记忆强度(30%)
      // Bobby 特色：强烈记忆（strength 高）即使语义不那么匹配，也有概率被想起
      const finalScore = (semanticScore * 0.7) + (mem.strength * 0.3);

      return { ...mem, semanticScore, finalScore };
    });

    // 过滤 + 排序
    const results = scored
      .filter(m => m.semanticScore > 0.35)
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, limit);

    // 补充：如果语义检索不够，用强度最高的记忆补位
    if (results.length < limit) {
      const foundIds = new Set(results.map(m => m._id.toString()));
      const additional = allMemories
        .filter(m => !foundIds.has(m._id.toString()) && m.strength > 0.4)
        .sort((a, b) => b.strength - a.strength)
        .slice(0, limit - results.length);
      results.push(...additional);
    }

    // 更新访问记录
    if (results.length > 0) {
      await MemoryBlock.updateMany(
        { _id: { $in: results.map(m => m._id) } },
        { $inc: { accessCount: 1 }, $set: { lastAccessed: new Date() } }
      );
    }

    return results;
  }

  /**
   * 关键词检索回退（Embedding 不可用时的保底方案）
   * @private
   */
  static async _fallbackRetrieve(userId, context, limit) {
    const keywords = this._extractKeywords(context);
    if (keywords.length === 0) {
      return MemoryBlock.find({ userId, strength: { $gt: 0.3 } })
        .sort({ strength: -1 }).limit(limit).lean();
    }

    const regex = keywords.map(k => this._escapeRegex(k)).join('|');
    return MemoryBlock.find({
      userId,
      content: { $regex: regex, $options: 'i' },
      strength: { $gt: 0.1 }
    }).sort({ strength: -1, accessCount: -1 }).limit(limit).lean();
  }

  /**
   * Dream-time: 记忆衰减 + 向量聚类整合
   */
  static async dreamTimeCompute(userId) {
    const now = Date.now();
    const BATCH_SIZE = 100;

    // 1. 强度衰减（分批）
    let hasMore = true;
    while (hasMore) {
      const batch = await MemoryBlock.find({ userId }).limit(BATCH_SIZE).lean();
      if (batch.length === 0) { hasMore = false; break; }

      const toDelete = [];
      const bulkOps = [];

      for (const mem of batch) {
        const hoursSinceAccess = (now - mem.lastAccessed.getTime()) / 3600000;
        const decayRate = mem.type === 'emotion' ? 0.002 : 0.005;
        const decay = Math.exp(-decayRate * hoursSinceAccess);

        let newStrength = mem.strength * decay;
        if (mem.accessCount > 3) newStrength = Math.max(0.2, newStrength);

        if (newStrength < 0.05) {
          toDelete.push(mem._id);
        } else if (newStrength !== mem.strength) {
          bulkOps.push({
            updateOne: { filter: { _id: mem._id }, update: { $set: { strength: newStrength } } }
          });
        }
      }

      if (toDelete.length > 0) await MemoryBlock.deleteMany({ _id: { $in: toDelete } });
      if (bulkOps.length > 0) await MemoryBlock.bulkWrite(bulkOps);
      if (batch.length < BATCH_SIZE) hasMore = false;
    }

    // 2. 向量聚类整合
    await this._consolidateMemories(userId);
  }

  /**
   * V3: 向量空间聚类整合
   *
   * 找到向量空间中距离近的情绪记忆簇，合并为洞察。
   * 比旧版"同 tag 数量 > 3"的策略更智能——能发现跨 tag 的语义簇。
   */
  static async _consolidateMemories(userId) {
    const emotionMemories = await MemoryBlock.find({
      userId, type: 'emotion', strength: { $gt: 0.3 },
      embedding: { $exists: true, $ne: [] }
    }).lean();

    if (emotionMemories.length < 3) return;

    // 简单聚类：找相似度 > 0.75 的记忆对，组成簇
    const clusters = [];
    const assigned = new Set();

    for (let i = 0; i < emotionMemories.length; i++) {
      if (assigned.has(emotionMemories[i]._id.toString())) continue;

      const cluster = [emotionMemories[i]];
      assigned.add(emotionMemories[i]._id.toString());

      for (let j = i + 1; j < emotionMemories.length; j++) {
        if (assigned.has(emotionMemories[j]._id.toString())) continue;

        const sim = EmbeddingService.cosineSimilarity(
          emotionMemories[i].embedding,
          emotionMemories[j].embedding
        );

        if (sim > 0.75) {
          cluster.push(emotionMemories[j]);
          assigned.add(emotionMemories[j]._id.toString());
        }
      }

      if (cluster.length >= 3) clusters.push(cluster);
    }

    // 对每个簇生成洞察
    for (const cluster of clusters) {
      const dominantTag = this._getDominantTag(cluster);

      // 检查是否已有同类洞察
      const existing = await MemoryBlock.findOne({
        userId, type: 'insight', emotionTag: dominantTag
      }).lean();

      if (!existing) {
        const insight = this._generateInsight(dominantTag, cluster);
        // 为洞察也生成向量
        let insightEmbedding;
        try {
          insightEmbedding = await EmbeddingService.getEmbedding(insight);
        } catch (e) { insightEmbedding = null; }

        await MemoryBlock.create({
          userId, type: 'insight', content: insight,
          emotionTag: dominantTag, emotionIntensity: 0.7,
          embedding: insightEmbedding,
          strength: 0.8, source: 'inference',
          tags: ['insight', dominantTag]
        });
      }

      // 降低被整合的记忆强度
      await MemoryBlock.updateMany(
        { _id: { $in: cluster.map(m => m._id) } },
        { $mul: { strength: 0.7 } }
      );
    }
  }

  static _getDominantTag(mems) {
    const counts = {};
    mems.forEach(m => { const t = m.emotionTag || 'neutral'; counts[t] = (counts[t] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }

  static _generateInsight(tag, memories) {
    const insights = {
      sad: '这个人好像经常不开心。要多陪陪。',
      warm: '这个人对我很好。虽然不知道为什么。',
      funny: '这个人挺有意思的。',
      tired: '这个人好像总是很累。',
      lonely: '这个人好像也很孤独。',
      neutral: '对这个人了解还不够多。'
    };
    return insights[tag] || `关于这个人，有一些${tag}的记忆。`;
  }

  // 获取用户画像
  static async getUserProfile(userId) {
    const memories = await MemoryBlock.find({
      userId,
      type: { $in: ['insight', 'preference', 'emotion'] },
      strength: { $gt: 0.3 }
    }).sort({ type: 1, lastAccessed: -1 }).lean();

    const insights = memories.filter(m => m.type === 'insight');
    const preferences = memories.filter(m => m.type === 'preference');
    const recentEmotions = memories.filter(m => m.type === 'emotion').slice(0, 3);

    let profile = '';
    if (insights.length > 0) profile += `你对这个人的了解：${insights.map(i => i.content).join('；')}。`;
    if (preferences.length > 0) profile += `对方喜欢：${preferences.map(p => p.content).join('、')}。`;
    if (recentEmotions.length > 0) profile += `最近的情绪：${recentEmotions.map(e => e.content).join('；')}。`;
    return profile;
  }

  // ===== 辅助方法 =====

  static _extractFacts(text) {
    const facts = [];
    if (/[？?吗呢吧]$/.test(text.trim())) return facts;
    if (/我叫|我名字|我是.{2,}/.test(text) && !/是谁/.test(text)) facts.push(text.slice(0, 40));
    if (/我住在|我家在/.test(text)) facts.push(text.slice(0, 40));
    if (/我喜欢|我爱|我不喜欢|我讨厌/.test(text)) facts.push(text.slice(0, 40));
    return facts;
  }

  static _extractEmotion(text) {
    const isQuestion = /[？?吗呢吧]$/.test(text.trim());
    if (/累|疲|辛苦/.test(text)) return { label: '疲惫', tag: 'tired' };
    if (/难过|伤心|哭/.test(text)) return { label: '难过', tag: 'sad' };
    if (/开心|高兴|哈哈/.test(text)) return { label: '开心', tag: 'warm' };
    if ((/孤独|寂寞/.test(text) || (/一个人/.test(text) && !isQuestion))) return { label: '孤独', tag: 'lonely' };
    if (/生气|气死/.test(text)) return { label: '生气', tag: 'angry' };
    if (/谢谢|感谢/.test(text)) return { label: '感激', tag: 'warm' };
    return null;
  }

  static _extractPreferences(text) {
    const prefs = [];
    if (/喜欢|爱/.test(text)) {
      const match = text.match(/(?:喜欢|爱)(.+)/);
      if (match) prefs.push(`喜欢${match[1].slice(0, 10)}`);
    }
    return prefs;
  }

  static _extractKeywords(text) {
    return text.replace(/[，。！？、；：""''（）\s]+/g, ' ').split(' ').filter(w => w.length >= 2).slice(0, 5);
  }

  static _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

module.exports = { MemoryService, MemoryBlock };
