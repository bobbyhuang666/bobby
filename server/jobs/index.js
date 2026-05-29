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

// Bobby 的碎片素材（厦门日常，不刻意强调城市名）
const DAILY_NOTES = [
  // 通用日常
  '窗外的树好像又长高了一点。',
  '耳机线又打结了。',
  '手机屏碎了好久了，一直没修。',
  '阳台上的衣服忘了收。潮了。',
  '泡面吃完了最后一包。',
  '看了一个很老的电影。还行。',
  '今天的月亮特别圆。',
  '发现一首很好听的歌，单曲循环了。',
  '手机相册弹出了去年的今天。',
  '突然想学吉他。但大概不会真的去。',
  '睡不着，数了一下天花板上的裂纹。',
  '窗外有一只鸟一直在叫，叫了很久。',
  '泡了一杯茶，忘了喝，凉了。',
  '手机电量到1%的时候充上了。松了口气。',
  '发现袜子破了一个洞。但只破了一只。',
  '风把门吹关了，吓了一跳。',
  '枕头底下翻出一张过期的电影票。字已经看不清了。',
  '半夜听到救护车的声音。希望没事。',
  // 厦门日常（自然融入，不突兀）
  '海风吹了一天，阳台上全是咸味。',
  '楼下的猫又来了。蹲在门口看着我。给它倒了点水。',
  '今天去八市买了点吃的。鱼挺新鲜的。',
  '沙茶面加了豆腐和鱿鱼。六块钱。还行。',
  '路过骑楼，有个阿伯在泡茶。',
  '下雨了。潮得衣服都干不了。',
  'BRT上人好多。站了全程。',
  '海边走了一圈。浪挺大的。',
  '凤凰花又开了。红得有点夸张。',
  '今天的晚霞是粉色的。拍了一张。',
  '路边的芒果树结果了。不知道能不能摘。',
  '天气太热了。风扇吹的都是热风。',
  '去曾厝垵那边走了一下。游客好多。',
  '楼下便利店换了老板。新来的阿姨没以前那个好。',
  '隔壁的灯又亮到很晚。不知道在干嘛。',
  '台风要来了。窗户关紧了。'
];

const WHISPERS_NIGHT = ['还没睡？', '...在吗', '嗯...', '困了', '嗯', '外面好安静', '海风好大', '浪声好响'];
const WHISPERS_DAY = ['嗯', '困', '海风好大'];
const MUTTERS_NIGHT = ['下雨了', '海风好大', '路灯灭了', '月亮挺亮的', '隔壁灯也灭了', '猫又来了', '好困...', '浪声好响'];
const MUTTERS_DAY = ['树叶在晃', '有点饿了', '困', '好热'];

