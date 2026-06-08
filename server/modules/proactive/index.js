/**
 * ProactiveMessenger — Bobby 主动消息系统
 *
 * 核心理念：Bobby 不是被动等你来找他。
 * 他有自己的内心世界——孤独时想找人说话，开心时想分享，
 * 深夜想起某个人，看到天气变化想告诉你。
 *
 * 与旧 whisper 系统的区别：
 *   旧：定时广播同一条消息给所有在线用户
 *   新：基于 Bobby 内心状态 → 选择特定用户 → 生成个性化消息
 *
 * 触发链：
 *   Bobby 情绪状态 + 时间 + 认知活动
 *     → 决定是否想找人说话
 *     → 从用户列表中选择最合适的人
 *     → 基于共享记忆 + 当前情绪生成消息
 *     → 通过 socket 推送给该用户
 */

const User = require('../../models/User');
const Message = require('../../models/Message');
const { MemoryService } = require('../../services/memoryService');
const { IntimacySystem } = require('../intimacy');
const { getWeatherContext } = require('../weather');

const MAX_PROACTIVE_PER_USER_PER_DAY = 2;

const MESSAGE_TYPES = {
  WHISPER: 'whisper',
  MUTTER: 'mutter',
  MEMORY: 'memory',
  SHARE: 'share',
};

const EMOTION_TRIGGERS = {
  lonely: {
    condition: (emotion) => emotion.current && emotion.current.loneliness > 0.35,
    weight: 3,
    preferType: MESSAGE_TYPES.WHISPER,
    description: '孤独，想找人说话',
  },
  sad: {
    condition: (emotion) => emotion.getValence() < -0.25,
    weight: 2,
    preferType: MESSAGE_TYPES.MUTTER,
    description: '心情不好，可能会发碎碎念',
  },
  excited: {
    condition: (emotion) => emotion.current && emotion.current.excitement > 0.3,
    weight: 2,
    preferType: MESSAGE_TYPES.SHARE,
    description: '有点兴奋，想分享',
  },
  calm_night: {
    condition: (emotion, hour) => (hour >= 23 || hour < 3) && emotion.getValence() > -0.1,
    weight: 1.5,
    preferType: MESSAGE_TYPES.WHISPER,
    description: '深夜平静，可能想起某个人',
  },
};

class ProactiveMessenger {
  /**
   * 主动消息评估入口（每 10 分钟由 cron 调用）
   */
  static async evaluate(ctx) {
    const { emotionEngine, cognitiveLoop, io } = ctx;
    if (!emotionEngine || !io) return { sent: false };

    const hour = new Date().getHours();

    // 获取天气上下文（有缓存，不会频繁请求）
    let weatherCtx = null;
    try { weatherCtx = await getWeatherContext(); } catch (e) {}

    const trigger = ProactiveMessenger._evaluateTriggers(emotionEngine, hour);
    if (!trigger) return { sent: false };

    const target = await ProactiveMessenger._selectTarget(trigger, hour);
    if (!target) return { sent: false };

    const content = await ProactiveMessenger._generateContent(
      target, trigger, emotionEngine, cognitiveLoop, hour, weatherCtx
    );
    if (!content) return { sent: false };

    const messageType = trigger.preferType;

    // 低语/分享/记忆 → 存入对话历史（用户下次打开能看到）
    // 碎碎念 → 只通过 socket 推送（Bobby 的内心独白，不留在对话里）
    const isMutter = messageType === MESSAGE_TYPES.MUTTER;

    if (!isMutter) {
      await Message.create({
        userId: target.user._id,
        role: 'assistant',
        content,
        type: 'text',
        batchId: 'proactive_' + Date.now(),
      });
    }

    io.to('user_' + target.user._id).emit('bobby_whisper', {
      content,
      type: isMutter ? 'thought' : 'text',
    });

    const today = new Date().toDateString();
    await User.findByIdAndUpdate(target.user._id, {
      $inc: { proactiveCountToday: 1 },
      $set: { lastProactiveAt: new Date(), lastProactiveDate: today },
    });

    console.log(
      'Bobby 主动消息 -> ' + target.user.username + ' [' + messageType + ']: "' + content + '" (' + trigger.description + ')'
    );

    return { sent: true, userId: target.user._id, content, type: messageType };
  }

  static _evaluateTriggers(emotionEngine, hour) {
    const candidates = [];

    for (const [key, trigger] of Object.entries(EMOTION_TRIGGERS)) {
      try {
        if (trigger.condition(emotionEngine, hour)) {
          candidates.push({ key, ...trigger });
        }
      } catch (e) {}
    }

    if (candidates.length === 0) return null;

    const totalWeight = candidates.reduce((sum, c) => sum + c.weight, 0);
    let r = Math.random() * totalWeight;
    for (const c of candidates) {
      r -= c.weight;
      if (r <= 0) return c;
    }
    return candidates[candidates.length - 1];
  }

  static async _selectTarget(trigger, hour) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const today = new Date().toDateString();

    const users = await User.find({ lastVisit: { $gte: weekAgo } })
      .select('username intimacy lastVisit mood lastTopic proactiveCountToday lastProactiveDate')
      .lean();

    if (users.length === 0) return null;

