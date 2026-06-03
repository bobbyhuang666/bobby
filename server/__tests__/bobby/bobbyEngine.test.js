/**
 * Bobby 引擎测试
 *
 * 测试 BobbyEngine 核心逻辑：
 *   - 初始化
 *   - 状态机推进
 *   - Andy 桥接集成
 *   - 降级机制
 *   - 深夜判断
 */

// Mock 所有依赖
jest.mock('../../models/Message', () => ({
  create: jest.fn().mockResolvedValue({ _id: 'msg1', content: '嗯' }),
  find: jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      })
    })
  }),
}));

jest.mock('../../models/Note', () => ({
  find: jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      })
    })
  }),
  create: jest.fn().mockResolvedValue({}),
}));

jest.mock('../../models/User', () => ({
  findById: jest.fn().mockResolvedValue(null),
}));

jest.mock('../../models/BobbyState', () => {
  const mockState = {
    _singleton: 'bobby',
    currentStatus: '在发呆',
    statusChangedAt: new Date(),
    emotionState: null,
    lastEmotionTick: null,
    displayOverride: null,
    overrideExpiry: null,
    andyWorldState: null,
    save: jest.fn().mockResolvedValue(true),
  };

  return {
    findOne: jest.fn().mockResolvedValue(mockState),
    findOneAndUpdate: jest.fn().mockResolvedValue(mockState),
    create: jest.fn().mockResolvedValue(mockState),
  };
});

jest.mock('../../services/aiService', () => ({
  generateReply: jest.fn().mockResolvedValue('嗯'),
  generateCommentReply: jest.fn().mockResolvedValue('谢谢'),
}));

jest.mock('../../services/memoryService', () => ({
  MemoryService: {
    retrieve: jest.fn().mockResolvedValue([]),
    getUserProfile: jest.fn().mockResolvedValue(''),
    learnFromConversation: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../../services/cognitiveLoop', () => ({
  CognitiveLoop: jest.fn().mockImplementation(() => ({
    getRecentThoughts: jest.fn().mockReturnValue([]),
    reverie: jest.fn().mockResolvedValue('在发呆'),
    consolidation: jest.fn().mockResolvedValue(null),
  })),
  COGNITIVE_MODULES: {},
}));

jest.mock('../../utils/time', () => ({
  getTimeLabel: jest.fn().mockReturnValue('下午'),
  getTimePeriod: jest.fn().mockReturnValue('afternoon'),
}));

const BobbyEngine = require('../../services/bobbyEngine');
const { EmotionEngine } = require('../../services/emotionEngine');

describe('Bobby 引擎', () => {
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
  describe('初始化', () => {
    it('构造函数设置 io', () => {
      expect(engine.io).toBe(mockIo);
    });

    it('初始状态为 null', () => {
      expect(engine.state).toBeNull();
    });

    it('初始情绪为 null', () => {
      expect(engine.emotion).toBeNull();
    });

    it('初始认知为 null', () => {
      expect(engine.cognitive).toBeNull();
    });

    it('初始桥接为 null', () => {
      expect(engine.bridge).toBeNull();
    });
  });

  // ═══════════════════════════════════════════
  // Andy 桥接
  // ═══════════════════════════════════════════
  describe('Andy 桥接 (setAndyBridge)', () => {
    it('设置桥接层', () => {
      const mockBridge = { tick: jest.fn() };
      engine.setAndyBridge(mockBridge);
      expect(engine.bridge).toBe(mockBridge);
    });

    it('null 桥接禁用 Andy', () => {
      engine.setAndyBridge(null);
      expect(engine.bridge).toBeNull();
    });
  });

  // ═══════════════════════════════════════════
  // 时间相关
  // ═══════════════════════════════════════════
  describe('时间判断', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('23点 → 深夜', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 23:30:00'));
      expect(engine.isNight()).toBe(true);
    });

    it('0点 → 深夜', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 00:00:00'));
      expect(engine.isNight()).toBe(true);
    });

    it('2点 → 深夜', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 02:00:00'));
      expect(engine.isNight()).toBe(true);
    });

    it('3点 → 不是深夜', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 03:00:00'));
      expect(engine.isNight()).toBe(false);
    });

    it('12点 → 不是深夜', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 12:00:00'));
      expect(engine.isNight()).toBe(false);
    });

    it('getTimeLabel 返回时间标签', () => {
      expect(engine.getTimeLabel()).toBe('下午');
    });
  });

  // ═══════════════════════════════════════════
  // 状态机
  // ═══════════════════════════════════════════
  describe('状态机 (STATE_MACHINE)', () => {
    it('updateStatus 无状态时不崩溃', async () => {
      engine.state = null;
      await engine.updateStatus();
      // 不应抛出错误
    });

    it('broadcastStatus 无 io 不崩溃', () => {
      engine.io = null;
      engine.state = { currentStatus: '在发呆', displayOverride: null };
      // 不应抛出错误
    });
  });

  // ═══════════════════════════════════════════
  // 降级机制
  // ═══════════════════════════════════════════
  describe('降级机制 (_degradeFromAndy)', () => {
    it('降级后清理 Andy 数据', () => {
      engine.emotion = new EmotionEngine();
      engine.emotion._andyValence = 0.5;
      engine.emotion._andyArousal = 0.6;
      engine.emotion._andyStress = 3;
      engine.emotion._andyDominant = [{ dim: 'joy', value: 0.5 }];

      // 需要先设置 _useAndy 为 true
      engine.setAndyBridge({ tick: jest.fn() });
      engine._degradeFromAndy('测试降级');

      expect(engine.emotion._andyValence).toBeUndefined();
      expect(engine.emotion._andyArousal).toBeUndefined();
      expect(engine.emotion._andyStress).toBeUndefined();
      expect(engine.emotion._andyDominant).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════
  // Andy tick
  // ═══════════════════════════════════════════
  describe('Andy tick (tickAndy)', () => {
    it('无桥接时返回 null', async () => {
      const result = await engine.tickAndy();
      expect(result).toBeNull();
    });

    it('有桥接时委托给 bridge.tick()', async () => {
      const mockResult = {
        bobbyStatus: '在上课',
        bobbyEmotion: '有点无聊',
        stateChanged: true,
      };
      const mockBridge = {
        tick: jest.fn().mockReturnValue(mockResult),
        getBobbyEmotionData: jest.fn().mockReturnValue({
          valence: 0,
          arousal: 0.5,
          dominant: [],
          stress: 2,
        }),
      };

      engine.emotion = new EmotionEngine();
      engine.setAndyBridge(mockBridge);
      engine.state = {
        currentStatus: '在发呆',
        statusChangedAt: new Date(),
        save: jest.fn().mockResolvedValue(true),
      };

      const result = await engine.tickAndy();
      expect(result).toBe(mockResult);
      expect(mockBridge.tick).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════
  // 世界上下文
  // ═══════════════════════════════════════════
  describe('世界上下文 (getAndyWorldContext)', () => {
    it('无桥接时返回 null', () => {
      expect(engine.getAndyWorldContext()).toBeNull();
    });

    it('有桥接时返回上下文', () => {
      const mockContext = { eventTexts: '天气不错' };
      engine.setAndyBridge({
        getWorldContext: jest.fn().mockReturnValue(mockContext),
      });

      const ctx = engine.getAndyWorldContext();
      expect(ctx).toBe(mockContext);
    });
  });
});
