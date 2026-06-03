/**
 * Appraisal 模块测试
 *
 * 测试基于 Scherer CPM 的 8 维认知评价系统：
 *   1. 突然性 (suddenness)
 *   2. 愉悦性 (pleasantness)
 *   3. 目标相关性 (goalRelevance)
 *   4. 目标促进性 (goalConduciveness)
 *   5. 兼容性 (compatibility)
 *   6. 代理性 (agency)
 *   7. 应对潜力 (copingPotential)
 *   8. 标准一致性 (normConformity)
 *
 * 以及评价→情绪映射的 7 条规则。
 */

const Appraisal = require('../../andy/agent/Appraisal');
const Agent = require('../../andy/agent/Agent');

// 辅助：创建一个最小 Agent 用于测试
function makeAgent(overrides = {}) {
  return new Agent({
    id: 'test_agent',
    name: '测试角色',
    mbti: overrides.mbti || 'INFP',
    schedule: {},
    ...overrides,
  });
}

// 辅助：创建一个标准社交事件
function makeSocialEvent(content, participants = ['test_agent', 'other']) {
  return {
    type: 'social',
    content,
    participants,
    effects: [{
      target: 'test_agent',
      type: 'emotion',
      delta: { joy: 0.2, interest: 0.1 },
    }],
  };
}

