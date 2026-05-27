const cron = require('node-cron');
const Note = require('../models/Note');
const User = require('../models/User');
const Message = require('../models/Message');
const BobbyState = require('../models/BobbyState');
const aiService = require('../services/aiService');
const { MemoryService } = require('../services/memoryService');

// Bobby 的碎片素材
const DAILY_NOTES = [
  '窗外的树好像又长高了一点。',
  '楼下的流浪猫今天没来。',
  '耳机线又打结了。',
  '发现常去的那家店关门了。',
  '今天阳光很好，但风也很大。',
  '手机屏碎了好久了，一直没修。',
  '阳台上的衣服忘了收。',
  '泡面吃完了最后一包。',
  '看了一个很老的电影。还行。',
  '路过一家花店，犹豫了一下没进去。',
  '今天的月亮特别圆。',
  '自己做了个蛋炒饭。味道一般。但能吃。',
  '发现一首很好听的歌，单曲循环了。',
  '下雨了没带伞，在便利店等了半小时。',
  '手机相册弹出了去年的今天。',
  '突然想学吉他。但大概不会真的去。',
  '便利店阿姨问我怎么天天来。',
  '公交车上遇到一只很乖的狗。',
  '今天的晚霞很好看。拍了一张。',
  '睡不着，数了一下天花板上的裂纹。',
  '楼下的路灯换了一个新的，比以前亮了好多。有点不习惯。',
  '发现枕头下面压着一张很久以前的电影票。已经看不清字了。',
  '窗外有一只鸟一直在叫，叫了很久。',
  '泡了一杯茶，忘了喝，凉了。',
  '路过公园，有人在吹萨克斯。走调了，但有种认真的感觉。',
  '手机电量到1%的时候充上了。松了口气。',
  '半夜听到救护车的声音。希望没事。',
  '发现袜子破了一个洞。但只破了一只。',
  '楼下的煎饼摊今天没出。有点失望。',
  '风把门吹关了，吓了一跳。'
];

const WHISPERS_NIGHT = ['还没睡？', '...在吗', '嗯...', '困了', '嗯', '外面好安静', '风好大'];
const WHISPERS_DAY = ['今天有点冷', '嗯', '困', '风好大'];
const MUTTERS_NIGHT = ['下雨了', '风好大', '路灯灭了', '月亮挺亮的', '隔壁灯也灭了', '猫又来了', '好困...'];
const MUTTERS_DAY = ['今天阳光不错', '树叶在晃', '有点饿了', '困'];

function getTimeLabel() {
  const h = new Date().getHours();
  if (h >= 23 || h < 1) return '深夜';
  if (h >= 1 && h < 6) return '凌晨';
  if (h >= 6 && h < 12) return '上午';
  if (h >= 12 && h < 18) return '下午';
  if (h >= 18 && h < 21) return '傍晚';
  return '晚上';
}

function startJobs(bobbyEngine, io) {

  // ===== 每 5 分钟推进状态机 =====
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

      // 选择碎片内容（避免重复）
      let noteText;
      let attempts = 0;
      do {
        noteText = DAILY_NOTES[Math.floor(Math.random() * DAILY_NOTES.length)];
        attempts++;
      } while (state.recentNoteTexts.includes(noteText) && attempts < 10);

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

      // 选择低语内容
      const isMutter = Math.random() < 0.5;
      let content, type;

      if (isMutter) {
        const pool = isNight ? MUTTERS_NIGHT : MUTTERS_DAY;
        content = pool[Math.floor(Math.random() * pool.length)];
        type = 'thought';
      } else {
        const pool = isNight ? WHISPERS_NIGHT : WHISPERS_DAY;
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

  console.log('定时任务已启动（含认知循环 + 记忆衰减）');
}

module.exports = startJobs;
