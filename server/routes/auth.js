const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

// 游客登录（无需注册，自动生成账号）
router.post('/guest', async (req, res) => {
  try {
    // 生成随机游客名（username 限制 2-20 字符，password 限制 6+ 字符）
    const rand = Math.random().toString(36).slice(2, 8);
    const guestId = `guest_${Date.now().toString(36).slice(-6)}_${rand}`;
    const user = await User.create({
      username: guestId,
      password: `guest_pw_${rand}_${Date.now()}`,
      nickname: '路过的人',
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
    console.error('游客登录失败:', err.message);
    res.status(500).json({ error: '游客登录失败' });
  }
});

// 注册
router.post('/register', async (req, res) => {
  try {
    const { username, password, nickname } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    if (username.length > 30 || password.length > 100) {
      return res.status(400).json({ error: '输入过长' });
    }
    if (nickname && nickname.length > 30) {
      return res.status(400).json({ error: '昵称最长30个字' });
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
