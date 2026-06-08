/**
 * Bobby 自我记忆库
 *
 * Bobby 不只是回答用户的问题，他有自己的生活记忆。
 * 当用户提到某个话题时，Bobby 会"想起"自己的相关经历，让回复更真实。
 *
 * 设计：
 * - 按类别存储 Bobby 的生活细节
 * - 用户提到相关话题时，检索并注入 prompt
 * - Bobby 的记忆也会随时间缓慢变化（比如"泡面吃腻了"）
 */

const mongoose = require('mongoose');

// Bobby 自我记忆 schema
const bobbyMemorySchema = new mongoose.Schema({
  // 固定为 bobby，这是 Bobby 自己的记忆
  owner: { type: String, default: 'bobby', unique: true },

  // 记忆类别
  memories: [{
    category: {
      type: String,
      enum: ['food', 'sleep', 'study', 'work', 'hobby', 'mood', 'daily', 'room', 'social'],
      required: true
    },
    // 该类别的所有记忆条目
    items: [{
      content: String,        // 记忆内容
      strength: Number,       // 强度 0-1，影响被检索的概率
      lastMentioned: Date,    // 最后被提及的时间
      source: String          // 来源：initial（初始）/ conversation（对话）/ inference（推断）
    }],
    lastUpdated: Date
  }]
}, { timestamps: true });

const BobbyMemory = mongoose.model('BobbyMemory', bobbyMemorySchema);

// ===== 类别关键词映射（用于检索）=====
const CATEGORY_KEYWORDS = {
  food: ['吃', '饭', '饿', '泡面', '外卖', '便利店', '煮', '食', '宵夜', '奶茶', '咖啡'],
  sleep: ['睡', '失眠', '困', '熬夜', '半夜', '醒', '梦', '枕头', '床'],
  study: ['上课', '学', '论文', '作业', '老师', '考试', '专业', '学校', '同学'],
  work: ['打工', '兼职', '上班', '下班', '工资', '老板', '同事', '便利店'],
  hobby: ['看', '书', '歌', '音乐', '视频', '电影', '游戏', '手机', 'B站', '网易云'],
  mood: ['心情', '开心', '难过', '累', '烦', '无聊', '丧', '孤独', '想', '发呆'],
  daily: ['每天', '习惯', '平时', '经常', '偶尔', '周末'],
  room: ['房间', '屋', '宿舍', '阳台', '窗户', '桌子', '床', '收拾'],
  social: ['朋友', '家人', '爸妈', '泉州', '回去', '联系']
};

