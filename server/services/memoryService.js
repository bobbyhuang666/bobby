/**
 * Bobby 记忆服务
 *
 * 设计来源：
 * - Letta: Memory Blocks + Dream-time Compute + Agent 自主决定记什么忘什么
 * - Mem0: Add-Learn-Retrieve 三步循环
 *
 * 核心理念：Bobby 不是数据库，它像真人一样——
 * 重要的事会记住，不重要的事会模糊，时间久了会忘记细节但留下感觉。
 */

const mongoose = require('mongoose');

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

  // 情绪关联（记忆带有情绪色彩）
  emotionTag: { type: String },  // 'warm', 'sad', 'funny', 'neutral'
  emotionIntensity: { type: Number, default: 0.5, min: 0, max: 1 },

  // 记忆强度（会随时间衰减）
  strength: { type: Number, default: 1.0, min: 0, max: 1 },

  // 访问计数（被想起的次数越多，越不容易忘记）
  accessCount: { type: Number, default: 0 },

  // 最后被想起的时间
  lastAccessed: { type: Date, default: Date.now },

  // 来源
  source: { type: String, enum: ['conversation', 'gift', 'note', 'inference'], default: 'conversation' },

  // 标签（用于检索）
  tags: [String]
}, { timestamps: true });

memoryBlockSchema.index({ userId: 1, type: 1, strength: -1 });

const MemoryBlock = mongoose.model('MemoryBlock', memoryBlockSchema);

// ===== 记忆服务 =====
class MemoryService {

  // 添加记忆（Add）
  static async addMemory(userId, { type, content, emotionTag, source, tags }) {
    // 检查是否已有相似记忆（避免重复）
    // 策略：双向前缀匹配 + 显著前缀匹配
    // - 显著前缀匹配：跳过"用户说："等前缀词，取有意义部分做前缀匹配
    // - 双向匹配：新内容是旧内容的前缀 OR 旧内容是新内容的前缀
    const significantContent = this._getSignificantPrefix(content, 16);
    const escapedPrefix = this._escapeRegex(significantContent);

    const existing = await MemoryBlock.findOne({
      userId,
      $or: [
        // 策略1：显著前缀匹配（跳过常见前缀词后的核心内容）
        { content: { $regex: `^${escapedPrefix}`, $options: 'i' } },
        // 策略2：已存储内容是新内容的前缀（旧内容更短，新内容更具体）
        // 例：已有"我住在厦门"，新增"我住在厦门集美" → 匹配
        { content: { $regex: `^${this._escapeRegex(content)}.*`, $options: 'i' } },
        // 策略3：新内容是已存储内容的前缀（新内容更短，旧内容更具体）
        // 例：已有"我住在厦门集美"，新增"我住在厦门" → 匹配
        { content: { $regex: `^${this._escapeRegex(content)}`, $options: 'i' } }
      ]
    });

    if (existing) {
      // 已有相似记忆，强化它
      existing.strength = Math.min(1, existing.strength + 0.2);
      existing.accessCount += 1;
      existing.lastAccessed = new Date();
      await existing.save();
      return existing;
    }

    return MemoryBlock.create({
      userId,
      type,
      content,
      emotionTag: emotionTag || 'neutral',
      emotionIntensity: 0.5,
      strength: 1.0,
      accessCount: 1,
      source: source || 'conversation',
      tags: tags || []
    });
  }

