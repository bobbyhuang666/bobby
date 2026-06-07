const express = require('express');
const User = require('../models/User');
const Note = require('../models/Note');
const { authMiddleware } = require('../middleware/auth');
const { getTimeLabel } = require('../utils/time');
const { GiftSystem } = require('../modules/gifts');
const router = express.Router();

// 追踪礼物效果的定时器（清除旧的，防止多个定时器同时修改状态）
let giftClearTimer = null;

// 获取礼物列表
router.get('/', (req, res) => {
  res.json({ gifts: GiftSystem.getGiftList() });
});

// 送礼
router.post('/:giftId', authMiddleware, async (req, res) => {
  try {
    const { giftId } = req.params;
    const result = GiftSystem.processGift(giftId);
    if (!result) return res.status(400).json({ error: '礼物不存在' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    // 记录礼物 + 好感度
    user.giftsSent.push({ giftId, sentAt: new Date() });
    const upgraded = user.addIntimacy(result.intimacyGain);
    await user.save();

    // 状态覆盖（前端临时显示效果）
    const statusEffect = result.effect.status;
    const bobbyEngine = req.app.get('bobbyEngine');
    if (bobbyEngine && bobbyEngine.state) {
      bobbyEngine.state.displayOverride = statusEffect;
      bobbyEngine.state.overrideExpiry = new Date(Date.now() + 3 * 60 * 1000);
      await bobbyEngine.state.save();
      bobbyEngine.broadcastStatus();

      if (giftClearTimer) {
        clearTimeout(giftClearTimer);
        giftClearTimer = null;
      }
      giftClearTimer = setTimeout(async () => {
        giftClearTimer = null;
        const BobbyState = require('../models/BobbyState');
        const cleared = await BobbyState.findOneAndUpdate(
          { _singleton: 'bobby', displayOverride: statusEffect },
          { $set: { displayOverride: null, overrideExpiry: null } },
          { new: true }
        );
        if (cleared) bobbyEngine.broadcastStatus();
      }, 3 * 60 * 1000);
    }

    // 情绪影响
    if (bobbyEngine && bobbyEngine.emotion) {
      bobbyEngine.emotion.applyGiftEffect(result.gift.type);
    }

    // 倒霉礼物：生成吐槽动态
    if (result.badLuckNote) {
      const now = new Date();
      await Note.create({
        content: result.badLuckNote,
        timeLabel: getTimeLabel(),
        timeDetail: now.getHours().toString().padStart(2, '0') + ':' +
                    now.getMinutes().toString().padStart(2, '0'),
        publishedAt: now,
        bobbyStatus: statusEffect,
        type: 'complaint',
      });
    }

    res.json({
      success: true,
      statusEffect,
      intimacyGain: result.intimacyGain,
      upgraded,
      intimacyLevel: user.getIntimacyLevel(),
    });
  } catch (err) {
    res.status(500).json({ error: '送礼失败' });
  }
});

module.exports = router;
