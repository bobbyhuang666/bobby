# 测试迁移指南

## 已完成的迁移（3/25）

以下模块已在 `__tests__/` 下创建了 Jest 版本：

| 旧 test.js 区块 | 新文件 | 状态 |
|---|---|---|
| 1. Personality | `__tests__/agent/personality.test.js` | ✅ 完成 |
| 2. EmotionVector | `__tests__/agent/emotion.test.js` | ✅ 完成 |
| 14. Appraisal | `__tests__/agent/appraisal.test.js` | ✅ 完成 |

## 快速开始

```bash
cd server
npm install           # 安装 jest
npm test              # 运行所有新测试
npm run test:watch    # 监视模式
npm run test:coverage # 生成覆盖率报告
```

## 如何迁移剩余模块

对每个模块，用以下格式对 AI 说：

> "帮我把 Andy 引擎的 StateMachine 测试从旧格式迁移到 Jest。
> 旧测试代码在 `/server/andy/test.js` 的 section 3。请参照 `/server/__tests__/agent/personality.test.js` 的风格。"

## 新旧对比

### 旧格式 (test.js)
```javascript
section('1. Personality 模块测试');
(() => {
  const p1 = new Personality({ mbti: 'INFP' });
  assert(p1.ocean.openness > 0.7, 'INFP openness should be high');
})();
```

### 新格式 (Jest)
```javascript
describe('Personality', () => {
  it('INFP → 高开放性', () => {
    const p1 = new Personality({ mbti: 'INFP' });
    expect(p1.ocean.openness).toBeGreaterThan(0.7);
  });
});
```

## 迁移检查清单

- [x] 1. Personality
- [x] 2. EmotionVector
- [ ] 3. StateMachine
- [ ] 4. PersonalMemory
- [ ] 5. SocialGraph
- [ ] 6. RegionGrid
- [ ] 7. EventDispatcher
- [ ] 8. Schedule
- [ ] 9. Agent 创建与序列化
- [ ] 10. AndyEngine 集成
- [ ] 11. 长时间模拟稳定性
- [ ] 12. 极端条件
- [ ] 13. 情绪均衡回归
- [x] 14. Appraisal
- [ ] 15. ProceduralMemory
- [ ] 16. 情绪一致性记忆检索
- [ ] 17. Personality 30维基线
- [ ] 18. 上班族状态
- [ ] 19. 事件驱动关键词匹配
- [ ] 20. Dunbar 层级限制
- [ ] 21. 情绪感知状态转移
- [ ] 22. 共激活传播阈值
- [ ] 23. PersonalMemory 模拟时间
- [ ] 24. NeedsSystem
- [ ] 25. NeedsSystem 集成