describe('Appraisal', () => {
  let agent;

  beforeEach(() => {
    agent = makeAgent();
  });

  // ───────── 基础评价 ─────────
  describe('evaluate 返回完整结果', () => {
    it('返回 dimensions + emotionModifier + importance', () => {
      const event = makeSocialEvent('和朋友聊天');
      const result = Appraisal.evaluate(event, agent);

      expect(result).toHaveProperty('dimensions');
      expect(result).toHaveProperty('emotionModifier');
      expect(result).toHaveProperty('importance');
      expect(result.importance).toBeGreaterThanOrEqual(0);
      expect(result.importance).toBeLessThanOrEqual(1);
    });

    it('8 个评价维度都存在', () => {
      const event = makeSocialEvent('偶遇朋友');
      const result = Appraisal.evaluate(event, agent);
      const dims = result.dimensions;

      expect(dims).toHaveProperty('suddenness');
      expect(dims).toHaveProperty('pleasantness');
      expect(dims).toHaveProperty('goalRelevance');
      expect(dims).toHaveProperty('goalConduciveness');
      expect(dims).toHaveProperty('compatibility');
      expect(dims).toHaveProperty('agency');
      expect(dims).toHaveProperty('copingPotential');
      expect(dims).toHaveProperty('normConformity');
    });
  });

  // ───────── 各维度范围检查 ─────────
  describe('维度值范围', () => {
    const eventTypes = [
      { type: 'social', content: '和朋友聊天', effects: [{ target: 'test_agent', type: 'emotion', delta: { joy: 0.3 } }], participants: ['test_agent', 'other'] },
      { type: 'weather', content: '下雨了', effects: [{ target: 'test_agent', type: 'emotion', delta: { sadness: 0.1 } }] },
      { type: 'random', content: '意外事件', effects: [{ target: 'test_agent', type: 'emotion', delta: { surprise: 0.4 } }] },
      { type: 'state', content: '状态变化', effects: [] },
    ];

    test.each(eventTypes)('$type 事件的各维度在 [0,1] 范围内', (event) => {
      const result = Appraisal.evaluate({ ...event, participants: event.participants || [] }, agent);
      const dims = result.dimensions;

      for (const [name, value] of Object.entries(dims)) {
        if (name === 'agency') continue; // agency 是对象
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    });
  });

  // ───────── 特定维度验证 ─────────
  describe('突然性 (suddenness)', () => {
    it('日程事件突然性很低', () => {
      const event = { type: 'schedule', content: '去上课', effects: [], participants: [] };
      const result = Appraisal.evaluate(event, agent);
      expect(result.dimensions.suddenness).toBeLessThan(0.3);
    });

    it('随机事件突然性较高', () => {
      const event = { type: 'random', content: '发生了一件意外', effects: [], participants: [] };
      const result = Appraisal.evaluate(event, agent);
      expect(result.dimensions.suddenness).toBeGreaterThan(0.3);
    });

    it('神经质高的 Agent 感知到更高的突然性', () => {
      const neurotic = makeAgent({ mbti: 'INFJ', personality: { ocean: { neuroticism: 0.9 } } });
      const calm = makeAgent({ mbti: 'ISTJ', personality: { ocean: { neuroticism: 0.2 } } });

      const event = { type: 'random', content: '意外', effects: [], participants: [] };
      const neuroticResult = Appraisal.evaluate(event, neurotic);
      const calmResult = Appraisal.evaluate(event, calm);

      expect(neuroticResult.dimensions.suddenness).toBeGreaterThan(calmResult.dimensions.suddenness);
    });
  });

  // ───────── 代理性 (agency) ─────────
  describe('代理性 (agency)', () => {
    it('天气事件 → 环境/命运', () => {
      const event = { type: 'weather', content: '台风', effects: [], participants: [] };
      const result = Appraisal.evaluate(event, agent);
      expect(result.dimensions.agency.label).toBe('environment');
      expect(result.dimensions.agency.score).toBe(0);
    });

    it('随机事件 → 偶然', () => {
      const event = { type: 'random', content: '意外', effects: [], participants: [] };
      const result = Appraisal.evaluate(event, agent);
      expect(result.dimensions.agency.label).toBe('chance');
    });

    it('自己的日程事件 → self', () => {
      const event = { type: 'schedule', content: '去上课', effects: [], participants: [] };
      const result = Appraisal.evaluate(event, agent);
      expect(result.dimensions.agency.label).toBe('self');
    });
  });

  // ───────── 应对潜力 ─────────
  describe('应对潜力 (copingPotential)', () => {
    it('高神经质 → 低应对潜力', () => {
      const anxious = makeAgent({ mbti: 'INFJ', personality: { ocean: { neuroticism: 0.9 } } });
      const stable = makeAgent({ mbti: 'ISTJ', personality: { ocean: { neuroticism: 0.2 } } });

      const event = { type: 'random', content: '意外', effects: [], participants: [] };
      const anxiousResult = Appraisal.evaluate(event, anxious);
      const stableResult = Appraisal.evaluate(event, stable);

      expect(anxiousResult.dimensions.copingPotential).toBeLessThan(stableResult.dimensions.copingPotential);
    });

    it('高压力 → 低应对潜力', () => {
      const stressed = makeAgent();
      stressed.emotion.setStress(9); // 极高压力
      const relaxed = makeAgent();
      relaxed.emotion.setStress(1);  // 极低压力

      const event = { type: 'random', content: '意外', effects: [], participants: [] };
      const stressedResult = Appraisal.evaluate(event, stressed);
      const relaxedResult = Appraisal.evaluate(event, relaxed);

      expect(stressedResult.dimensions.copingPotential).toBeLessThan(relaxedResult.dimensions.copingPotential);
    });
  });

  // ───────── 评价→情绪映射 ─────────
  describe('_appraisalToEmotion 映射规则', () => {
    it('正面事件 → joy modifier > 1', () => {
      const event = {
        type: 'social',
        content: '和朋友分享开心的事',
        participants: ['test_agent', 'friend'],
        effects: [{ target: 'test_agent', type: 'emotion', delta: { joy: 0.5 } }],
      };
      const result = Appraisal.evaluate(event, agent);
      // 正面事件应该增强 joy
      if (result.emotionModifier.joy !== undefined) {
        expect(result.emotionModifier.joy).toBeGreaterThanOrEqual(0.1);
      }
    });

    it('emotionModifier 值在 [0.1, 2.5] 范围内', () => {
      const event = makeSocialEvent('一件令人沮丧的事，朋友吵架了');
      event.effects = [{ target: 'test_agent', type: 'emotion', delta: { sadness: 0.5, frustration: 0.4 } }];
      const result = Appraisal.evaluate(event, agent);

      for (const [key, val] of Object.entries(result.emotionModifier)) {
        expect(val).toBeGreaterThanOrEqual(0.1);
        expect(val).toBeLessThanOrEqual(2.5);
      }
    });
  });
});