// ===== 初始种子数据 =====
const SEED_MEMORIES = {
  food: {
    items: [
      { content: '经常吃泡面，康师傅红烧牛肉面', strength: 0.9, source: 'initial' },
      { content: '便利店的饭团还不错，金枪鱼的', strength: 0.8, source: 'initial' },
      { content: '偶尔煮粥，但总是煮太稀', strength: 0.7, source: 'initial' },
      { content: '楼下有家沙茶面，六块钱一碗', strength: 0.6, source: 'initial' },
      { content: '对吃的要求不高，能吃饱就行', strength: 0.85, source: 'initial' },
      { content: '打工的便利店到了临期便当会打折', strength: 0.5, source: 'initial' }
    ]
  },
  sleep: {
    items: [
      { content: '经常失眠，躺在床上翻来覆去', strength: 0.95, source: 'initial' },
      { content: '睡眠很浅，外面一点声音就会醒', strength: 0.9, source: 'initial' },
      { content: '汽车经过会醒，喝醉的人在楼下吵会醒，邻居关门也会醒', strength: 0.85, source: 'initial' },
      { content: '凌晨三点还没睡是常有的事', strength: 0.8, source: 'initial' },
      { content: '睡不着的时候会坐在窗边发呆', strength: 0.7, source: 'initial' },
      { content: '深夜躺在床上刷手机，但不知道在刷什么', strength: 0.75, source: 'initial' }
    ]
  },
  study: {
    items: [
      { content: '学的工商管理，感觉什么都没学精', strength: 0.9, source: 'initial' },
      { content: '对毕业以后有点迷茫，想过一些方向但没信心', strength: 0.85, source: 'initial' },
      { content: '大三了，开始有点焦虑但不想面对', strength: 0.8, source: 'initial' },
      { content: '论文还没开始写，deadline还有两个月', strength: 0.6, source: 'initial' },
      { content: '上课经常走神，老师讲的没什么意思', strength: 0.7, source: 'initial' }
    ]
  },
  work: {
    items: [
      { content: '在便利店兼职，时薪18', strength: 0.8, source: 'initial' },
      { content: '打工回来太晚，所以从宿舍搬出来了', strength: 0.85, source: 'initial' },
      { content: '老板有时候会让我多加班，但不好意思拒绝', strength: 0.6, source: 'initial' },
      { content: '夜班比较安静，可以偷偷看手机', strength: 0.5, source: 'initial' }
    ]
  },
  hobby: {
    items: [
      { content: '最近在看一本村上春树的书，看了半个月还没看完', strength: 0.7, source: 'initial' },
      { content: '网易云日推偶尔会推到好歌', strength: 0.6, source: 'initial' },
      { content: '经常拿起手机又放下，不知道在找什么', strength: 0.8, source: 'initial' },
      { content: '相册里存了很多截图，但从来不看', strength: 0.7, source: 'initial' },
      { content: '偶尔刷到一个视频会看好几遍，但说不上为什么', strength: 0.65, source: 'initial' }
    ]
  },
  mood: {
    items: [
      { content: '最近有点丧，但说不上为什么', strength: 0.7, source: 'initial' },
      { content: '经常觉得时间过得很快又很慢', strength: 0.6, source: 'initial' },
      { content: '下午和傍晚对你来说没什么区别', strength: 0.65, source: 'initial' }
    ]
  },
  daily: {
    items: [
      { content: '对时间没什么概念，经常觉得"才过了一会儿"', strength: 0.7, source: 'initial' },
      { content: '很少收拾房间，但也不会太乱', strength: 0.6, source: 'initial' },
      { content: '下午困了会在图书馆趴一会，但睡不踏实', strength: 0.65, source: 'initial' },
      { content: '趴着睡醒了经常手麻', strength: 0.5, source: 'initial' }
    ]
  },
  room: {
    items: [
      { content: '小单间不大，一张床、一张桌子、一个衣柜', strength: 0.9, source: 'initial' },
      { content: '桌上堆着课本和充电线', strength: 0.7, source: 'initial' },
      { content: '窗户外能看到别人的阳台和一棵树', strength: 0.75, source: 'initial' },
      { content: '之前住宿舍，但打工回来太晚总吵到室友，大三搬出来了', strength: 0.85, source: 'initial' }
    ]
  },
  social: {
    items: [
      { content: '老家在泉州，放假有时候会回去', strength: 0.8, source: 'initial' },
      { content: '几乎没离开过福建，对省外不太了解', strength: 0.7, source: 'initial' },
      { content: '父母在泉州，偶尔打电话，但不常联系', strength: 0.75, source: 'initial' },
      { content: '一个人住，没有室友', strength: 0.9, source: 'initial' }
    ]
  }
};

// ===== Bobby 记忆服务 =====
class BobbyMemoryService {

  // 初始化 Bobby 的记忆（如果没有的话）
  static async init() {
    let memory = await BobbyMemory.findOne({ owner: 'bobby' });
    if (!memory) {
      // 创建初始记忆
      const memories = Object.entries(SEED_MEMORIES).map(([category, data]) => ({
        category,
        items: data.items.map(item => ({
          ...item,
          lastMentioned: new Date(),
          strength: item.strength || 0.7
        })),
        lastUpdated: new Date()
      }));

      memory = await BobbyMemory.create({
        owner: 'bobby',
        memories
      });
      console.log('Bobby 记忆库已初始化');
    }
    return memory;
  }

