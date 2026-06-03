/**
 * BobbyState 模型集成测试
 *
 * 使用真实 MongoDB 测试：
 *   - 单例模式
 *   - 情绪状态持久化
 *   - Andy 状态持久化
 */

const mongoose = require('mongoose');
const BobbyState = require('../../models/BobbyState');

describe('BobbyState 模型集成测试', () => {

  // ═══════════════════════════════════════════
  // 单例模式
  // ═══════════════════════════════════════════
  describe('单例模式', () => {
    it('创建默认状态', async () => {
      const state = await BobbyState.create({});

      expect(state._singleton).toBe('bobby');
      expect(state.currentStatus).toBe('还没睡呢');
      expect(state.whisperCount).toBe(0);
      expect(state.notesToday).toBe(0);
    });

    it('单例唯一约束', async () => {
      await BobbyState.create({});

      // 第二个单例文档应该违反唯一约束
      await expect(BobbyState.create({})).rejects.toThrow();
    });

    it('findOne 查找单例', async () => {
      await BobbyState.create({});
      const found = await BobbyState.findOne({ _singleton: 'bobby' });

      expect(found).toBeTruthy();
      expect(found._singleton).toBe('bobby');
    });
  });

  // ═══════════════════════════════════════════
  // 情绪状态持久化
  // ═══════════════════════════════════════════
  describe('情绪状态持久化', () => {
    it('保存 Map 类型情绪数据', async () => {
      const state = await BobbyState.create({});

      state.emotionState = {
        current: { joy: 0.5, sadness: 0.2, calm: 0.3 },
        baseline: { joy: 0.05, sadness: 0, calm: 0.3 },
        stress: 3,
        heartRate: 75
      };
      await state.save();

      const reloaded = await BobbyState.findById(state._id);
      expect(reloaded.emotionState.stress).toBe(3);
      expect(reloaded.emotionState.heartRate).toBe(75);
    });

    it('更新情绪状态', async () => {
      const state = await BobbyState.create({});
      state.emotionState = { stress: 2, heartRate: 70 };
      await state.save();

      state.emotionState.stress = 5;
      state.emotionState.heartRate = 90;
      await state.save();

      const reloaded = await BobbyState.findById(state._id);
      expect(reloaded.emotionState.stress).toBe(5);
      expect(reloaded.emotionState.heartRate).toBe(90);
    });
  });

  // ═══════════════════════════════════════════
  // 状态变更
  // ═══════════════════════════════════════════
  describe('状态变更', () => {
    it('更新当前状态', async () => {
      const state = await BobbyState.create({});
      state.currentStatus = '在上课';
      state.statusChangedAt = new Date();
      await state.save();

      const reloaded = await BobbyState.findById(state._id);
      expect(reloaded.currentStatus).toBe('在上课');
    });

    it('临时覆盖状态', async () => {
      const state = await BobbyState.create({});
      state.displayOverride = '在收礼物';
      state.overrideExpiry = new Date(Date.now() + 300000);
      await state.save();

      const reloaded = await BobbyState.findById(state._id);
      expect(reloaded.displayOverride).toBe('在收礼物');
    });

    it('每日计数器', async () => {
      const state = await BobbyState.create({});
      state.whisperCount = 2;
      state.whisperDate = '2026-06-01';
      state.notesToday = 3;
      state.notesDate = '2026-06-01';
      await state.save();

      const reloaded = await BobbyState.findById(state._id);
      expect(reloaded.whisperCount).toBe(2);
      expect(reloaded.notesToday).toBe(3);
    });
  });

  // ═══════════════════════════════════════════
  // Andy 状态持久化
  // ═══════════════════════════════════════════
  describe('Andy 状态持久化', () => {
    it('保存 Mixed 类型 Andy 状态', async () => {
      const state = await BobbyState.create({});

      state.andyWorldState = {
        worldTime: '2026-06-01T15:30:00Z',
        agents: {
          bobby: { state: '在图书馆', position: '图书馆' }
        }
      };
      await state.save();

      const reloaded = await BobbyState.findById(state._id);
      expect(reloaded.andyWorldState.worldTime).toBe('2026-06-01T15:30:00Z');
      expect(reloaded.andyWorldState.agents.bobby.state).toBe('在图书馆');
    });

    it('Andy 状态默认 null', async () => {
      const state = await BobbyState.create({});
      expect(state.andyWorldState).toBeNull();
    });
  });

  // ═══════════════════════════════════════════
  // 防重复
  // ═══════════════════════════════════════════
  describe('防重复', () => {
    it('记录最近碎片内容', async () => {
      const state = await BobbyState.create({});
      state.recentNoteTexts = ['今天天气不错', '有点困了', '在发呆'];
      await state.save();

      const reloaded = await BobbyState.findById(state._id);
      expect(reloaded.recentNoteTexts.length).toBe(3);
      expect(reloaded.recentNoteTexts).toContain('有点困了');
    });
  });
});
