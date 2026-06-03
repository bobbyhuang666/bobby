/**
 * Jest 集成测试配置
 *
 * 使用方式：
 *   npx jest --config jest.config.integration.js              # 运行所有集成测试
 *   npx jest --config jest.config.integration.js userModel    # 只跑单个文件
 */

module.exports = {
  // 测试文件位置（只跑集成测试目录）
  roots: ['<rootDir>/__tests__/integration'],

  testEnvironment: 'node',
  testMatch: ['**/*.test.js'],

  // 集成测试需要更长时间（数据库操作 + AI mock）
  testTimeout: 30000,

  // 每个测试文件运行前执行 setup（注册 beforeAll/afterAll 连接 MongoDB）
  setupFilesAfterEnv: ['<rootDir>/__tests__/integration/setup.js'],

  verbose: true,
  clearMocks: true,
};