  // 学习：从对话中提取记忆（Learn）
  // 只从用户消息中提取事实和偏好，避免 Bobby 自己的话被误记为用户信息
  static async learnFromConversation(userId, userText, bobbyReply) {
    // 事实提取（仅从用户消息）
    const facts = this._extractFacts(userText);
    for (const fact of facts) {
      await this.addMemory(userId, {
        type: 'fact',
        content: `用户说：${fact}`,
        source: 'conversation',
        tags: ['fact', 'user']
      });
    }

    // 情绪提取（用户的情绪状态）
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

    // 偏好提取（仅从用户消息）
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

  // 检索：找到相关的记忆（Retrieve）
  static async retrieve(userId, context = '', limit = 5) {
    // 先尝试基于关键词匹配
    const keywords = this._extractKeywords(context);

    let memories = [];

    if (keywords.length > 0) {
      const regex = keywords.map(k => this._escapeRegex(k)).join('|');
      memories = await MemoryBlock.find({
        userId,
        content: { $regex: regex, $options: 'i' },
        strength: { $gt: 0.1 }
      })
        .sort({ strength: -1, accessCount: -1 })
        .limit(limit)
        .lean();
    }

    // 如果关键词匹配不够，补充最近的强记忆
    if (memories.length < limit) {
      const existingIds = memories.map(m => m._id);
      const additional = await MemoryBlock.find({
        userId,
        _id: { $nin: existingIds },
        strength: { $gt: 0.3 }
      })
        .sort({ strength: -1, lastAccessed: -1 })
        .limit(limit - memories.length)
        .lean();
      memories = memories.concat(additional);
    }

    // 更新访问记录
    if (memories.length > 0) {
      await MemoryBlock.updateMany(
        { _id: { $in: memories.map(m => m._id) } },
        { $inc: { accessCount: 1 }, $set: { lastAccessed: new Date() } }
      );
    }

    return memories;
  }

  // Dream-time: 记忆衰减 + 整合（分批处理，避免内存溢出）
  static async dreamTimeCompute(userId) {
    const now = Date.now();
    const BATCH_SIZE = 100;

    // 1. 强度衰减：分批处理，避免全量加载到内存
    let hasMore = true;
    while (hasMore) {
      const batch = await MemoryBlock.find({ userId })
        .limit(BATCH_SIZE)
        .lean();

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      const toDelete = [];
      const bulkOps = [];

      for (const mem of batch) {
        const hoursSinceAccess = (now - mem.lastAccessed.getTime()) / 3600000;
        const decayRate = mem.type === 'emotion' ? 0.002 : 0.005;
        const decay = Math.exp(-decayRate * hoursSinceAccess);

        let newStrength = mem.strength * decay;

        // 被多次访问的记忆有"最低保障"
        if (mem.accessCount > 3) {
          newStrength = Math.max(0.2, newStrength);
        }

        // 强度太低的记忆删除（真正忘记了）
        if (newStrength < 0.05) {
          toDelete.push(mem._id);
        } else if (newStrength !== mem.strength) {
          bulkOps.push({
            updateOne: {
              filter: { _id: mem._id },
              update: { $set: { strength: newStrength } }
            }
          });
        }
      }

      // 批量执行
      if (toDelete.length > 0) {
        await MemoryBlock.deleteMany({ _id: { $in: toDelete } });
      }
      if (bulkOps.length > 0) {
        await MemoryBlock.bulkWrite(bulkOps);
      }

      if (batch.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    // 2. 记忆整合：将相关的短期记忆合并为长期洞察
    await this._consolidateMemories(userId);
  }

  // 整合相关记忆为洞察（批量操作）
  static async _consolidateMemories(userId) {
    // 找到同一类型、同一标签的多个记忆
    const emotionMemories = await MemoryBlock.find({
      userId,
      type: 'emotion',
      strength: { $gt: 0.3 }
    }).lean();

    // 如果同一情绪标签的记忆超过3条，整合为一条洞察
    const tagCounts = {};
    emotionMemories.forEach(m => {
      const tag = m.emotionTag || 'neutral';
      if (!tagCounts[tag]) tagCounts[tag] = [];
      tagCounts[tag].push(m);
    });

    for (const [tag, mems] of Object.entries(tagCounts)) {
      if (mems.length >= 3) {
        // 检查是否已有类似洞察
        const existing = await MemoryBlock.findOne({
          userId,
          type: 'insight',
          emotionTag: tag
        }).lean();

        if (!existing) {
          // 生成洞察
          const insight = this._generateInsight(tag, mems);
          await MemoryBlock.create({
            userId,
            type: 'insight',
            content: insight,
            emotionTag: tag,
            emotionIntensity: 0.7,
            strength: 0.8,
            source: 'inference',
            tags: ['insight', tag]
          });
        }

        // 降低被整合的原始记忆强度（批量更新）
        await MemoryBlock.updateMany(
          { _id: { $in: mems.map(m => m._id) } },
          { $mul: { strength: 0.7 } }
        );
      }
    }
  }

  // 生成洞察
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

  // 获取用户画像（用于 prompt 注入）— 合并为单次查询
  static async getUserProfile(userId) {
    // 一次查询获取所有需要的记忆类型
    const memories = await MemoryBlock.find({
      userId,
      type: { $in: ['insight', 'preference', 'emotion'] },
      strength: { $gt: 0.3 }
    })
      .sort({ type: 1, lastAccessed: -1 })
      .lean();

    const insights = memories.filter(m => m.type === 'insight');
    const preferences = memories.filter(m => m.type === 'preference');
    const recentEmotions = memories.filter(m => m.type === 'emotion').slice(0, 3);

    let profile = '';

    if (insights.length > 0) {
      profile += `你对这个人的了解：${insights.map(i => i.content).join('；')}。`;
    }

    if (preferences.length > 0) {
      profile += `对方喜欢：${preferences.map(p => p.content).join('、')}。`;
    }

    if (recentEmotions.length > 0) {
      profile += `最近的情绪：${recentEmotions.map(e => e.content).join('；')}。`;
    }

    return profile;
  }

  // ===== 辅助方法 =====

  static _extractFacts(text) {
    const facts = [];
    // 排除问句
    if (/[？?吗呢吧]$/.test(text.trim())) return facts;

    // 简单的事实提取规则（只提取陈述句）
    if (/我叫|我名字|我是.{2,}/.test(text) && !/是谁/.test(text)) {
      facts.push(text.slice(0, 40));
    }
    if (/我住在|我家在/.test(text)) {
      facts.push(text.slice(0, 40));
    }
    if (/我喜欢|我爱|我不喜欢|我讨厌/.test(text)) {
      facts.push(text.slice(0, 40));
    }
    return facts;
  }

  static _extractEmotion(text) {
    // 问句不检测情绪
    const isQuestion = /[？?吗呢吧]$/.test(text.trim());

    if (/累|疲|辛苦/.test(text)) return { label: '疲惫', tag: 'tired' };
    if (/难过|伤心|哭/.test(text)) return { label: '难过', tag: 'sad' };
    if (/开心|高兴|哈哈/.test(text)) return { label: '开心', tag: 'warm' };
    // "一个人"只有在非问句中才算孤独
    if ((/孤独|寂寞/.test(text) || (/一个人/.test(text) && !isQuestion))) {
      return { label: '孤独', tag: 'lonely' };
    }
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
    // 去掉常见停用词，提取关键词
    return text
      .replace(/[，。！？、；：""''（）\s]+/g, ' ')
      .split(' ')
      .filter(w => w.length >= 2)
      .slice(0, 5);
  }

  static _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 提取内容的显著前缀（跳过常见前缀词如"用户说："、"对方"等）
   * @param {string} content - 原始内容
   * @param {number} minLength - 最小返回长度（字符数）
   * @returns {string} 显著前缀
   */
  static _getSignificantPrefix(content, minLength = 12) {
    // 去掉常见记忆前缀词，提取有意义的部分
    const stripped = content.replace(/^(用户说：|对方|这个人)/, '');
    // 取显著部分的前 minLength 个字符，但至少保留原内容前 minLength 个字符
    const prefix = stripped.length >= minLength ? stripped.slice(0, minLength) : content.slice(0, minLength);
    // 限制正则输入长度，防止 ReDoS
    return prefix.slice(0, 50);
  }
}

module.exports = { MemoryService, MemoryBlock };
