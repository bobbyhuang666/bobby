const express = require('express');
const User = require('../models/User');
const Message = require('../models/Message');
const BobbyState = require('../models/BobbyState');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// 获取用户信息
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    const messageCount = await Message.countDocuments({ userId: req.userId });
    const bobbyState = await BobbyState.findOne({ _singleton: 'bobby' }).lean();

    const days = Math.max(1,
      Math.floor((Date.now() - new Date(user.firstVisit).getTime()) / 86400000) + 1
    );

    res.json({
      user: {
        id: user._id,
        username: user.username,
        nickname: user.nickname,
        intimacy: user.intimacy,
        intimacyLevel: user.getIntimacyLevel(),
        vipLevel: user.vipLevel,
        visitCount: user.visitCount,
        days,
        messageCount,
        mood: user.mood,
        giftsSentCount: (user.giftsSent || []).length
      },
      bobby: {
        status: bobbyState?.currentStatus || '还没睡呢',
        statusChangedAt: bobbyState?.statusChangedAt
      }
    });
  } catch (err) {
    res.status(500).json({ error: '获取信息失败' });
  }
});

// 更新用户设置
router.put('/settings', authMiddleware, async (req, res) => {
  try {
    const { nickname, notifications, soundEnabled } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    if (nickname !== undefined) user.nickname = nickname;
    if (notifications !== undefined) user.settings.notifications = notifications;
    if (soundEnabled !== undefined) user.settings.soundEnabled = soundEnabled;

    await user.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: '更新失败' });
  }
});

module.exports = router;
