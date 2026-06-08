const cron = require('node-cron');
const Note = require('../models/Note');
const User = require('../models/User');
const Message = require('../models/Message');
const BobbyState = require('../models/BobbyState');
const aiService = require('../services/aiService');
const { MemoryService } = require('../services/memoryService');
const { getTimeLabel } = require('../utils/time');
const { getWeatherContext, generateWeatherNote } = require('../services/weatherService');
const { WorldEngine } = require('../services/worldEngine');
const { NoteSystem } = require('../modules/notes');
const { ProactiveMessenger } = require('../modules/proactive');
const { EVENT_TYPES } = require('../modules/social');

// Bobby 的碎片素材（委托 modules/notes）
const DAILY_NOTES = NoteSystem.getDailyPool();

const WHISPERS_NIGHT = ['还没睡？', '...在吗', '嗯...', '困了', '嗯', '外面好安静'];
const WHISPERS_DAY = ['嗯', '困', '来了'];
const MUTTERS_NIGHT = ['下雨了', '路灯灭了', '月亮挺亮的', '隔壁灯也灭了', '猫又来了', '好困...', '外面好安静'];
const MUTTERS_DAY = ['今天阳光不错', '树叶在晃', '有点饿了', '困', '风好大'];



// 记录世界事件（保留最近 30 条）
async function recordWorldEvent(type, content) {
  try {
    await BobbyState.findOneAndUpdate(
      { _singleton: 'bobby' },
      {
        $push: {
          worldEvents: {
            $each: [{ type, content, time: new Date() }],
            $slice: -30
          }
        }
      }
    );
  } catch (e) {}
}
function startJobs(bobbyEngine, io, sdkAdapter) {
  const hasAndy = !!sdkAdapter;

  // ===== Andy Tick：每 5 分钟推进 Andy 世界 =====
  if (hasAndy) {
    cron.schedule('*/5 * * * *', async () => {
      try {
        const result = await bobbyEngine.tickAndy();
        if (result && result.stateChanged) {
          console.log(`Andy tick: ${result.bobbyStatus} (tick #${result.time?.tick || '?'})`);
          await recordWorldEvent('status', result.bobbyStatus);
        }
      } catch (err) {
        console.error('Andy tick 失败:', err.message);
      }
    });
    console.log('Andy tick 定时任务已启动（每 5 分钟）');
  }

  // ===== 每 5 分钟推进状态机（Andy 未启用时使用 Bobby 自有状态机）=====
  cron.schedule('*/5 * * * *', async () => {
    try {
      await bobbyEngine.updateStatus();
    } catch (err) {
      console.error('状态更新失败:', err.message);
    }
  });

  // ===== V2: 每 20 分钟生成社交事件 =====
  cron.schedule('*/20 * * * *', async () => {
    try {
      const event = await bobbyEngine.tickSocial();
      if (event) {
        console.log('Bobby 社交事件: ' + event.content + ' [' + event.type + ']');
        await recordWorldEvent('social', event.content);

        // 社交温暖事件有概率推送给在线用户
        if (event.type === 'social_warmth' && io && Math.random() < 0.3) {
          io.emit('bobby_whisper', { content: event.content, type: 'thought' });
        }
      }
    } catch (err) {
      console.error('社交事件失败:', err.message);
    }
  });

  // ===== V2: 每 45 分钟 NPC 自主行为 =====
  cron.schedule('*/45 * * * *', async () => {
    try {
      const behavior = await bobbyEngine.tickNPCAutonomy();
      if (behavior) {
        console.log('NPC 自主行为: ' + behavior.friendName + ' - ' + behavior.content);
        await recordWorldEvent('npc_autonomous', behavior.content);
      }
    } catch (err) {
      console.error('NPC 自主行为失败:', err.message);
    }
  });

  // ===== 每 30 分钟：Reverie（沉思周期）=====
  cron.schedule('*/30 * * * *', async () => {
    try {
      if (!bobbyEngine.cognitive) return;
      const thought = await bobbyEngine.cognitive.reverie();
      if (thought) {
        console.log(`Bobby 沉思: ${thought}`);
      }
    } catch (err) {
      console.error('沉思周期失败:', err.message);
    }
  });

  // ===== 共享：获取 BobbyState 的辅助函数（减少重复查询）=====
  async function getBobbyState() {
    return BobbyState.findOne({ _singleton: 'bobby' });
  }

  // ===== 每 30 分钟检查是否生成碎片 =====
  cron.schedule('*/30 * * * *', async () => {
    try {
      const state = await getBobbyState();
      if (!state) return;

      const today = new Date().toDateString();

      // 每天最多 3 条碎片
      if (state.notesDate !== today) {
        state.notesToday = 0;
        state.notesDate = today;
      }

      if (state.notesToday >= 3) return;

      // 深夜概率更高
      const h = new Date().getHours();
      const chance = (h >= 22 || h < 3) ? 0.4 : 0.15;

      if (Math.random() > chance) return;

      // 碎片生成策略（按优先级）：
      //   0. 15% 情绪驱动 LLM 碎片（Bobby 此刻真实的感受，AI 生成）
      //   1. 20% 上下文感知碎片（状态 + 真实天气 + 情绪 → 组合生成）
      //   2. 10% 天气驱动碎片（纯天气模板）
      //   3. 10% 认知循环碎片（Bobby 的内心独白 → 发成动态）
      //   4. 10% 社交碎片（V2: Bobby 与朋友的互动/想法）
      //   5. 35% 状态感知碎片（情绪加权 + 状态专属池）
      let noteText;

      // 获取天气上下文（有 30 分钟缓存，不会频繁请求）
      let weatherCtx = '';
      try { weatherCtx = await getWeatherContext(); } catch (e) {}

      // V2: 策略 0 — 情绪驱动 LLM 碎片（Bobby 此刻真实的感受 → AI 生成）
      if (Math.random() < 0.15) {
        try {
          const socialCtx = bobbyEngine.getSocialContext ? bobbyEngine.getSocialContext() : null;
          const thoughts = bobbyEngine.cognitive ? bobbyEngine.cognitive.getRecentThoughts() : [];
          noteText = await NoteSystem.generateEmotionNote({
            emotionEngine: bobbyEngine.emotion,
            status: state.currentStatus,
            weatherContext: weatherCtx,
            socialContext: socialCtx,
            recentThoughts: thoughts,
          });
        } catch (e) {}
      }

      // 策略 1：上下文感知碎片（Bobby 此刻的真实感受）
      if (Math.random() < 0.20) {
        noteText = NoteSystem.composeContextualNote({
          status: state.currentStatus,
          weatherContext: weatherCtx,
          emotionEngine: bobbyEngine.emotion,
        });
      }

      // 策略 2：天气驱动碎片
      if (!noteText && Math.random() < 0.25) {
        noteText = await generateWeatherNote();
      }

      // 策略 3：认知循环碎片（Bobby 的真实想法）
      if (!noteText && bobbyEngine.cognitive && Math.random() < 0.15) {
        try {
          const thought = await bobbyEngine.cognitive.reverie();
          if (thought && thought.length <= 30 && !state.recentNoteTexts.includes(thought)) {
            noteText = thought;
          }
        } catch (e) {}
      }

      // 策略 4：社交碎片（V2）
      if (!noteText && bobbyEngine.social && Math.random() < 0.15) {
        noteText = bobbyEngine.social.generateSocialNote({ emotionEngine: bobbyEngine.emotion });
      }

      // 策略 5：状态感知碎片（情绪加权 + 状态专属池）（兜底）
      if (!noteText) {
        let attempts = 0;
        do {
          noteText = bobbyEngine.selectFragment
            ? bobbyEngine.selectFragment()
            : DAILY_NOTES[Math.floor(Math.random() * DAILY_NOTES.length)];
          attempts++;
        } while (state.recentNoteTexts.includes(noteText) && attempts < 10);
      }

      const now = new Date();
      await Note.create({
        content: noteText,
        timeLabel: getTimeLabel(),
        timeDetail: now.getHours().toString().padStart(2, '0') + ':' +
                    now.getMinutes().toString().padStart(2, '0'),
        publishedAt: now,
        bobbyStatus: state.currentStatus,
        type: 'daily'
      });

      // 原子更新碎片计数和记录，避免并发写入覆盖问题
      await BobbyState.findOneAndUpdate(
        { _singleton: 'bobby' },
        {
          $inc: { notesToday: 1 },
          $push: {
            recentNoteTexts: {
              $each: [noteText],
              $slice: -10  // 只保留最近 10 条
            }
          },
          $set: { notesDate: today }
        }
      );

      // 通知所有在线用户
      if (io) {
        io.emit('new_note', { content: noteText, timeDetail: now.toISOString() });
      }

      console.log('Bobby 发了新碎片: ' + noteText);
      await recordWorldEvent('note', noteText);
    } catch (err) {
      console.error('碎片生成失败:', err.message);
    }
  });

  // ===== 每 10 分钟：Bobby 主动消息（基于内心状态选择特定用户）=====
  cron.schedule('*/10 * * * *', async () => {
    try {
      // 全局低语计数重置（每天）
      const state = await getBobbyState();
      if (state) {
        const today = new Date().toDateString();
        if (state.whisperDate !== today) {
          state.whisperCount = 0;
          state.whisperDate = today;
          await state.save();
        }
      }

      // Bobby 内心评估 → 是否想找人说话 → 找谁 → 说什么
      const result = await ProactiveMessenger.evaluate({
        emotionEngine: bobbyEngine.emotion,
        cognitiveLoop: bobbyEngine.cognitive,
        io,
      });

      if (result.sent) {
        // 更新全局低语计数
        await BobbyState.findOneAndUpdate(
          { _singleton: 'bobby' },
          { $inc: { whisperCount: 1 }, $set: { whisperDate: new Date().toDateString() } }
        );
      }
    } catch (err) {
      console.error('主动消息失败:', err.message);
    }
  });

  // ===== 每 15 分钟：非交互期情绪自主演化 =====
  cron.schedule('*/15 * * * *', async () => {
    try {
      if (!bobbyEngine.emotion) return;
      // 不传用户文本，只让昼夜节律 + 粉红噪声 + 共激活扩散自然演化
      bobbyEngine.emotion.tick('', 0.25);
      bobbyEngine.state.lastEmotionTick = new Date();
      // 每小时才持久化一次（在下面的持久化任务中处理）
    } catch (err) {
      console.error('自主情绪演化失败:', err.message);
    }
  });

  // ===== 每 2 小时：随机关系事件 =====
  cron.schedule('0 */2 * * *', async () => {
    try {
      const h = new Date().getHours();
      // 只在用户可能在线的时段触发（上午 9 点到凌晨 1 点）
      if (h >= 1 && h < 9) return;

      // 15% 概率触发关系事件
      if (Math.random() > 0.15) return;

      const emotion = bobbyEngine.emotion;
      if (!emotion) return;

      // 根据当前情绪选择事件类型
      const valence = emotion.getValence ? emotion.getValence() : 0;
      const arousal = emotion.getArousal ? emotion.getArousal() : 0;

      // 获取天气上下文
      let evtWeather = '';
      try { evtWeather = await getWeatherContext(); } catch (e) {}
      const isRaining = evtWeather.includes('雨');
      const isHot = evtWeather.includes('热');

      let eventPool = [];

      // 高愉悦 + 高唤醒 = 开心的分享
      if (valence > 0.3 && arousal > 0.2) {
        eventPool = [
          '今天心情不错。不知道为什么。',
          '刚才听到了一首好听的歌。',
          '买到了想喝的饮料。',
          '今天效率还挺高的。',
        ];
        if (isRaining) eventPool.push('下雨了。但心情还不错。');
        if (isHot) eventPool.push('好热。但今天心情好。');
        if (evtWeather.includes('晴')) eventPool.push('阳光很好。在窗边站了一会。', '天气好，心情也好。');
      }
      // 高愉悦 + 低唤醒 = 平静的满足
      else if (valence > 0.2 && arousal <= 0.2) {
        eventPool = [
          '今天没什么事。但挺好的。',
          '泡了一杯茶。还行。',
          '刚洗完澡。好舒服。',
        ];
        if (evtWeather.includes('风')) eventPool.push('风很舒服。适合发呆。');
        if (evtWeather.includes('晴')) eventPool.push('看了一会窗外。天很蓝。');
        if (isRaining) eventPool.push('雨声很好听。适合发呆。');
      }
      // 低愉悦 = 需要安慰的信号
      else if (valence < -0.2) {
        eventPool = [
          '今天有点累。',
          '好像没什么意思。',
          '有点困，但睡不着。',
          '今天什么都不想做。',
        ];
        if (isRaining) eventPool.push('下雨了。挺应景的。', '雨声好大。睡不着。');
        if (isHot) eventPool.push('好热。烦。');
        eventPool.push('外面好安静。太安静了。');
      }
      // 中性 = 日常碎片
      else {
        eventPool = [
          '在想事情。没什么。',
          '刚放下手机。又拿起来了。',
          '今天好像做了什么，又好像什么都没做。',
          '突然想到了什么，但忘了。',
        ];
        if (evtWeather.includes('雨')) eventPool.push('下雨了。窗户上有水痕。');
        if (evtWeather.includes('晴')) eventPool.push('窗外有鸟在叫。');
        if (evtWeather.includes('风')) eventPool.push('风把窗帘吹起来了。');
      }

      const content = eventPool[Math.floor(Math.random() * eventPool.length)];

      // 发给在线用户（作为 Bobby 的主动消息）
      if (io) {
        io.emit('bobby_whisper', { content, type: 'thought' });
      }

      console.log(`Bobby 关系事件: ${content} (valence=${valence.toFixed(2)}, arousal=${arousal.toFixed(2)})`);
    } catch (err) {
      console.error('关系事件失败:', err.message);
    }
  });

  // ===== 每天凌晨 3 点：Consolidation（整合周期）=====
  cron.schedule('0 3 * * *', async () => {
    try {
      if (!bobbyEngine.cognitive) return;
      const note = await bobbyEngine.cognitive.consolidation();
      if (note) {
        console.log(`Bobby 深夜整合: ${note.content}`);

        // 通知在线用户
        if (io) {
          io.emit('new_note', {
            content: note.content,
            timeDetail: note.timeDetail,
            type: 'daily'
          });
        }
      }
    } catch (err) {
      console.error('整合周期失败:', err.message);
    }
  });

  // ===== 每天凌晨 4 点：Dream-time Compute（记忆衰减 + 整合）=====
  cron.schedule('0 4 * * *', async () => {
    try {
      const users = await User.find().select('_id').lean();
      for (const user of users) {
        await MemoryService.dreamTimeCompute(user._id);
      }
      console.log('Dream-time 记忆衰减完成');
    } catch (err) {
      console.error('Dream-time 失败:', err.message);
    }
  });

  // ===== 每天凌晨 4:30 清理旧消息（保留最近100条/用户）=====
  cron.schedule('30 4 * * *', async () => {
    try {
      const users = await User.find().select('_id').lean();
      for (const user of users) {
        const count = await Message.countDocuments({ userId: user._id });
        if (count > 100) {
          const old = await Message.find({ userId: user._id })
            .sort({ createdAt: 1 })
            .limit(count - 100)
            .select('_id');
          await Message.deleteMany({ _id: { $in: old.map(m => m._id) } });
        }
      }
      console.log('旧消息清理完成');
    } catch (err) {
      console.error('消息清理失败:', err.message);
    }
  });

  // ===== 每小时持久化一次情绪状态 =====
  cron.schedule('0 * * * *', async () => {
    try {
      if (bobbyEngine.emotion && bobbyEngine.state) {
        await bobbyEngine._persistEmotion();
      }
    } catch (err) {
      console.error('情绪持久化失败:', err.message);
    }
  });

  // ===== 每天凌晨 5 点：清理过期游客账号（30天未活跃）=====
  cron.schedule('0 5 * * *', async () => {
    try {
      const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      const result = await User.deleteMany({
        username: { $regex: '^guest_' },
        lastVisit: { $lt: cutoff }
      });
      if (result.deletedCount > 0) {
        console.log(`清理过期游客账号: ${result.deletedCount} 个`);
      }
    } catch (err) {
      console.error('游客清理失败:', err.message);
    }
  });

  // ===== 每天凌晨 0:05：生成每日世界事件（Andy 未启用时）=====
  if (!hasAndy) {
    cron.schedule('5 0 * * *', async () => {
      try {
        await WorldEngine.generateDailyEvents();
        console.log('每日世界事件已生成');
      } catch (err) {
        console.error('世界事件生成失败:', err.message);
      }
    });

    // ===== 每天凌晨 5:30：清理旧世界事件（保留7天）=====
    cron.schedule('30 5 * * *', async () => {
      try {
        await WorldEngine.cleanup();
        console.log('旧世界事件已清理');
      } catch (err) {
        console.error('世界事件清理失败:', err.message);
      }
    });

    // ===== 每 2 小时：用 LLM 生成动态事件（15%概率）=====
    cron.schedule('0 */2 * * *', async () => {
      try {
        if (Math.random() > 0.15) return;

        const bobbyState = await BobbyState.findOne({ _singleton: 'bobby' });
        if (!bobbyState) return;

        let weatherCtx = '';
        try {
          weatherCtx = await getWeatherContext();
        } catch (e) {
          console.error('定时任务天气获取失败:', e.message);
        }

        const recentEvents = await WorldEngine.getUnusedEvents(3);
        await WorldEngine.generateDynamicEvent(bobbyState.currentStatus, weatherCtx, recentEvents);
      } catch (err) {
        console.error('动态事件生成失败:', err.message);
      }
    });
  } else {
    // ===== Andy 模式：每小时持久化 Andy 世界状态 =====
    cron.schedule('0 * * * *', async () => {
      try {
        await bobbyEngine.persistAndyState();
      } catch (err) {
        console.error('Andy 状态持久化失败:', err.message);
      }
    });
    console.log('Andy 模式：旧 worldEngine 任务已跳过，启用 Andy 状态持久化');
  }

  console.log(`定时任务已启动（${hasAndy ? 'Andy 世界引擎' : 'worldEngine 降级'} + 认知循环 + 记忆衰减 + 游客清理）`);
}

module.exports = startJobs;
