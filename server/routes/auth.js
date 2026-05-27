const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

// 注册
router.post('/register', async (req, res) => {
  try {
    const { username, password, nickname } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(400).json({ error: '用户名已存在' });
    }

    const user = await User.create({
      username,
      password,
      nickname: nickname || username,
      firstVisit: new Date(),
      visitCount: 1
    });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        nickname: user.nickname,
        intimacy: user.intimacy,
        vipLevel: user.vipLevel
      }
    });
  } catch (err) {
    res.status(500).json({ error: '注册失败' });
  }
});

// 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 更新访问次数
    user.visitCount += 1;
    user.lastVisit = new Date();
    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        nickname: user.nickname,
        intimacy: user.intimacy,
        vipLevel: user.vipLevel,
        visitCount: user.visitCount,
        mood: user.mood
      }
    });
  } catch (err) {
    res.status(500).json({ error: '登录失败' });
  }
});

module.exports = router;
