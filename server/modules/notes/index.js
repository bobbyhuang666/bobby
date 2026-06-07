/**
 * NoteSystem — 碎片系统
 *
 * 管理 Bobby 的日常碎片（"动态"）。
 * 从 jobs/index.js 的 DAILY_NOTES 数组 + bobbyEngine.selectFragment() 抽取。
 *
 * 职责：
 *   - 碎片素材池管理
 *   - 基于状态/情绪的碎片选择策略
 *   - 天气碎片生成（委托 weather 模块）
 */

const { BOBBY_DEFAULTS } = require('../../config/bobbyDefaults');
const bcfg = BOBBY_DEFAULTS;

// ═══════════════════════════════════════════
// 通用碎片素材池（60 条）
// ═══════════════════════════════════════════

const DAILY_NOTES = [
  // ─── 日常琐事 ───
  '窗外的树好像又长高了一点。',
  '耳机线又打结了。',
  '手机屏碎了好久了。一直没修。',
  '泡面吃完了最后一包。',
  '看了一个很老的电影。还行。',
  '今天的月亮特别圆。',
  '发现一首很好听的歌。单曲循环了。',
  '手机相册弹出了去年的今天。',
  '突然想学吉他。但大概不会真的去。',
  '睡不着，数了一下天花板上的裂纹。',
  '窗外有一只鸟一直在叫。叫了很久。',
  '泡了一杯茶。忘了喝。凉了。',
  '手机电量到1%的时候充上了。松了口气。',
  '发现袜子破了一个洞。但只破了一只。',
  '风把门吹关了。吓了一跳。',
  '枕头底下翻出一张过期的电影票。字已经看不清了。',
  '半夜听到救护车的声音。希望没事。',

  // ─── 厦门日常 ───
  '楼下的猫又来了。给它倒了点水。',
  '下雨了。潮得衣服都干不了。',
  '海边走了一圈。浪挺大的。',
  '今天的晚霞是粉色的。拍了一张。',
  '天气太热了。风扇吹的都是热风。',
  '隔壁的灯又亮到很晚。不知道在干嘛。',
  '台风要来了。窗户关紧了。',
  '洗完澡头发一直干不了。好烦。',
  '快递到了。但忘了买的是什么。',
  '冰箱里只剩一个鸡蛋了。',
  '今天走了很多路。鞋有点磨脚。',
  '剪了指甲。突然觉得手好轻。',
  '书翻到一半就困了。明天继续。',
  '下楼扔垃圾。外面比想象中冷。',
  '把桌面收拾了一下。干净了五分钟。',
  '手机又弹出系统更新。算了。',
  '路过花店。没买。但心情好了一点。',
  '便利店的关东煮。萝卜最好吃。',
  '刷到一个很无聊的视频。但看完了。',
  '耳机只剩一只还有声。另一只坏了。',

  // ─── 感官细节 ───
  '晾在阳台的袜子少了一只。',
  '桌上的水杯没盖盖子。',
  '冰箱嗡嗡响了一整晚。',
  '门关上的声音。现在还在耳朵里回响。',
  '被子晒过太阳的味道。',
  '楼下的桂花开了。香味飘上来了。',
  '拖鞋湿了。不知道谁踩的。',
  '充电线接触不良。要找特定角度才能充上。',
  '闹钟设错了。提前一小时醒了。',
  '蚊子在耳边嗡嗡响。找不到它。',

  // ─── 小确幸/小烦恼 ───
  '便利店阿姨送了一根棒棒糖。不知道为什么。',
  '下公交车的时候。司机等了我一下。',
  '自动贩卖机卡住了。拍了一下。好了。',
  '下雨没带伞。在屋檐下站了十分钟。',
  '手机掉地上了。还好没碎。',
  '路过奶茶店。犹豫了一下。没买。',
  '公交车上让了个座。对方说了声谢谢。',
  '快递小哥把包裹放在门口。淋了点雨。',
  '外卖到了。但不是我点的那份。',
  '共享单车被人骑走了。走回去的。',
];

// ═══════════════════════════════════════════
// 核心 API
// ═══════════════════════════════════════════

class NoteSystem {
  /**
   * 获取通用碎片池（只读副本）
   * @returns {string[]}
   */
  static getDailyPool() {
    return DAILY_NOTES;
  }

  /**
   * 状态感知碎片选择
   *
   * 优先级：
   *   1. 状态专属碎片（60% 概率尝试）
   *   2. 情绪倾向碎片（valence 偏离中性时）
   *   3. 通用碎片池
   *
   * @param {Object} options
   * @param {string} [options.status] - 当前状态
   * @param {Object} [options.emotionEngine] - EmotionEngine 实例（用于 valence 判断）
   * @returns {string}
   */
  static selectFragment({ status, emotionEngine } = {}) {
    const stateFragments = bcfg.stateFragments || {};
    const emotionFragments = bcfg.emotionFragments || {};

    // 60% 概率尝试状态专属碎片
    if (status && Math.random() < 0.6 && stateFragments[status]) {
      const pool = stateFragments[status];
      return pool[Math.floor(Math.random() * pool.length)];
    }

    // 情绪倾向碎片（valence 偏离中性时）
    if (emotionEngine && emotionEngine.getValence) {
      const valence = emotionEngine.getValence();
      const et = bcfg.emotionTransition;
      if (valence < et.negativeThreshold && emotionFragments.negative && Math.random() < 0.4) {
        return emotionFragments.negative[Math.floor(Math.random() * emotionFragments.negative.length)];
      }
      if (valence > et.positiveThreshold && emotionFragments.positive && Math.random() < 0.4) {
        return emotionFragments.positive[Math.floor(Math.random() * emotionFragments.positive.length)];
      }
    }

    // 兜底：通用碎片池
    return DAILY_NOTES[Math.floor(Math.random() * DAILY_NOTES.length)];
  }

  /**
   * 生成天气相关碎片（委托 weather 模块）
   * @returns {Promise<string|null>}
   */
  static async generateWeatherNote() {
    const { generateWeatherNote } = require('../weather');
    return generateWeatherNote();
  }
}

module.exports = { NoteSystem, DAILY_NOTES };
