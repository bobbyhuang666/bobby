/**
 * Bobby 引擎集成测试
 *
 * 使用真实 MongoDB 测试完整数据流：
 *   - init → 状态恢复
 *   - handleMessage → 消息存储 + 情绪更新 + 好感度 + 记忆学习
 *   - handleComment → 评论 + 好感度 + 回复概率
 *   - 状态持久化
 */

// Mock AI 服务（不调用真实 API）
jest.mock('../../services/aiService', () => ({
  generateReply: jest.fn().mockResolvedValue('嗯'),
  generateCommentReply: jest.fn().mockResolvedValue('谢谢'),
  generateReflection: jest.fn().mockResolvedValue('深夜碎片'),
  generateInnerThought: jest.fn().mockResolvedValue('内心独白'),
  callDeepSeek: jest.fn().mockResolvedValue('嗯'),
}));

// Mock 天气服务
jest.mock('../../services/weatherService', () => ({
  getWeatherContext: jest.fn().mockResolvedValue('晴天，26°C'),
}));

// Mock BobbyMemory
jest.mock('../../services/bobbyMemory', () => ({
  BobbyMemoryService: {
    retrieve: jest.fn().mockResolvedValue([]),
  },
}));

// Mock WorldEngine
jest.mock('../../services/worldEngine', () => ({
  WorldEngine: {
    getUnusedEvents: jest.fn().mockResolvedValue([]),
  },
}));

const mongoose = require('mongoose');
const BobbyEngine = require('../../services/bobbyEngine');
const User = require('../../models/User');
const Message = require('../../models/Message');
const BobbyState = require('../../models/BobbyState');
const Note = require('../../models/Note');

