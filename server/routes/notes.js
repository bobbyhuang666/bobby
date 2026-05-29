const express = require('express');
const mongoose = require('mongoose');
const Note = require('../models/Note');
const User = require('../models/User');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const router = express.Router();

// ObjectId 格式校验中间件
function validateObjectId(paramName) {
  return (req, res, next) => {
    if (!mongoose.Types.ObjectId.isValid(req.params[paramName])) {
      return res.status(400).json({ error: '无效的ID格式' });
    }
    next();
  };
}

// 获取动态列表
router.get('/', optionalAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;

    const notes = await Note.find()
      .sort({ publishedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // 如果用户已登录，标记哪些已点赞
    if (req.userId) {
      notes.forEach(note => {
        note.isLiked = note.likedBy?.some(id => id.toString() === req.userId) || false;
      });
    }

    const total = await Note.countDocuments();

    res.json({ notes, total, page, hasMore: skip + notes.length < total });
  } catch (err) {
    res.status(500).json({ error: '获取动态失败' });
  }
});

// 点赞/取消点赞
router.post('/:id/like', authMiddleware, validateObjectId('id'), async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ error: '动态不存在' });

    const userIdStr = req.userId.toString();
    const isLiked = note.likedBy.some(id => id.toString() === userIdStr);

    if (isLiked) {
      note.likedBy.pull(req.userId);
      note.likes = Math.max(0, note.likes - 1);
    } else {
      note.likedBy.push(req.userId);
      note.likes += 1;

      // 点赞加好感度
      const user = await User.findById(req.userId);
      if (user) {
        user.addIntimacy(2);
        await user.save();
      }
    }

    await note.save();

    res.json({ likes: note.likes, isLiked: !isLiked });
  } catch (err) {
    res.status(500).json({ error: '点赞失败' });
  }
});

// 评论动态
router.post('/:id/comment', authMiddleware, validateObjectId('id'), async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: '评论不能为空' });
    }

    if (content.length > 300) {
      return res.status(400).json({ error: '评论太长了，最多300字' });
    }

    const bobbyEngine = req.app.get('bobbyEngine');
    const result = await bobbyEngine.handleComment(req.userId, req.params.id, content.trim());

    res.json({
      userComment: content.trim(),
      bobbyReply: result?.bobbyReply || null
    });
  } catch (err) {
    res.status(500).json({ error: '评论失败' });
  }
});

module.exports = router;
