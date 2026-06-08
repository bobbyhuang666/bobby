/**
 * Bobby Embedding Service
 *
 * 使用 @xenova/transformers 在 Node.js 本地运行中文 Embedding 模型。
 * 模型：bge-small-zh-v1.5（~90MB，初次运行自动下载并缓存）
 * 维度：384
 *
 * 设计为单例：模型只加载一次，后续调用直接复用。
 * 零外部 API 依赖，零额外数据库。
 */

// @xenova/transformers 是 ESM 模块，需要用动态 import
let pipeline = null;

const MODEL_NAME = 'Xenova/bge-small-zh-v1.5';
const VECTOR_DIM = 384;

// 查询前缀（BGE 模型要求查询时加 "为这个句子生成表示以用于检索相关文章：" 前缀）
const QUERY_PREFIX = '为这个句子生成表示以用于检索相关文章：';

class EmbeddingService {
  static _extractor = null;
  static _loading = null; // 防止并发加载

  /**
   * 初始化模型（单例，首次调用时下载并缓存）
   */
  static async init() {
    if (this._extractor) return;

    // 防止并发初始化
    if (this._loading) {
      await this._loading;
      return;
    }

    this._loading = (async () => {
      console.log('[Embedding] 加载本地向量模型 (bge-small-zh-v1.5)...');
      const start = Date.now();
      // ESM 动态导入
      const { pipeline: pl } = await import('@xenova/transformers');
      pipeline = pl;
      this._extractor = await pipeline('feature-extraction', MODEL_NAME, {
        quantized: true,
      });
      console.log(`[Embedding] 模型加载完成，耗时 ${Date.now() - start}ms，维度 ${VECTOR_DIM}`);
    })();

    await this._loading;
    this._loading = null;
  }

  /**
   * 将文本转为向量（用于存储记忆时）
   * @param {string} text
   * @returns {Promise<number[]>}
   */
  static async getEmbedding(text) {
    if (!this._extractor) await this.init();

    const output = await this._extractor(text, {
      pooling: 'cls',
      normalize: true, // L2 归一化，点积即余弦相似度
    });

    return Array.from(output.data);
  }

  /**
   * 将查询文本转为向量（用于检索时，加 BGE 查询前缀）
   * @param {string} text
   * @returns {Promise<number[]>}
   */
  static async getQueryEmbedding(text) {
    // BGE 模型：查询需要加前缀才能获得最佳检索效果
    return this.getEmbedding(QUERY_PREFIX + text);
  }

  /**
   * 余弦相似度（向量已 L2 归一化，点积即余弦）
   * @param {number[]} vecA
   * @param {number[]} vecB
   * @returns {number} -1 ~ 1
   */
  static cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dot = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
    }
    return dot;
  }

  /**
   * 是否已初始化
   */
  static get isReady() {
    return !!this._extractor;
  }

  /**
   * 向量维度
   */
  static get dimensions() {
    return VECTOR_DIM;
  }
}

module.exports = EmbeddingService;
