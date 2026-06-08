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
const { SocialEngine } = require('../social');
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
  static _social = new SocialEngine();
  /**
   * 获取通用碎片池（只读副本）
   * @returns {string[]}
   */
  static getDailyPool() {
    return [...DAILY_NOTES];
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
  /**
   * V2: 情绪驱动 + 社交感知碎片选择
   *
   * 策略优先级：
   *   1. 20% 社交碎片（Bobby 与朋友的互动/想法）
   *   2. 35% 状态专属碎片
   *   3. 25% 情绪驱动碎片（基于 valence + arousal 组合）
   *   4. 20% 通用碎片池
   */
  static selectFragment({ status, emotionEngine } = {}) {
    const stateFragments = bcfg.stateFragments || {};
    const emotionFragments = bcfg.emotionFragments || {};

    // V2: 20% 社交碎片
    if (NoteSystem._social && Math.random() < 0.20) {
      const socialNote = NoteSystem._social.generateSocialNote({ emotionEngine });
      if (socialNote) return socialNote;
    }

    // 35% 状态专属碎片
    if (status && Math.random() < 0.35 && stateFragments[status]) {
      const pool = stateFragments[status];
      return pool[Math.floor(Math.random() * pool.length)];
    }

    // V2: 情绪驱动碎片 — 基于 valence + arousal 组合
    if (emotionEngine) {
      const valence = emotionEngine.getValence ? emotionEngine.getValence() : 0;
      const arousal = emotionEngine.getArousal ? emotionEngine.getArousal() : 0.5;

      // 高唤醒 + 负面 → 焦虑/烦躁碎片
      if (valence < -0.15 && arousal > 0.6 && Math.random() < 0.5) {
        const anxious = [
          '有点烦。不知道在烦什么。',
          '心里乱乱的。静不下来。',
          '想做点什么。但不知道做什么。',
          '拿起手机又放下了。',
          '翻来翻去。找不到舒服的姿势。',
        ];
        return anxious[Math.floor(Math.random() * anxious.length)];
      }

      // 低唤醒 + 负面 → 低落/疲惫碎片
      if (valence < -0.15 && arousal <= 0.6 && Math.random() < 0.5) {
        const low = [
          '什么都不想做。',
          '有点累。不是身体累。',
          '就这样吧。',
          '困了。但不想睡。',
          '好安静。外面也是。',
        ];
        return low[Math.floor(Math.random() * low.length)];
      }

      // 高唤醒 + 正面 → 兴奋/开心碎片
      if (valence > 0.2 && arousal > 0.5 && Math.random() < 0.4) {
        const excited = [
          '今天还不错。',
          '心情挺好的。不知道为什么。',
          '笑了一下。不知道在笑什么。',
          '天气好，出去走了一下。',
          '风好舒服。',
        ];
        return excited[Math.floor(Math.random() * excited.length)];
      }

      // 低唤醒 + 正面 → 平静/满足碎片
      if (valence > 0.2 && arousal <= 0.5 && Math.random() < 0.4) {
        const calm = [
          '挺好的。',
          '阳光很好。暖暖的。',
          '路过花店。花很好看。',
          '今天晚霞是粉色的。',
          '安静。但不无聊。',
        ];
        return calm[Math.floor(Math.random() * calm.length)];
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

  /**
   * V2: 情绪驱动碎片生成（委托 aiService → LLM）
   * 基于 Bobby 当前的真实情绪状态，用 LLM 生成一条情感碎片
   */
  static async generateEmotionNote({ emotionEngine, status, weatherContext, socialContext, recentThoughts } = {}) {
    try {
      const ai = require('../../services/aiService');
      return await ai.generateEmotionNote({ emotionEngine, status, weatherContext, socialContext, recentThoughts });
    } catch (e) {
      return null;
    }
  }

  static composeContextualNote({ status, weatherContext, emotionEngine, hour } = {}) {
    const h = hour !== undefined ? hour : new Date().getHours();
    const isNight = h >= 23 || h < 3;
    const isRaining = weatherContext && weatherContext.includes('雨');
    const isHot = weatherContext && (weatherContext.includes('热') || weatherContext.includes('3'));
    const isCold = weatherContext && weatherContext.includes('冷');
    const isWindy = weatherContext && weatherContext.includes('风');
    const isSunny = weatherContext && weatherContext.includes('晴');

    // 情绪倾向
    let mood = 'neutral';
    if (emotionEngine && emotionEngine.getValence) {
      const v = emotionEngine.getValence();
      if (v < -0.2) mood = 'low';
      else if (v > 0.2) mood = 'warm';
    }

    // 天气 + 状态 组合模板
    const templates = [];

    // ─── 雨天专属 ───
    if (isRaining) {
      templates.push(
        '下雨了。窗户上全是水痕。',
        '雨声好大。在窗户边发了会呆。',
        '下雨了，出门忘带伞。',
        '雨停了。地上还有水坑。',
        '潮得衣服都干不了。',
        '空气里有泥土的味道。下雨了。',
      );
    }

    // ─── 高温天 ───
    if (isHot) {
      templates.push(
        '太热了。风扇吹的都是热风。',
        '热得不想出门。在屋里躺着。',
        '买了瓶冰水。瓶子外面全是水珠。',
        '出汗了。T恤黏在身上。',
      );
    }

    // ─── 大风天 ───
    if (isWindy) {
      templates.push(
        '海风好大。晾的衣服差点飞了。',
        '风把窗帘吹起来了。好几次。',
        '外面风好大。呼呼的。',
      );
    }

    // ─── 晴天 ───
    if (isSunny && !isHot) {
      templates.push(
        '今天天气不错。阳光很好。',
        '阳光照进来了。暖暖的。',
        '天气好，出去走了一下。还行。',
      );
    }

    // ─── 凉爽天 ───
    if (isCold) {
      templates.push(
        '下楼扔垃圾。外面比想象中冷。',
        '手有点凉。缩在袖子里。',
        '冷。不想出被窝。',
      );
    }

    // ─── 深夜专属 ───
    if (isNight) {
      templates.push(
        '手机屏幕的光太亮了。但不想关。',
        '外面偶尔有车经过的声音。',
        '翻了个身。被子有点潮。',
        '看了看时间。都这么晚了。',
      );
    }

    // ─── 情绪专属 ───
    if (mood === 'low') {
      templates.push(
        '不知道在烦什么。',
        '有点闷。说不上来。',
        '想一个人待一会儿。',
        '什么都不想做。',
        '有点累。不是身体累。',
        '手机拿起来又放下了。',
      );
    } else if (mood === 'warm') {
      templates.push(
        '今天还不错。',
        '心情挺好的。不知道为什么。',
        '笑了一下。不知道在笑什么。',
        '路过花店。花很好看。',
      );
    }

    if (templates.length === 0) return null;

    // 去重（避免和最近的碎片重复）
    const note = templates[Math.floor(Math.random() * templates.length)];
    return note;
  }


}

module.exports = { NoteSystem, DAILY_NOTES };
