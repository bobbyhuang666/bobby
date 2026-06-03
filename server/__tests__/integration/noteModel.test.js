/**
 * Note 模型集成测试
 *
 * 使用真实 MongoDB 测试：
 *   - 动态创建
 *   - 评论系统
 *   - 点赞系统
 */

const mongoose = require('mongoose');
const Note = require('../../models/Note');
const User = require('../../models/User');

describe('Note 模型集成测试', () => {

  // ═══════════════════════════════════════════
  // 基础 CRUD
  // ═══════════════════════════════════════════
  describe('基础 CRUD', () => {
    it('创建动态', async () => {
      const note = await Note.create({
        content: '今天天气不错',
        timeLabel: '下午',
        timeDetail: '15:30',
        type: 'daily'
      });

      expect(note._id).toBeDefined();
      expect(note.content).toBe('今天天气不错');
      expect(note.timeLabel).toBe('下午');
    });

    it('默认值正确', async () => {
      const note = await Note.create({ content: '测试' });

      expect(note.likes).toBe(0);
      expect(note.comments.length).toBe(0);
      expect(note.type).toBe('daily');
      expect(note.publishedAt).toBeDefined();
    });

    it('按发布时间倒序查询', async () => {
      await Note.create({ content: '第一条', publishedAt: new Date('2026-01-01') });
      await Note.create({ content: '第二条', publishedAt: new Date('2026-06-01') });

      const notes = await Note.find().sort({ publishedAt: -1 });
      expect(notes[0].content).toBe('第二条');
      expect(notes[1].content).toBe('第一条');
    });
  });

  // ═══════════════════════════════════════════
  // 评论系统
  // ═══════════════════════════════════════════
  describe('评论系统', () => {
    it('添加用户评论', async () => {
      const user = await User.create({ username: 'testuser', password: 'password123' });
      const note = await Note.create({ content: '测试动态' });

      note.comments.push({ userId: user._id, content: '好看', isBobby: false });
      await note.save();

      const reloaded = await Note.findById(note._id);
      expect(reloaded.comments.length).toBe(1);
      expect(reloaded.comments[0].content).toBe('好看');
      expect(reloaded.comments[0].isBobby).toBe(false);
    });

    it('添加 Bobby 评论', async () => {
      const note = await Note.create({ content: '测试动态' });

      note.comments.push({ content: '谢谢', isBobby: true });
      await note.save();

      const reloaded = await Note.findById(note._id);
      expect(reloaded.comments.length).toBe(1);
      expect(reloaded.comments[0].isBobby).toBe(true);
    });

    it('多条评论', async () => {
      const user = await User.create({ username: 'testuser', password: 'password123' });
      const note = await Note.create({ content: '测试动态' });

      note.comments.push({ userId: user._id, content: '好看', isBobby: false });
      note.comments.push({ content: '谢谢', isBobby: true });
      note.comments.push({ userId: user._id, content: '哈哈', isBobby: false });
      await note.save();

      const reloaded = await Note.findById(note._id);
      expect(reloaded.comments.length).toBe(3);
    });
  });

  // ═══════════════════════════════════════════
  // 点赞系统
  // ═══════════════════════════════════════════
  describe('点赞系统', () => {
    it('点赞增加计数', async () => {
      const user = await User.create({ username: 'testuser', password: 'password123' });
      const note = await Note.create({ content: '测试动态' });

      note.likes += 1;
      note.likedBy.push(user._id);
      await note.save();

      const reloaded = await Note.findById(note._id);
      expect(reloaded.likes).toBe(1);
      expect(reloaded.likedBy.length).toBe(1);
    });

    it('防重复点赞', async () => {
      const user = await User.create({ username: 'testuser', password: 'password123' });
      const note = await Note.create({ content: '测试动态' });

      // 先点赞
      note.likes += 1;
      note.likedBy.push(user._id);
      await note.save();

      // 检查是否已点赞
      const reloaded = await Note.findById(note._id);
      const alreadyLiked = reloaded.likedBy.some(id => id.equals(user._id));
      expect(alreadyLiked).toBe(true);
    });

    it('多人点赞', async () => {
      const user1 = await User.create({ username: 'user1', password: 'password123' });
      const user2 = await User.create({ username: 'user2', password: 'password123' });
      const note = await Note.create({ content: '测试动态' });

      note.likes += 2;
      note.likedBy.push(user1._id, user2._id);
      await note.save();

      const reloaded = await Note.findById(note._id);
      expect(reloaded.likes).toBe(2);
      expect(reloaded.likedBy.length).toBe(2);
    });
  });

  // ═══════════════════════════════════════════
  // 类型
  // ═══════════════════════════════════════════
  describe('动态类型', () => {
    it('支持所有类型', async () => {
      const types = ['daily', 'complaint', 'giftReaction', 'milestone'];
      for (const type of types) {
        const note = await Note.create({ content: `类型: ${type}`, type });
        expect(note.type).toBe(type);
      }
    });

    it('默认类型 daily', async () => {
      const note = await Note.create({ content: '测试' });
      expect(note.type).toBe('daily');
    });
  });
});
