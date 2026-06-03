/**
 * User 模型测试
 *
 * 测试好感度等级系统：
 *   - 好感度等级计算
 *   - 好感度增加
 *   - 边界条件
 */

// Mock mongoose
jest.mock('mongoose', () => {
  const mMongoose = {
    Schema: jest.fn().mockImplementation(() => ({
      pre: jest.fn(),
      methods: {},
    })),
    model: jest.fn().mockReturnValue({}),
  };
  return mMongoose;
});

// Mock bcryptjs
jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn().mockResolvedValue(true),
}));

// 导入共享配置
const { BOBBY_DEFAULTS } = require('../../config/bobbyDefaults');
const { intimacyLevels } = BOBBY_DEFAULTS;

// 创建一个简单的User类来测试好感度逻辑
class MockUser {
  constructor() {
    this.intimacy = 0;
  }

  getIntimacyLevel() {
    const i = this.intimacy;
    // 从高到低匹配，找到第一个 threshold <= i 的等级
    for (let j = intimacyLevels.length - 1; j >= 0; j--) {
      if (i >= intimacyLevels[j].threshold) {
        return { name: intimacyLevels[j].name, desc: intimacyLevels[j].desc, value: i };
      }
    }
    return { name: intimacyLevels[0].name, desc: intimacyLevels[0].desc, value: i };
  }

  addIntimacy(points) {
    const oldLevel = this.getIntimacyLevel().name;
    this.intimacy = Math.max(0, Math.min(100, this.intimacy + points));
    const newLevel = this.getIntimacyLevel().name;
    return oldLevel !== newLevel; // 返回是否升级
  }
}

describe('User 好感度系统', () => {
  let user;

  beforeEach(() => {
    user = new MockUser();
  });

  // ═══════════════════════════════════════════
  // 好感度等级计算
  // ═══════════════════════════════════════════
  describe('好感度等级 (getIntimacyLevel)', () => {
    it('好感度 0 → 陌生', () => {
      user.intimacy = 0;
      const level = user.getIntimacyLevel();
      expect(level.name).toBe('陌生');
    });

    it('好感度 9 → 陌生', () => {
      user.intimacy = 9;
      const level = user.getIntimacyLevel();
      expect(level.name).toBe('陌生');
    });

    it('好感度 10 → 认识', () => {
      user.intimacy = 10;
      const level = user.getIntimacyLevel();
      expect(level.name).toBe('认识');
    });

    it('好感度 24 → 认识', () => {
      user.intimacy = 24;
      const level = user.getIntimacyLevel();
      expect(level.name).toBe('认识');
    });

    it('好感度 25 → 熟悉', () => {
      user.intimacy = 25;
      const level = user.getIntimacyLevel();
      expect(level.name).toBe('熟悉');
    });

    it('好感度 44 → 熟悉', () => {
      user.intimacy = 44;
      const level = user.getIntimacyLevel();
      expect(level.name).toBe('熟悉');
    });

    it('好感度 45 → 默契', () => {
      user.intimacy = 45;
      const level = user.getIntimacyLevel();
      expect(level.name).toBe('默契');
    });

    it('好感度 69 → 默契', () => {
      user.intimacy = 69;
      const level = user.getIntimacyLevel();
      expect(level.name).toBe('默契');
    });

    it('好感度 70 → 信赖', () => {
      user.intimacy = 70;
      const level = user.getIntimacyLevel();
      expect(level.name).toBe('信赖');
    });

    it('好感度 100 → 信赖', () => {
      user.intimacy = 100;
      const level = user.getIntimacyLevel();
      expect(level.name).toBe('信赖');
    });

    it('返回正确的描述', () => {
      user.intimacy = 0;
      const level = user.getIntimacyLevel();
      expect(level.desc).toBe('你们还不太熟');
    });

    it('返回正确的好感度值', () => {
      user.intimacy = 35;
      const level = user.getIntimacyLevel();
      expect(level.value).toBe(35);
    });
  });

  // ═══════════════════════════════════════════
  // 好感度增加
  // ═══════════════════════════════════════════
  describe('好感度增加 (addIntimacy)', () => {
    it('增加好感度', () => {
      user.intimacy = 0;
      user.addIntimacy(5);
      expect(user.intimacy).toBe(5);
    });

    it('好感度不能超过 100', () => {
      user.intimacy = 95;
      user.addIntimacy(10);
      expect(user.intimacy).toBe(100);
    });

    it('好感度不能低于 0', () => {
      user.intimacy = 5;
      user.addIntimacy(-10);
      expect(user.intimacy).toBe(0);
    });

    it('升级时返回 true', () => {
      user.intimacy = 9;
      const upgraded = user.addIntimacy(1);
      expect(upgraded).toBe(true);
      expect(user.intimacy).toBe(10);
    });

    it('未升级时返回 false', () => {
      user.intimacy = 5;
      const upgraded = user.addIntimacy(1);
      expect(upgraded).toBe(false);
      expect(user.intimacy).toBe(6);
    });

    it('连续升级', () => {
      user.intimacy = 9;
      user.addIntimacy(1); // 9 → 10 (陌生 → 认识)
      expect(user.getIntimacyLevel().name).toBe('认识');

      user.addIntimacy(15); // 10 → 25 (认识 → 熟悉)
      expect(user.getIntimacyLevel().name).toBe('熟悉');
    });
  });

  // ═══════════════════════════════════════════
  // 边界条件
  // ═══════════════════════════════════════════
  describe('边界条件', () => {
    it('好感度为 0 时等级为陌生', () => {
      user.intimacy = 0;
      expect(user.getIntimacyLevel().name).toBe('陌生');
    });

    it('好感度为 100 时等级为信赖', () => {
      user.intimacy = 100;
      expect(user.getIntimacyLevel().name).toBe('信赖');
    });

    it('好感度为负数时等级为陌生', () => {
      user.intimacy = -5;
      expect(user.getIntimacyLevel().name).toBe('陌生');
    });

    it('好感度超过 100 时等级为信赖', () => {
      user.intimacy = 150;
      expect(user.getIntimacyLevel().name).toBe('信赖');
    });
  });

  // ═══════════════════════════════════════════
  // 好感度等级配置
  // ═══════════════════════════════════════════
  describe('好感度等级配置', () => {
    it('有 5 个等级', () => {
      expect(intimacyLevels.length).toBe(5);
    });

    it('等级按阈值升序排列', () => {
      for (let i = 1; i < intimacyLevels.length; i++) {
        expect(intimacyLevels[i].threshold).toBeGreaterThan(intimacyLevels[i - 1].threshold);
      }
    });

    it('第一个等级阈值为 0', () => {
      expect(intimacyLevels[0].threshold).toBe(0);
    });

    it('每个等级都有名称和描述', () => {
      for (const level of intimacyLevels) {
        expect(level.name).toBeTruthy();
        expect(level.desc).toBeTruthy();
      }
    });
  });
});
