/**
 * Message 模型集成测试
 *
 * 使用真实 MongoDB 测试：
 *   - 消息创建
 *   - 消息类型
 *   - 查询与排序
 */

const mongoose = require('mongoose');
const Message = require('../../models/Message');
const User = require('../../models/User');

describe('Message 模型集成测试', () => {
  let user;

  beforeEach(async () => {
    user = await User.create({ username: 'testuser', password: 'password123' });
  });

  // ═══════════════════════════════════════════
  // 基础 CRUD
  // ═══════════════════════════════════════════
  describe('基础 CRUD', () => {
    it('创建用户消息', async () => {
      const msg = await Message.create({
        userId: user._id,
        role: 'user',
        content: '你好'
      });

      expect(msg._id).toBeDefined();
      expect(msg.role).toBe('user');
      expect(msg.content).toBe('你好');
    });

    it('创建助手消息', async () => {
      const msg = await Message.create({
        userId: user._id,
        role: 'assistant',
        content: '嗯'
      });

      expect(msg.role).toBe('assistant');
    });

    it('默认类型为 text', async () => {
      const msg = await Message.create({
        userId: user._id,
        role: 'user',
        content: '你好'
      });

      expect(msg.type).toBe('text');
    });

    it('必填字段验证', async () => {
      await expect(Message.create({})).rejects.toThrow();
      await expect(Message.create({ userId: user._id })).rejects.toThrow(); // 缺 role
    });
  });

  // ═══════════════════════════════════════════
  // 消息类型
  // ═══════════════════════════════════════════
  describe('消息类型', () => {
    it('支持 text 类型', async () => {
      const msg = await Message.create({
        userId: user._id, role: 'user', content: '你好', type: 'text'
      });
      expect(msg.type).toBe('text');
    });

    it('支持 photo 类型', async () => {
      const msg = await Message.create({
        userId: user._id, role: 'assistant', content: '照片',
        type: 'photo', photo: { scene: '🌅', caption: '窗外' }
      });
      expect(msg.type).toBe('photo');
      expect(msg.photo.scene).toBe('🌅');
    });

    it('支持 voice 类型', async () => {
      const msg = await Message.create({
        userId: user._id, role: 'assistant', content: '语音',
        type: 'voice', voice: { duration: 3 }
      });
      expect(msg.type).toBe('voice');
      expect(msg.voice.duration).toBe(3);
    });

    it('支持 thought 类型', async () => {
      const msg = await Message.create({
        userId: user._id, role: 'assistant', content: '在想什么',
        type: 'thought'
      });
      expect(msg.type).toBe('thought');
    });
  });

  // ═══════════════════════════════════════════
  // 查询与排序
  // ═══════════════════════════════════════════
  describe('查询与排序', () => {
    it('按用户查询', async () => {
      const user2 = await User.create({ username: 'user2', password: 'password123' });

      await Message.create({ userId: user._id, role: 'user', content: '消息1' });
      await Message.create({ userId: user._id, role: 'assistant', content: '回复1' });
      await Message.create({ userId: user2._id, role: 'user', content: '消息2' });

      const user1Messages = await Message.find({ userId: user._id });
      expect(user1Messages.length).toBe(2);

      const user2Messages = await Message.find({ userId: user2._id });
      expect(user2Messages.length).toBe(1);
    });

    it('按时间倒序查询', async () => {
      // 使用显式时间戳确保顺序（快速创建可能同 ms）
      await Message.create({ userId: user._id, role: 'user', content: '第一条', createdAt: new Date('2026-06-01T10:00:00Z') });
      await Message.create({ userId: user._id, role: 'assistant', content: '第二条', createdAt: new Date('2026-06-01T10:01:00Z') });

      const messages = await Message.find({ userId: user._id }).sort({ createdAt: -1 });
      expect(messages[0].content).toBe('第二条');
    });

    it('limit 限制数量', async () => {
      for (let i = 0; i < 10; i++) {
        await Message.create({ userId: user._id, role: 'user', content: `消息${i}` });
      }

      const messages = await Message.find({ userId: user._id }).sort({ createdAt: -1 }).limit(5);
      expect(messages.length).toBe(5);
    });

    it('batchId 查询', async () => {
      await Message.create({ userId: user._id, role: 'user', content: '消息', batchId: 'batch_1' });
      await Message.create({ userId: user._id, role: 'assistant', content: '回复', batchId: 'batch_1' });
      await Message.create({ userId: user._id, role: 'user', content: '消息2', batchId: 'batch_2' });

      const batch1 = await Message.find({ batchId: 'batch_1' });
      expect(batch1.length).toBe(2);
    });
  });

  // ═══════════════════════════════════════════
  // 已读状态
  // ═══════════════════════════════════════════
  describe('已读状态', () => {
    it('默认未读', async () => {
      const msg = await Message.create({
        userId: user._id, role: 'assistant', content: '嗯'
      });
      expect(msg.isRead).toBe(false);
      expect(msg.readAt).toBeUndefined();
    });

    it('标记已读', async () => {
      const msg = await Message.create({
        userId: user._id, role: 'assistant', content: '嗯'
      });

      msg.isRead = true;
      msg.readAt = new Date();
      await msg.save();

      const reloaded = await Message.findById(msg._id);
      expect(reloaded.isRead).toBe(true);
      expect(reloaded.readAt).toBeDefined();
    });
  });
});
