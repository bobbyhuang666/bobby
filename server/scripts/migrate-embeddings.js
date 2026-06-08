#!/usr/bin/env node
/**
 * 历史记忆向量化迁移脚本
 *
 * 为所有缺少 embedding 的 MemoryBlock 记录补上向量。
 * 运行方式：node scripts/migrate-embeddings.js
 *
 * 注意：首次运行需要下载 bge-small-zh-v1.5 模型（约 90MB）
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const EmbeddingService = require('../services/embeddingService');

// MemoryBlock schema（简化版，只需读写 embedding）
const memoryBlockSchema = new mongoose.Schema({
  content: String,
  embedding: [Number],
}, { strict: false });
const MemoryBlock = mongoose.model('MemoryBlock', memoryBlockSchema);

const BATCH_SIZE = 50;

async function migrate() {
  console.log('=== Bobby 记忆向量化迁移 ===\n');

  // 1. 连接数据库
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/bobby';
  console.log(`连接数据库: ${uri}`);
  await mongoose.connect(uri);
  console.log('数据库连接成功\n');

  // 2. 加载 Embedding 模型
  console.log('加载 Embedding 模型...');
  await EmbeddingService.init();
  console.log(`模型就绪，维度: ${EmbeddingService.dimensions}\n`);

  // 3. 查找需要迁移的记录
  const total = await MemoryBlock.countDocuments({
    $or: [
      { embedding: { $exists: false } },
      { embedding: { $size: 0 } },
      { embedding: null }
    ]
  });

  console.log(`待迁移记录数: ${total}`);
  if (total === 0) {
    console.log('没有需要迁移的记录，退出。');
    await mongoose.disconnect();
    return;
  }

  // 4. 分批处理
  let processed = 0;
  let failed = 0;

  while (processed < total) {
    const batch = await MemoryBlock.find({
      $or: [
        { embedding: { $exists: false } },
        { embedding: { $size: 0 } },
        { embedding: null }
      ]
    }).limit(BATCH_SIZE).lean();

    if (batch.length === 0) break;

    const ops = [];
    for (const mem of batch) {
      try {
        const embedding = await EmbeddingService.getEmbedding(mem.content);
        ops.push({
          updateOne: {
            filter: { _id: mem._id },
            update: { $set: { embedding } }
          }
        });
      } catch (err) {
        failed++;
        console.error(`  [失败] ${mem.content.slice(0, 30)}...: ${err.message}`);
      }
    }

    if (ops.length > 0) {
      await MemoryBlock.bulkWrite(ops);
    }

    processed += batch.length;
    const pct = Math.min(100, Math.round(processed / total * 100));
    console.log(`  进度: ${processed}/${total} (${pct}%)`);
  }

  console.log(`\n迁移完成: 成功 ${processed - failed}，失败 ${failed}`);
  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error('迁移失败:', err);
  process.exit(1);
});
