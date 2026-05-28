const express = require('express');
const Message = require('../models/Message');
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
const aiService = require('../services/aiService');
const { sanitizeInput, isOutOfCharacter, getConfusedReply } = require('../services/securityFilter');
const router = express.Router();

// 获取聊天历史
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const before = req.query.before; // 用于分页

    const query = { userId: req.userId };
    if (before) {
      const beforeDate = new Date(before);
      if (isNaN(beforeDate.getTime())) {
        return res.status(400).json({ error: '日期格式无效' });
      }
      query.createdAt = { $lt: beforeDate };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ messages: messages.reverse() });
  } catch (err) {
    res.status(500).json({ error: '获取历史失败' });
  }
});

// 发送消息（REST 方式，也支持 WebSocket）
router.post('/send', authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: '消息不能为空' });
    }

    if (text.length > 500) {
      return res.status(400).json({ error: '消息太长了，最多500字' });
    }

    const cleanText = text.trim();

    // ===== 第1层：输入过滤 =====
    const sanitized = sanitizeInput(cleanText);
    if (sanitized === null) {
      // 纯注入内容，不调用 AI，直接返回 Bobby 困惑回复
      return res.json({
        reply: {
          id: `safe_${Date.now()}`,
          content: getConfusedReply(),
          type: 'text',
          createdAt: new Date().toISOString()
        }
      });
    }

    const bobbyEngine = req.app.get('bobbyEngine');
    const result = await bobbyEngine.handleMessage(req.userId, sanitized);

    if (!result) {
      return res.status(500).json({ error: '处理消息失败' });
    }

    // ===== 第3层：输出过滤 =====
    let replyContent = result.reply.content;
    if (isOutOfCharacter(replyContent)) {
      // AI 跳出角色了，替换为困惑回复
      const originalContent = replyContent;
      replyContent = getConfusedReply();
      console.warn(`[安全过滤] 输出违规，已替换。原始内容: ${originalContent.slice(0, 50)}`);
    }

    res.json({
      reply: {
        id: result.reply._id,
        content: replyContent,
        type: result.reply.type,
        createdAt: result.reply.createdAt
      },
      intimacyLevel: result.intimacyLevel,
      upgraded: result.upgraded
    });
  } catch (err) {
    console.error('发送消息失败:', err);
    res.status(500).json({ error: '发送失败' });
  }
});

// 评论回复代理（前端动态评论走后端生成，不暴露 API key）
router.post('/comment-reply', authMiddleware, async (req, res) => {
  try {
    const { noteText, userComment } = req.body;
    if (!noteText || !userComment) {
      return res.status(400).json({ error: '参数不完整' });
    }
    if (noteText.length > 500) {
      return res.status(400).json({ error: '动态内容过长' });
    }
    if (userComment.length > 300) {
      return res.status(400).json({ error: '评论太长了' });
    }

    // ===== 第1层：输入过滤 =====
    const sanitized = sanitizeInput(userComment);
    if (sanitized === null) {
      return res.json({ reply: getConfusedReply() });
    }

    const user = await User.findById(req.userId);
    const intimacyLevel = user ? user.getIntimacyLevel().name : '陌生';

    let reply = await aiService.generateCommentReply(noteText, sanitized, intimacyLevel);

    // ===== 第3层：输出过滤 =====
    if (isOutOfCharacter(reply)) {
      reply = getConfusedReply();
    }

    res.json({ reply });
  } catch (err) {
    console.error('评论回复失败:', err);
    res.status(500).json({ error: '回复生成失败' });
  }
});

// 标记消息已读
router.post('/read', authMiddleware, async (req, res) => {
  try {
    const { messageIds } = req.body;
    if (!messageIds || !Array.isArray(messageIds)) {
      return res.status(400).json({ error: '参数错误' });
    }

    await Message.updateMany(
      { _id: { $in: messageIds }, userId: req.userId, role: 'assistant' },
      { $set: { isRead: true, readAt: new Date() } }
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '标记已读失败' });
  }
});

module.exports = router;
