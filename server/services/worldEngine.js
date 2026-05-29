/**
 * Bobby 世界引擎
 *
 * 一个持续运行的"世界"，为 Bobby 生成各种事件。
 * Bobby 不只是在回复用户，它生活在一个真实的世界里——
 * 天气会变、节假日会来、新闻会发生、生活会出意外。
 *
 * 数据来源：
 * - 天气：Open-Meteo API（已有）
 * - 节假日：中国法定节假日 + 二十四节气
 * - 新闻：RSS/新闻 API
 * - 生活事件：LLM 生成 + 事件库
 */

const mongoose = require('mongoose');
const { getWeatherContext } = require('./weatherService');

// ===== 事件 Schema =====
const eventSchema = new mongoose.Schema({
  // 事件类型
  type: {
    type: String,
    enum: ['weather', 'holiday', 'news', 'life', 'social', 'seasonal', 'mood', 'school', 'work'],
    required: true
  },
  // 事件内容
  content: { type: String, required: true },
  // 事件来源
  source: { type: String },  // 'open-meteo' / 'holiday' / 'news' / 'llm' / 'life'
  // 事件影响
  effects: {
    mood: { type: Map, of: Number },  // 情绪影响
    statusOverride: { type: String },  // 临时状态覆盖
    conversationTopic: { type: String } // 对话话题
  },
  // 事件时间
  eventTime: { type: Date, default: Date.now },
  // 是否已使用（避免重复）
  used: { type: Boolean, default: false },
  // 使用次数
  usedCount: { type: Number, default: 0 }
}, { timestamps: true });

const WorldEvent = mongoose.model('WorldEvent', eventSchema);

// ===== 节假日数据库（中国法定节假日 + 常见日子）=====
const HOLIDAYS = {
  '1-1': { name: '元旦', mood: 'calm', thought: '新的一年了...去年好像什么都没做' },
  '2-14': { name: '情人节', mood: 'lonely', thought: '朋友圈都在秀恩爱...' },
  '3-8': { name: '妇女节', mood: 'neutral', thought: '' },
  '4-5': { name: '清明节', mood: 'sad', thought: '要回泉州祭祖了' },
  '5-1': { name: '劳动节', mood: 'tired', thought: '打工的地方人好多' },
  '5-20': { name: '520', mood: 'lonely', thought: '又是一个人的一天' },
  '6-1': { name: '儿童节', mood: 'calm', thought: '好怀念小时候' },
  '6-18': { name: '端午节', mood: 'calm', thought: '泉州应该在赛龙舟了' },
  '9-10': { name: '教师节', mood: 'neutral', thought: '' },
  '10-1': { name: '国庆节', mood: 'tired', thought: '打工的地方人好多' },
  '10-31': { name: '万圣节', mood: 'neutral', thought: '厦门没什么氛围' },
  '11-11': { name: '双十一', mood: 'neutral', thought: '没什么想买的' },
  '12-24': { name: '平安夜', mood: 'calm', thought: '街上好热闹' },
  '12-25': { name: '圣诞节', mood: 'calm', thought: '厦门的圣诞氛围一般般' },
  '12-31': { name: '跨年', mood: 'calm', thought: '又一年了...' },
  // 学校相关
  '9-1': { name: '开学', mood: 'tired', thought: '又开学了...' },
  '1-15': { name: '期末', mood: 'nervous', thought: '论文还没写...' },
  '6-20': { name: '暑假', mood: 'calm', thought: '终于放假了' },
  '7-1': { name: '暑假中期', mood: 'bored', thought: '暑假好无聊' },
};

// ===== 节气 =====
const SOLAR_TERMS = [
  '小寒', '大寒', '立春', '雨水', '惊蛰', '春分',
  '清明', '谷雨', '立夏', '小满', '芒种', '夏至',
  '小暑', '大暑', '立秋', '处暑', '白露', '秋分',
  '寒露', '霜降', '立冬', '小雪', '大雪', '冬至'
];

// ===== 生活事件库（按类别）=====
const LIFE_EVENTS = {
  weather: [
    '今天风好大，窗户一直在响',
    '下雨了，没带伞',
    '天气突然变热了',
    '今天降温了，好冷',
    '外面好潮，衣服干不了',
    '台风要来了，窗户关紧了'
  ],
  life: [
    '楼下便利店换了个新店员',
    '公交今天又晚点了',
    '手机收到一条快递短信，但不知道买的什么',
    '楼上不知道在干嘛，咚咚响',
    '隔壁的灯又亮到很晚',
    '发现楼下新开了家店',
    '洗衣机坏了，得去投币的那家',
    '手机相册弹出了去年的今天',
    '充电线又找不到在哪了',
    '钥匙差点忘带'
  ],
  social: [
    '高中同学群里有人发了消息，没回',
    '泉州老妈打了电话，说了两句就挂了',
    '打工的同事今天请假了',
    '同学发了朋友圈，在旅游',
    '有人加我微信，没通过',
    '高中同学结婚了，发了请帖'
  ],
  school: [
    '老师点名了，幸好在',
    '论文导师催了',
    '同学问我借笔记，我没记',
    '下节课要交作业，还没写',
    '图书馆没位置了',
    '选课系统崩了'
  ],
  work: [
    '今天客人特别多',
    '老板让我多加班',
    '收银的时候算错了钱',
    '同事跟我换了班',
    '今天没什么人，站了一天',
    '到了一批临期便当，可以打折拿'
  ],
  mood: [
    '今天莫名烦躁',
    '突然想起高中的事',
    '晚上看到月亮，有点想家',
    '走在路上突然觉得好孤独',
    '今天效率还不错',
    '下午发了一下午呆'
  ]
};

