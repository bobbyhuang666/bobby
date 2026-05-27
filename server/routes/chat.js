const express = require('express');
const Message = require('../models/Message');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// 获取聊天历史
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const before = req.query.before; // 用于分页

    const query = { userId: req.userId };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
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

    const bobbyEngine = req.app.get('bobbyEngine');
    const result = await bobbyEngine.handleMessage(req.userId, text.trim());

    if (!result) {
      return res.status(500).json({ error: '处理消息失败' });
    }

    res.json({
      reply: {
        id: result.reply._id,
        content: result.reply.content,
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