function startJobs(bobbyEngine, io, andyBridge) {
  const hasAndy = !!andyBridge;

  // ===== Andy Tick：每 5 分钟推进 Andy 世界 =====
  if (hasAndy) {
    cron.schedule('*/5 * * * *', async () => {
      try {
        const result = await bobbyEngine.tickAndy();
        if (result && result.stateChanged) {
          console.log(`Andy tick: ${result.bobbyStatus} (tick #${result.time?.tick || '?'})`);
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

  // ===== 每 30 分钟检查是否生成碎片 =====
  cron.schedule('*/30 * * * *', async () => {
    try {
      const state = await BobbyState.findOne({ _singleton: 'bobby' });
      if (!state) return;

      const today = new Date().toDateString();

      // 每天最多 3 条碎片
      if (state.notesDate !== today) {
        state.notesToday = 0;
        state.notesDate = today;
        await state.save();
      }

      if (state.notesToday >= 3) return;

      // 深夜概率更高
      const h = new Date().getHours();
      const chance = (h >= 22 || h < 3) ? 0.4 : 0.15;

      if (Math.random() > chance) return;

      // 选择碎片内容：30% 概率用天气相关，70% 用日常素材
      let noteText;
      if (Math.random() < 0.3) {
        noteText = await generateWeatherNote();
      }
      if (!noteText) {
        let attempts = 0;
        do {
          noteText = DAILY_NOTES[Math.floor(Math.random() * DAILY_NOTES.length)];
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

      state.notesToday += 1;
      state.recentNoteTexts.push(noteText);
      if (state.recentNoteTexts.length > 10) state.recentNoteTexts.shift();
      await state.save();

      // 通知所有在线用户
      if (io) {
        io.emit('new_note', { content: noteText, timeDetail: now.toISOString() });
      }

      console.log(`Bobby 发了新碎片: ${noteText}`);
    } catch (err) {
      console.error('碎片生成失败:', err.message);
    }
  });

  // ===== 每 10 分钟检查是否发送低语 =====
  cron.schedule('*/10 * * * *', async () => {
    try {
      const state = await BobbyState.findOne({ _singleton: 'bobby' });
      if (!state) return;

      const today = new Date().toDateString();
      if (state.whisperDate !== today) {
        state.whisperCount = 0;
        state.whisperDate = today;
        await state.save();
      }

      // 每个用户每天最多 2 条低语
      if (state.whisperCount >= 2) return;

      const h = new Date().getHours();
      const isNight = h >= 23 || h < 3;
      const chance = isNight ? 0.3 : 0.1;

      if (Math.random() > chance) return;

      // 选择低语内容（基于情绪状态）
      const isMutter = Math.random() < 0.5;
      let content, type;

      // 获取情绪状态决定内容倾向
      const emotion = bobbyEngine.emotion;
      const valence = emotion && emotion.getValence ? emotion.getValence() : 0;
      const arousal = emotion && emotion.getArousal ? emotion.getArousal() : 0;

      if (isMutter) {
        // 碎碎念：根据情绪选池
        let pool;
        if (valence < -0.2) {
          // 低落时的碎碎念
          pool = isNight
            ? ['好安静...', '风好大', '睡不着', '好困', '外面好暗']
            : ['有点累', '好热', '困', '不想动'];
        } else if (valence > 0.3 && arousal > 0.2) {
          // 开心时的碎碎念
          pool = isNight
            ? ['今天还不错', '心情挺好', '风好舒服', '月亮好亮']
            : ['天气不错', '风好大', '今天效率还行'];
        } else {
          // 平静时用默认池
          pool = isNight ? MUTTERS_NIGHT : MUTTERS_DAY;
        }
        content = pool[Math.floor(Math.random() * pool.length)];
        type = 'thought';
      } else {
        // 低语消息：根据情绪选池
        let pool;
        if (valence < -0.2) {
          pool = isNight
            ? ['...在吗', '嗯...', '困了', '还没睡？']
            : ['嗯', '困', '好热'];
        } else if (valence > 0.3) {
          pool = isNight
            ? ['嗯，在', '还没睡', '今天还不错']
            : ['嗯', '来了', '在呢'];
        } else {
          pool = isNight ? WHISPERS_NIGHT : WHISPERS_DAY;
        }
        content = pool[Math.floor(Math.random() * pool.length)];
        type = 'text';
      }

      // 发给所有在线用户
      if (io) {
        io.emit('bobby_whisper', { content, type });
      }

      state.whisperCount += 1;
      await state.save();

      console.log(`Bobby 低语: [${type}] ${content}`);
    } catch (err) {
      console.error('低语发送失败:', err.message);
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

      let eventPool = [];

      // 高愉悦 + 高唤醒 = 开心的分享
      if (valence > 0.3 && arousal > 0.2) {
        eventPool = [
          '今天心情不错。不知道为什么。',
          '刚才听到了一首好听的歌。',
          '阳光很好。在窗边站了一会。',
          '买到了想喝的饮料。',
          '今天效率还挺高的。'
        ];
      }
      // 高愉悦 + 低唤醒 = 平静的满足
      else if (valence > 0.2 && arousal <= 0.2) {
        eventPool = [
          '风很舒服。适合发呆。',
          '今天没什么事。但挺好的。',
          '泡了一杯茶。还行。',
          '看了一会窗外。天很蓝。',
          '刚洗完澡。好舒服。'
        ];
      }
      // 低愉悦 = 需要安慰的信号
      else if (valence < -0.2) {
        eventPool = [
          '今天有点累。',
          '好像没什么意思。',
          '有点困，但睡不着。',
          '今天什么都不想做。',
          '外面好安静。太安静了。'
        ];
      }
      // 中性 = 日常碎片
      else {
        eventPool = [
          '在想事情。没什么。',
          '刚放下手机。又拿起来了。',
          '今天好像做了什么，又好像什么都没做。',
          '窗外有鸟在叫。',
          '突然想到了什么，但忘了。'
        ];
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
        } catch (e) {}

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