// ===== 世界引擎 =====
class WorldEngine {

  // 初始化
  static async init() {
    // 检查是否已有今日事件，没有则生成
    const today = new Date().toDateString();
    const todayEvents = await WorldEvent.countDocuments({
      eventTime: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0)),
        $lt: new Date(new Date().setHours(23, 59, 59, 999))
      }
    });

    if (todayEvents === 0) {
      await this.generateDailyEvents();
    }
  }

  // 生成每日事件（每天运行一次）
  static async generateDailyEvents() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const dateKey = `${month}-${day}`;

    // 1. 检查节假日
    if (HOLIDAYS[dateKey]) {
      await this.addEvent({
        type: 'holiday',
        content: `今天是${HOLIDAYS[dateKey].name}`,
        source: 'holiday',
        effects: {
          mood: { [HOLIDAYS[dateKey].mood]: 0.3 },
          conversationTopic: HOLIDAYS[dateKey].thought
        }
      });
    }

    // 2. 天气事件
    try {
      const weatherCtx = await getWeatherContext();
      if (weatherCtx) {
        await this.addEvent({
          type: 'weather',
          content: `今天厦门天气：${weatherCtx}`,
          source: 'open-meteo',
          effects: {
            mood: this._weatherToMood(weatherCtx)
          }
        });
      }
    } catch (e) {
      // 天气获取失败
    }

    // 3. 生活事件（随机抽取 3-5 件）
    const categories = Object.keys(LIFE_EVENTS);
    const numEvents = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < numEvents; i++) {
      const cat = categories[Math.floor(Math.random() * categories.length)];
      const pool = LIFE_EVENTS[cat];
      const content = pool[Math.floor(Math.random() * pool.length)];

      await this.addEvent({
        type: cat,
        content,
        source: 'life',
        effects: {
          mood: this._eventToMood(cat)
        }
      });
    }

    console.log(`世界引擎：生成了 ${numEvents + 2} 个日常事件`);
  }

  // 用 LLM 生成动态事件（根据当前情境）
  static async generateDynamicEvent(bobbyStatus, weatherContext, recentEvents) {
    const aiService = require('./aiService');

    const recentContent = (recentEvents || []).slice(0, 3).map(e => e.content).join('；');

    const messages = [
      {
        role: 'system',
        content: `你是一个事件生成器。根据 Bobby 的当前状态，生成一件可能发生在他身上的小事。

Bobby 当前状态：${bobbyStatus}
天气：${weatherContext || '未知'}
最近已发生的事件：${recentContent || '无'}

要求：
- 事件要具体、真实、像大学生的日常
- 不要太戏剧化，就是普通生活中的小事
- 10-20个字
- 用中文
- 不要重复已有的事件
- 输出事件内容，不要加任何解释`
      }
    ];

    try {
      const event = await aiService.callDeepSeek(messages, { maxTokens: 30, temperature: 0.95 });
      if (event && event.length > 5) {
        return await this.addEvent({
          type: 'life',
          content: event,
          source: 'llm',
          effects: { mood: {} }
        });
      }
    } catch (e) {
      // LLM 调用失败
    }
    return null;
  }

  // 获取今日事件（用于 prompt 注入）
  static async getTodayEvents(limit = 5) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return WorldEvent.find({
      eventTime: { $gte: today },
      used: false
    })
      .sort({ eventTime: -1 })
      .limit(limit)
      .lean();
  }

  // 获取未使用的事件（用于对话注入）
  static async getUnusedEvents(limit = 3) {
    return WorldEvent.find({ used: false })
      .sort({ eventTime: -1 })
      .limit(limit)
      .lean();
  }

  // 标记事件已使用
  static async markUsed(eventId) {
    await WorldEvent.findByIdAndUpdate(eventId, {
      used: true,
      $inc: { usedCount: 1 }
    });
  }

  // 添加事件
  static async addEvent(eventData) {
    return WorldEvent.create({
      ...eventData,
      eventTime: new Date(),
      used: false,
      usedCount: 0
    });
  }

  // 清理旧事件（保留最近 7 天）
  static async cleanup() {
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    await WorldEvent.deleteMany({ eventTime: { $lt: weekAgo } });
  }

  // ===== 辅助方法 =====

  static _weatherToMood(weatherCtx) {
    if (!weatherCtx) return {};
    if (/下雨|雨/.test(weatherCtx)) return { sadness: 0.1, calm: 0.1 };
    if (/热|高温/.test(weatherCtx)) return { frustration: 0.1 };
    if (/冷|降温/.test(weatherCtx)) return { sadness: 0.1 };
    if (/风/.test(weatherCtx)) return { interest: 0.05 };
    return {};
  }

  static _eventToMood(category) {
    switch (category) {
      case 'life': return { interest: 0.05 };
      case 'social': return { loneliness: 0.1 };
      case 'school': return { frustration: 0.1, nervousness: 0.05 };
      case 'work': return { tired: 0.1 };
      case 'mood': return { sadness: 0.1 };
      default: return {};
    }
  }
}

module.exports = { WorldEngine, WorldEvent };