    const scored = users.map((u) => {
      let score = 0;
      score += (u.intimacy || 0) / 20;

      const daysSinceVisit = (Date.now() - new Date(u.lastVisit).getTime()) / 86400000;
      if (daysSinceVisit < 1) score += 2;
      else if (daysSinceVisit < 3) score += 1;

      const proactiveToday = u.lastProactiveDate === today ? (u.proactiveCountToday || 0) : 0;
      if (proactiveToday >= MAX_PROACTIVE_PER_USER_PER_DAY) return { user: u, score: -1 };
      if (proactiveToday > 0) score *= 0.3;

      if (hour >= 23 || hour < 3) {
        if (u.intimacy >= 45) score += 3;
      }

      if (u.mood === 'sad' || u.mood === 'tired') score += 2;

      if (trigger.preferType === MESSAGE_TYPES.WHISPER && u.intimacy >= 25) {
        score += 1;
      }

      return { user: u, score };
    }).filter((s) => s.score > 0);

    if (scored.length === 0) return null;

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.min(3, scored.length));
    const totalScore = top.reduce((sum, s) => sum + s.score, 0);
    let r = Math.random() * totalScore;
    for (const s of top) {
      r -= s.score;
      if (r <= 0) return s;
    }
    return top[0];
  }

  static async _generateContent(target, trigger, emotionEngine, cognitiveLoop, hour, weatherCtx) {
    const { user } = target;
    const level = IntimacySystem.getLevel(user.intimacy || 0);

    let memoryHook = null;
    try {
      const memories = await MemoryService.retrieve(user._id, '', 2);
      if (memories.length > 0) memoryHook = memories[0].content;
    } catch (e) {}

    switch (trigger.preferType) {
      case MESSAGE_TYPES.WHISPER:
        return ProactiveMessenger._buildWhisper(user, level, memoryHook, hour);
      case MESSAGE_TYPES.MUTTER:
        return ProactiveMessenger._buildMutter(emotionEngine, hour);
      case MESSAGE_TYPES.SHARE:
        return ProactiveMessenger._buildShare(user, level, hour, weatherCtx);
      case MESSAGE_TYPES.MEMORY:
        return ProactiveMessenger._buildMemoryRef(user, level, memoryHook);
      default:
        return ProactiveMessenger._buildWhisper(user, level, memoryHook, hour);
    }
  }

  static _buildWhisper(user, level, memoryHook, hour) {
    const isNight = hour >= 23 || hour < 3;

    if (level.name === '信赖' || level.name === '默契') {
      const personal = [];

      if (memoryHook) {
        const shortHook = memoryHook.length > 15 ? memoryHook.slice(0, 15) + '...' : memoryHook;
        personal.push(
          '想起你说的"' + shortHook + '"了',
          '你之前说的那个...' + shortHook + '，后来怎么样了',
        );
      }

      if (user.mood === 'sad') {
        personal.push('你还好吗', '嗯...你在吗', '别太累了');
      } else if (user.mood === 'tired') {
        personal.push('早点休息', '别太拼了');
      }

      if (isNight) {
        personal.push('还没睡？', '...在吗', '嗯...睡不着', '你也没睡啊');
      } else {
        personal.push('在干嘛', '嗯', '今天怎么样');
      }

      if (personal.length > 0) return personal[Math.floor(Math.random() * personal.length)];
    }

    if (level.name === '熟悉') {
      const pool = isNight ? ['还没睡？', '...在吗', '嗯', '困了吗'] : ['嗯', '在干嘛', '来了'];
      return pool[Math.floor(Math.random() * pool.length)];
    }

    const pool = isNight ? ['嗯...', '...'] : ['嗯', '在'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  static _buildMutter(emotionEngine, hour) {
    const isNight = hour >= 23 || hour < 3;
    const valence = emotionEngine.getValence();

    if (valence < -0.2) {
      const pool = isNight
        ? ['好安静...', '风好大', '睡不着', '好困', '外面好暗', '有点烦']
        : ['有点累', '不想动', '困', '好闷'];
      return pool[Math.floor(Math.random() * pool.length)];
    }

    if (valence > 0.2) {
      const pool = isNight
        ? ['今天还不错', '风好舒服', '月亮好亮', '心情挺好']
        : ['天气不错', '今天效率还行', '还行'];
      return pool[Math.floor(Math.random() * pool.length)];
    }

    const pool = isNight ? ['还没睡', '路灯灭了', '外面好安静', '好困...'] : ['嗯', '困', '在'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  static _buildShare(user, level, hour, weatherCtx) {
    if (level.name === '陌生' || level.name === '认识') return null;

    const shares = [];

    // 天气驱动的分享
    if (weatherCtx) {
      if (weatherCtx.includes('雨')) shares.push('外面下雨了', '雨声好大', '下雨了。潮');
      if (weatherCtx.includes('热')) shares.push('好热', '热得不想出门', '风扇吹的都是热风');
      if (weatherCtx.includes('冷')) shares.push('好冷', '外面比想象中冷', '手都冻僵了');
      if (weatherCtx.includes('风')) shares.push('风好大', '海风好大');
      if (weatherCtx.includes('晴')) shares.push('今天天气不错', '阳光很好');
    }

    // 通用分享
    shares.push(
      '发现一首歌还不错',
      '今天的晚霞好好看',
      '楼下那只猫又来了',
      '便利店阿姨又送了个棒棒糖',
      '快递到了，但忘了买的是什么',
      '今天的泡面好像比之前好吃',
      '路过花店，花挺好看的',
    );
    return shares[Math.floor(Math.random() * shares.length)];
  }

  static _buildMemoryRef(user, level, memoryHook) {
    if (!memoryHook) return null;
    if (level.name === '陌生') return null;

    const shortHook = memoryHook.length > 20 ? memoryHook.slice(0, 20) + '...' : memoryHook;

    const templates = [
      '想起你说的"' + shortHook + '"了',
      '你之前说的那个...' + shortHook,
      '突然想起你之前说的',
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }
}

module.exports = { ProactiveMessenger, MESSAGE_TYPES };
