const express = require('express');
const User = require('../models/User');
const Note = require('../models/Note');
const { authMiddleware } = require('../middleware/auth');
const { getTimeLabel } = require('../utils/time');
const router = express.Router();

// 礼物定义（服务端权威版本）
const GIFTS = {
  coffee:   { name: '咖啡', emoji: '☕', type: 'good', effect: '嗯...好像清醒了一点' },
  medicine: { name: '感冒药', emoji: '💊', type: 'good', effect: '鼻子通了，终于' },
  taxi:     { name: '打车券', emoji: '🚕', type: 'good', effect: '到了。不用挤地铁了' },
  book:     { name: '一本书', emoji: '📖', type: 'good', effect: '在看一本新的，还不错' },
  blanket:  { name: '毯子', emoji: '🧸', type: 'good', effect: '暖和了，好困' },
  food:     { name: '宵夜', emoji: '🍜', type: 'good', effect: '饱了。谢谢...不知道该谢谁' },
  luckbox:  { name: '神秘包裹', emoji: '📦', type: 'random', effect: null },
  banana:   { name: '香蕉', emoji: '🍌', type: 'bad', effect: '踩到了。滑了一跤' },
  alarm:    { name: '十个闹钟', emoji: '⏰', type: 'bad', effect: '......谁放的。吵死了' },
  homework: { name: '一套卷子', emoji: '📝', type: 'bad', effect: '......写不完。太多了' },
  rain:     { name: '求雨符', emoji: '🌧️', type: 'bad', effect: '......下雨了。没带伞' },
  rock:     { name: '一块石头', emoji: '🪨', type: 'bad', effect: '......谁放的石头。踢到脚了' }
};

const LUCKBOX_EFFECTS = [
  { status: '捡到钱了。今天运气不错', type: 'good' },
  { status: '收到一张明信片。不知道谁寄的', type: 'good' },
  { status: '打开是空的...', type: 'bad' },
  { status: '里面是一只蟑螂', type: 'bad' },
  { status: '是一颗糖。还不错', type: 'good' }
];

const BAD_LUCK_NOTES = {
  banana: ['出门踩到香蕉皮了。裤子脏了。今天不宜出门。', '鞋底黏黏的...香蕉皮。'],
  alarm: ['不知道谁放了十个闹钟。全部同时响了。差点聋了。', '闹钟响了十个。心脏受不了。'],
  homework: ['桌上多了一套卷子。写到一半放弃了。', '谁给我寄的卷子...写不完。'],
  rain: ['突然下雨了。全身湿透。鞋子里面都是水。', '今天下雨了。没带伞。又。'],
  rock: ['踢到一块石头。脚趾头疼。新鞋也踢坏了。', '地上不知道哪来的石头。踢到了。']
};

// 获取礼物列表
router.get('/', (req, res) => {
  const gifts = Object.entries(GIFTS).map(([id, g]) => ({
    id,
    name: g.name,
    emoji: g.emoji,
    type: g.type
  }));
  res.json({ gifts });
});

// 送礼
router.post('/:giftId', authMiddleware, async (req, res) => {
  try {
    const { giftId } = req.params;
    const gift = GIFTS[giftId];
    if (!gift) return res.status(400).json({ error: '礼物不存在' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    // 记录礼物
    user.giftsSent.push({ giftId, sentAt: new Date() });

    // 好感度
    const intimacyGain = gift.type === 'bad' ? 2 : (gift.type === 'random' ? 3 : 5);
    const upgraded = user.addIntimacy(intimacyGain);
    await user.save();

    // 确定效果
    let statusEffect = gift.effect;
    if (giftId === 'luckbox') {
      const result = LUCKBOX_EFFECTS[Math.floor(Math.random() * LUCKBOX_EFFECTS.length)];
      statusEffect = result.status;
    }

    // 更新 Bobby 状态（礼物效果通过临时覆盖字段显示，不破坏状态机）
    const bobbyEngine = req.app.get('bobbyEngine');
    if (bobbyEngine && bobbyEngine.state) {
      // 设置临时覆盖状态，前端用它显示，但不修改 currentStatus
      bobbyEngine.state.displayOverride = statusEffect;
      bobbyEngine.state.overrideExpiry = new Date(Date.now() + 3 * 60 * 1000); // 3 分钟后过期
      await bobbyEngine.state.save();
      bobbyEngine.broadcastStatus();
      // 3 分钟后清除覆盖
      setTimeout(async () => {
        if (bobbyEngine.state.displayOverride === statusEffect) {
          bobbyEngine.state.displayOverride = null;
          bobbyEngine.state.overrideExpiry = null;
          await bobbyEngine.state.save();
          bobbyEngine.broadcastStatus();
        }
      }, 3 * 60 * 1000);
    }

    // 礼物影响 Bobby 情绪
    if (bobbyEngine && bobbyEngine.emotion) {
      bobbyEngine.emotion.applyGiftEffect(gift.type);
    }

    // 倒霉礼物：生成吐槽动态
    if (gift.type === 'bad' && Math.random() < 0.5) {
      const notes = BAD_LUCK_NOTES[giftId];
      if (notes) {
        const noteText = notes[Math.floor(Math.random() * notes.length)];
        const now = new Date();
        await Note.create({
          content: noteText,
          timeLabel: getTimeLabel(),
          timeDetail: now.getHours().toString().padStart(2, '0') + ':' +
                      now.getMinutes().toString().padStart(2, '0'),
          publishedAt: now,
          bobbyStatus: statusEffect,
          type: 'complaint'
        });
      }
    }

    res.json({
      success: true,
      statusEffect,
      intimacyGain,
      upgraded,
      intimacyLevel: user.getIntimacyLevel()
    });
  } catch (err) {
    res.status(500).json({ error: '送礼失败' });
  }
});

module.exports = router;