describe('Bobby 引擎集成测试', () => {
  let engine;
  let mockIo;

  beforeEach(() => {
    mockIo = {
      emit: jest.fn(),
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    };
    engine = new BobbyEngine(mockIo);
  });

  // ═══════════════════════════════════════════
  // 初始化
  // ═══════════════════════════════════════════
  describe('初始化 (init)', () => {
    it('首次启动创建 BobbyState 单例', async () => {
      await engine.init();

      expect(engine.state).toBeTruthy();
      expect(engine.state._singleton).toBe('bobby');
      expect(engine.state.currentStatus).toBeTruthy();
    });

    it('初始化后有情绪引擎', async () => {
      await engine.init();

      expect(engine.emotion).toBeTruthy();
      expect(engine.emotion.current).toBeDefined();
    });

    it('初始化后有认知循环', async () => {
      await engine.init();

      expect(engine.cognitive).toBeTruthy();
    });

    it('重复调用 init 不创建多个状态', async () => {
      await engine.init();
      const firstId = engine.state._id;

      // 创建新引擎实例
      const engine2 = new BobbyEngine(mockIo);
      await engine2.init();

      // 应该找到同一个单例
      const states = await BobbyState.find({ _singleton: 'bobby' });
      expect(states.length).toBe(1);
    });

    it('从持久化状态恢复情绪', async () => {
      // 先初始化
      await engine.init();
      engine.emotion.current.joy = 0.8;

      // 直接更新数据库（避免 ParallelSaveError）
      await BobbyState.findOneAndUpdate(
        { _singleton: 'bobby' },
        {
          $set: {
            emotionState: {
              current: engine.emotion.toJSON().current,
              baseline: engine.emotion.toJSON().baseline,
              stress: 5,
              heartRate: 85,
            }
          }
        }
      );

      // 重新初始化
      const engine2 = new BobbyEngine(mockIo);
      await engine2.init();

      // 情绪应该被恢复（joy 应该接近 0.8，可能因 tick 衰减略有变化）
      expect(engine2.emotion.current.joy).toBeGreaterThan(0.5);
    });
  });

  // ═══════════════════════════════════════════
  // 处理消息
  // ═══════════════════════════════════════════
  describe('处理消息 (handleMessage)', () => {
    let user;

    beforeEach(async () => {
      await engine.init();
      user = await User.create({ username: 'testuser', password: 'password123' });
    });

    it('不存在的用户返回 null', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const result = await engine.handleMessage(fakeId, '你好');
      expect(result).toBeNull();
    });

    it('保存用户消息到数据库', async () => {
      await engine.handleMessage(user._id, '你好');

      const messages = await Message.find({ userId: user._id, role: 'user' });
      expect(messages.length).toBe(1);
      expect(messages[0].content).toBe('你好');
    });

    it('保存 Bobby 回复到数据库', async () => {
      await engine.handleMessage(user._id, '你好');

      const messages = await Message.find({ userId: user._id, role: 'assistant' });
      expect(messages.length).toBe(1);
      expect(messages[0].content).toBe('嗯'); // mock 返回值
    });

    it('返回包含回复和好感度信息', async () => {
      const result = await engine.handleMessage(user._id, '你好');

      expect(result.reply).toBeTruthy();
      expect(result.reply.content).toBe('嗯');
      expect(typeof result.upgraded).toBe('boolean');
      expect(result.intimacyLevel).toBeTruthy();
      expect(result.intimacyLevel.name).toBeTruthy();
    });

    it('增加好感度', async () => {
      await engine.handleMessage(user._id, '你好');

      const updatedUser = await User.findById(user._id);
      expect(updatedUser.intimacy).toBe(1);
    });

    it('多次聊天累积好感度', async () => {
      for (let i = 0; i < 5; i++) {
        await engine.handleMessage(user._id, `消息 ${i}`);
      }

      const updatedUser = await User.findById(user._id);
      expect(updatedUser.intimacy).toBe(5);
    });

    it('好感度升级时 upgraded 为 true', async () => {
      // 设置到升级边界
      user.intimacy = 9;
      await user.save();

      const result = await engine.handleMessage(user._id, '你好');
      expect(result.upgraded).toBe(true);
      expect(result.intimacyLevel.name).toBe('认识');
    });

    it('检测用户情绪关键词', async () => {
      await engine.handleMessage(user._id, '今天好累');

      const updatedUser = await User.findById(user._id);
      expect(updatedUser.mood).toBe('tired');
    });

    it('检测悲伤情绪', async () => {
      await engine.handleMessage(user._id, '我好难过');

      const updatedUser = await User.findById(user._id);
      expect(updatedUser.mood).toBe('sad');
    });

    it('保存用户话题', async () => {
      await engine.handleMessage(user._id, '今天去了图书馆看书');

      const updatedUser = await User.findById(user._id);
      expect(updatedUser.lastTopic).toContain('今天去了图书馆');
    });

    it('同一用户的同一批次消息共享 batchId', async () => {
      await engine.handleMessage(user._id, '你好');

      const messages = await Message.find({ userId: user._id });
      const batchIds = messages.map(m => m.batchId);
      // 所有消息应该有相同的 batchId
      expect(new Set(batchIds).size).toBe(1);
    });

    it('消息按时间排序', async () => {
      await engine.handleMessage(user._id, '第一条');
      await engine.handleMessage(user._id, '第二条');

      const messages = await Message.find({ userId: user._id }).sort({ createdAt: -1 });
      expect(messages.length).toBe(4); // 2 user + 2 assistant
    });
  });

  // ═══════════════════════════════════════════
  // 处理评论
  // ═══════════════════════════════════════════
  describe('处理评论 (handleComment)', () => {
    let user, note;

    beforeEach(async () => {
      await engine.init();
      user = await User.create({ username: 'testuser', password: 'password123' });
      note = await Note.create({
        content: '今天天气不错',
        timeLabel: '下午',
        type: 'daily'
      });
    });

    it('不存在的用户返回 null', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const result = await engine.handleComment(fakeId, note._id, '好看', { skipDelay: true });
      expect(result).toBeNull();
    });

    it('不存在的动态返回 null', async () => {
      const fakeNoteId = new mongoose.Types.ObjectId();
      const result = await engine.handleComment(user._id, fakeNoteId, '好看', { skipDelay: true });
      expect(result).toBeNull();
    });

    it('添加评论到动态', async () => {
      await engine.handleComment(user._id, note._id, '好看', { skipDelay: true });

      const updatedNote = await Note.findById(note._id);
      const userComments = updatedNote.comments.filter(c => !c.isBobby);
      expect(userComments.length).toBe(1);
      expect(userComments[0].content).toBe('好看');
      expect(userComments[0].isBobby).toBe(false);
    });

    it('评论增加好感度 +2', async () => {
      await engine.handleComment(user._id, note._id, '好看', { skipDelay: true });

      const updatedUser = await User.findById(user._id);
      expect(updatedUser.intimacy).toBe(2);
    });

    it('返回 bobbyReply 字段', async () => {
      const result = await engine.handleComment(user._id, note._id, '好看', { skipDelay: true });
      expect(result).toHaveProperty('bobbyReply');
    });
  });

  // ═══════════════════════════════════════════
  // 情绪持久化
  // ═══════════════════════════════════════════
  describe('情绪持久化', () => {
    it('handleMessage 后情绪保存到数据库', async () => {
      await engine.init();
      const user = await User.create({ username: 'testuser', password: 'password123' });

      await engine.handleMessage(user._id, '我好难过');

      const state = await BobbyState.findOne({ _singleton: 'bobby' });
      expect(state.emotionState).toBeTruthy();
      expect(state.emotionState.current).toBeTruthy();
      expect(state.lastEmotionTick).toBeTruthy();
    });

    it('_persistEmotion 保存情绪快照', async () => {
      await engine.init();
      engine.emotion.current.joy = 0.5;

      // 等一下确保 init 的 save 完成
      await new Promise(r => setTimeout(r, 50));
      await engine._persistEmotion();

      const state = await BobbyState.findOne({ _singleton: 'bobby' });
      expect(state.emotionState.stress).toBeDefined();
      expect(state.emotionState.heartRate).toBeDefined();
    });
  });

  // ═══════════════════════════════════════════
  // 状态广播
  // ═══════════════════════════════════════════
  describe('状态广播', () => {
    it('broadcastStatus 发送 status_update 事件', async () => {
      await engine.init();
      engine.broadcastStatus();

      expect(mockIo.emit).toHaveBeenCalledWith('status_update', expect.objectContaining({
        status: expect.any(String),
        changedAt: expect.any(Date),
      }));
    });

    it('displayOverride 优先显示', async () => {
      await engine.init();
      // 使用 findOneAndUpdate 避免 ParallelSaveError
      await BobbyState.findOneAndUpdate(
        { _singleton: 'bobby' },
        {
          $set: {
            displayOverride: '在收礼物',
            overrideExpiry: new Date(Date.now() + 60000),
          }
        }
      );
      // 重新加载状态
      engine.state = await BobbyState.findOne({ _singleton: 'bobby' });

      engine.broadcastStatus();

      expect(mockIo.emit).toHaveBeenCalledWith('status_update', expect.objectContaining({
        status: '在收礼物',
      }));
    });
  });
});