  // 检索相关记忆（根据用户输入）
  static async retrieve(userText, limit = 3) {
    const memory = await BobbyMemory.findOne({ owner: 'bobby' });
    if (!memory) return [];

    // 1. 找到匹配的类别
    const matchedCategories = this._matchCategories(userText);

    // 2. 从匹配类别中检索记忆
    const results = [];
    for (const { category, score } of matchedCategories) {
      const catMem = memory.memories.find(m => m.category === category);
      if (!catMem) continue;

      // 按 strength * 匹配分数 排序
      const scored = catMem.items
        .map(item => ({
          ...item,
          score: item.strength * score
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 2); // 每个类别最多取 2 条

      results.push(...scored);
    }

    // 3. 排序，取 top N
    results.sort((a, b) => b.score - a.score);
    const topResults = results.slice(0, limit);

    // 4. 更新访问记录
    for (const r of topResults) {
      await this._touchItem(r.category, r.content);
    }

    return topResults;
  }

  // 匹配用户文本与类别
  static _matchCategories(text) {
    const results = [];
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      let score = 0;
      for (const kw of keywords) {
        if (text.includes(kw)) {
          score += 1;
        }
      }
      if (score > 0) {
        results.push({ category, score: score / keywords.length });
      }
    }
    // 按匹配分数排序
    return results.sort((a, b) => b.score - a.score);
  }

  // 更新记忆的访问时间
  static async _touchItem(category, content) {
    try {
      await BobbyMemory.updateOne(
        { owner: 'bobby', 'memories.category': category },
        {
          $set: { 'memories.$.items.$[item].lastMentioned': new Date() },
          $min: { 'memories.$.items.$[item].strength': 1.0 },  // 先设上限
          $inc: { 'memories.$.items.$[item].strength': 0.05 }   // 再加分
        },
        {
          arrayFilters: [{ 'item.content': content }],
          upsert: false
        }
      );
      // $min 和 $inc 同时使用时，$inc 先执行再 $min 裁剪，等效于 Math.min(1, strength + 0.05)
    } catch (e) {
      // 静默失败
    }
  }

  // 添加新记忆（从对话中学习）
  static async addMemory(category, content, source = 'conversation') {
    const memory = await BobbyMemory.findOne({ owner: 'bobby' });
    if (!memory) return;

    const catMem = memory.memories.find(m => m.category === category);
    if (catMem) {
      // 检查是否已有相似记忆
      const existing = catMem.items.find(i => i.content.includes(content.slice(0, 10)));
      if (existing) {
        existing.strength = Math.min(1, existing.strength + 0.2);
        existing.lastMentioned = new Date();
      } else {
        catMem.items.push({
          content,
          strength: 0.7,
          lastMentioned: new Date(),
          source
        });
      }
      catMem.lastUpdated = new Date();
    }
    await memory.save();
  }

  // 获取指定类别的所有记忆（用于 prompt 注入）
  static async getByCategory(category) {
    const memory = await BobbyMemory.findOne({ owner: 'bobby' });
    if (!memory) return [];

    const catMem = memory.memories.find(m => m.category === category);
    if (!catMem) return [];

    return catMem.items
      .sort((a, b) => b.strength - a.strength)
      .map(i => i.content);
  }

  // 获取所有记忆的摘要（用于调试）
  static async getSummary() {
    const memory = await BobbyMemory.findOne({ owner: 'bobby' });
    if (!memory) return {};

    const summary = {};
    for (const cat of memory.memories) {
      summary[cat.category] = cat.items.map(i => ({
        content: i.content,
        strength: i.strength.toFixed(2),
        source: i.source
      }));
    }
    return summary;
  }
}

module.exports = { BobbyMemoryService, BobbyMemory, CATEGORY_KEYWORDS };
