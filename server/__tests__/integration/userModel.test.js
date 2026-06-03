/**
 * User 模型集成测试
 *
 * 使用真实 MongoDB 测试：
 *   - 文档创建与持久化
 *   - 密码哈希
 *   - 好感度系统
 *   - 索引约束
 */

const mongoose = require('mongoose');
const User = require('../../models/User');

describe('User 模型集成测试', () => {

  // ═══════════════════════════════════════════
  // 基础 CRUD
  // ═══════════════════════════════════════════
  describe('基础 CRUD', () => {
    it('创建用户并持久化', async () => {
      const user = await User.create({
        username: 'testuser',
        password: 'password123',
        nickname: '测试用户'
      });

      expect(user._id).toBeDefined();
      expect(user.username).toBe('testuser');
      expect(user.nickname).toBe('测试用户');
    });

    it('从数据库读取用户', async () => {
      await User.create({ username: 'testuser', password: 'password123' });

      const found = await User.findOne({ username: 'testuser' });
      expect(found).toBeTruthy();
      expect(found.username).toBe('testuser');
    });

    it('用户名唯一约束', async () => {
      await User.create({ username: 'testuser', password: 'password123' });

      await expect(
        User.create({ username: 'testuser', password: 'password456' })
      ).rejects.toThrow();
    });

    it('必填字段验证', async () => {
      await expect(User.create({})).rejects.toThrow();
      await expect(User.create({ username: 'test' })).rejects.toThrow(); // 缺 password
      await expect(User.create({ password: '123456' })).rejects.toThrow(); // 缺 username
    });

    it('用户名长度限制', async () => {
      // 太短
      await expect(
        User.create({ username: 'a', password: 'password123' })
      ).rejects.toThrow();

      // 正常长度
      const user = await User.create({ username: 'ab', password: 'password123' });
      expect(user.username).toBe('ab');
    });

    it('删除用户', async () => {
      const user = await User.create({ username: 'testuser', password: 'password123' });
      await User.findByIdAndDelete(user._id);

      const found = await User.findById(user._id);
      expect(found).toBeNull();
    });
  });

  // ═══════════════════════════════════════════
  // 密码安全
  // ═══════════════════════════════════════════
  describe('密码安全', () => {
    it('密码自动哈希', async () => {
      const user = await User.create({ username: 'testuser', password: 'password123' });

      // 数据库中存储的不是明文
      expect(user.password).not.toBe('password123');
      expect(user.password.length).toBeGreaterThan(20); // bcrypt hash 长度
    });

    it('comparePassword 验证正确密码', async () => {
      const user = await User.create({ username: 'testuser', password: 'password123' });

      const isMatch = await user.comparePassword('password123');
      expect(isMatch).toBe(true);
    });

    it('comparePassword 拒绝错误密码', async () => {
      const user = await User.create({ username: 'testuser', password: 'password123' });

      const isMatch = await user.comparePassword('wrongpassword');
      expect(isMatch).toBe(false);
    });

    it('修改非密码字段不重新哈希', async () => {
      const user = await User.create({ username: 'testuser', password: 'password123' });
      const originalHash = user.password;

      user.nickname = '新昵称';
      await user.save();

      // 密码哈希不变
      expect(user.password).toBe(originalHash);
    });
  });

  // ═══════════════════════════════════════════
  // 默认值
  // ═══════════════════════════════════════════
  describe('默认值', () => {
    it('好感度默认 0', async () => {
      const user = await User.create({ username: 'testuser', password: 'password123' });
      expect(user.intimacy).toBe(0);
    });

    it('VIP 默认 free', async () => {
      const user = await User.create({ username: 'testuser', password: 'password123' });
      expect(user.vipLevel).toBe('free');
    });

    it('访问次数默认 0', async () => {
      const user = await User.create({ username: 'testuser', password: 'password123' });
      expect(user.visitCount).toBe(0);
    });

    it('默认有时间戳', async () => {
      const user = await User.create({ username: 'testuser', password: 'password123' });
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();
      expect(user.firstVisit).toBeDefined();
      expect(user.lastVisit).toBeDefined();
    });

    it('默认设置正确', async () => {
      const user = await User.create({ username: 'testuser', password: 'password123' });
      expect(user.settings.notifications).toBe(true);
      expect(user.settings.soundEnabled).toBe(true);
    });
  });

  // ═══════════════════════════════════════════
  // 好感度系统（真实数据库）
  // ═══════════════════════════════════════════
  describe('好感度系统', () => {
    it('getIntimacyLevel 返回正确等级', async () => {
      const user = await User.create({ username: 'testuser', password: 'password123' });
      expect(user.getIntimacyLevel().name).toBe('陌生');

      user.intimacy = 15;
      expect(user.getIntimacyLevel().name).toBe('认识');

      user.intimacy = 30;
      expect(user.getIntimacyLevel().name).toBe('熟悉');

      user.intimacy = 50;
      expect(user.getIntimacyLevel().name).toBe('默契');

      user.intimacy = 80;
      expect(user.getIntimacyLevel().name).toBe('信赖');
    });

    it('addIntimacy 持久化到数据库', async () => {
      const user = await User.create({ username: 'testuser', password: 'password123' });
      user.addIntimacy(5);
      await user.save();

      const reloaded = await User.findById(user._id);
      expect(reloaded.intimacy).toBe(5);
    });

    it('好感度不能超过 100', async () => {
      const user = await User.create({ username: 'testuser', password: 'password123' });
      user.intimacy = 95;
      user.addIntimacy(10);
      await user.save();

      const reloaded = await User.findById(user._id);
      expect(reloaded.intimacy).toBe(100);
    });

    it('addIntimacy 升级返回 true', async () => {
      const user = await User.create({ username: 'testuser', password: 'password123' });
      user.intimacy = 9;
      const upgraded = user.addIntimacy(1);
      expect(upgraded).toBe(true);
      expect(user.getIntimacyLevel().name).toBe('认识');
    });

    it('多次交互累积好感度', async () => {
      const user = await User.create({ username: 'testuser', password: 'password123' });

      // 模拟 10 次聊天
      for (let i = 0; i < 10; i++) {
        user.addIntimacy(1);
      }
      await user.save();

      const reloaded = await User.findById(user._id);
      expect(reloaded.intimacy).toBe(10);
      expect(reloaded.getIntimacyLevel().name).toBe('认识');
    });
  });

  // ═══════════════════════════════════════════
  // 礼物系统
  // ═══════════════════════════════════════════
  describe('礼物系统', () => {
    it('添加礼物记录', async () => {
      const user = await User.create({ username: 'testuser', password: 'password123' });
      user.giftsSent.push({ giftId: 'gift_001' });
      await user.save();

      const reloaded = await User.findById(user._id);
      expect(reloaded.giftsSent.length).toBe(1);
      expect(reloaded.giftsSent[0].giftId).toBe('gift_001');
      expect(reloaded.giftsSent[0].sentAt).toBeDefined();
    });

    it('多条礼物记录', async () => {
      const user = await User.create({ username: 'testuser', password: 'password123' });
      user.giftsSent.push({ giftId: 'gift_001' });
      user.giftsSent.push({ giftId: 'gift_002' });
      user.giftsSent.push({ giftId: 'gift_003' });
      await user.save();

      const reloaded = await User.findById(user._id);
      expect(reloaded.giftsSent.length).toBe(3);
    });
  });
});
