/**
 * 集成测试 MongoDB Memory Server 配置
 *
 * 在所有集成测试前启动内存 MongoDB，测试结束后关闭。
 * 每个测试文件结束后清空所有集合（而非重建连接，更快）。
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

// 所有测试开始前：启动内存 MongoDB 并连接
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
}, 60000); // 首次下载 mongod 可能需要时间

// 每个测试结束后：清空所有集合（比断开重连快得多）
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
});

// 所有测试结束后：断开连接并停止 MongoDB
afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
}, 30000);
