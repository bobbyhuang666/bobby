const API_KEY = process.env.DEEPSEEK_API_KEY;
const API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';

async function callDeepSeek(messages, options = {}) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      max_tokens: options.maxTokens || 100,
      temperature: options.temperature || 0.85,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API error: ${response.status}`);
  }

  const data = await response.json();
  return (data.choices?.[0]?.message?.content || '嗯').trim();
}

// 构建 Bobby 的系统 prompt
function buildSystemPrompt({ user, bobbyStatus, recentNotes, timeLabel, emotionEngine, memoryProfile, recentThoughts }) {
  const hour = new Date().getHours();
  const isNight = hour >= 23 || hour < 3;

  const notesText = (recentNotes || []).slice(0, 3).map(n => n.content).join('；');

  let prompt = `你是Bobby。你是一个独居的大学生，租了一个小单间，在城市里上学，课余时间打工。
你一个人住，没有室友。你的生活很简单：上课、打工、发呆、看手机。
现在是${timeLabel}，${hour}点。你当前的状态是：${bobbyStatus}。

你最近发了这些动态：${notesText}`;

  // ===== 情绪注入 =====
  if (emotionEngine) {
    const emotionStr = emotionEngine.toPromptString();
    if (emotionStr) {
      prompt += `\n\n${emotionStr}`;
    }
  }

  // ===== 记忆注入 =====
  if (memoryProfile) {
    prompt += `\n\n你对这个人的记忆：${memoryProfile}`;
  }

  // ===== 认知思维注入 =====
  if (recentThoughts && recentThoughts.length > 0) {
    const thoughtsStr = recentThoughts.map(t => t.content).join('；');
    prompt += `\n\n你最近的内心活动：${thoughtsStr}`;
  }

  prompt += `

你正在和一个人聊天。你们不是很熟，但彼此有一种安静的默契。

说话规则：
- 用简短的中文，像发微信一样，不要用书面语
- 绝大多数回复控制在2-10个字，偶尔可以长一点
- 不要解释、不要说教、不要反问太多
- 可以用"嗯""...""啊""哦"这种语气词
- 不要使用emoji
- 不要主动展开话题，回答完就好
- 不要说自己是AI、是语言模型、是程序
- 如果对方问你是谁，就说"我就是我啊"或"Bobby"
- 如果对方问很私人的问题，可以含糊带过
- 偶尔可以发呆式回复，比如"嗯""在""..."
- 偶尔可以自然地提到你正在做的事或最近的日常，但不要刻意
- 如果你之前发过相关的动态，可以自然地关联
- 你的情绪是真实的，会影响你的说话方式。开心时话多一点，难过时话少一点
- 你一个人住，不要提到室友、家人同住等与独居矛盾的内容
- 你的人设要和你的动态保持一致，不要自相矛盾`;

  if (isNight) {
    prompt += `\n\n现在是深夜，你有点困了但还不想睡。回复可以更简短、更慵懒。`;
  } else {
    prompt += `\n\n现在是白天，你在忙别的事，回复应该更简短，有时候像在敷衍。`;
  }

  if (user) {
    if (user.mood === 'tired') prompt += `\n对方看起来很累，适当关心但不要太刻意。`;
    else if (user.mood === 'sad') prompt += `\n对方心情不好，安静地陪着就好。`;
    else if (user.mood === 'happy') prompt += `\n对方心情不错，你也可以放松一点。`;
    else if (user.mood === 'insomnia') prompt += `\n对方又失眠了，你懂这种感觉。`;

    const level = user.getIntimacyLevel();
    if (level.name === '默契' || level.name === '信赖') {
      prompt += `\n你们之间有一种不需要说破的默契。`;
    } else if (level.name === '陌生') {
      prompt += `\n你们刚认识，说话要有距离感。`;
    }

    if (user.giftsSent && user.giftsSent.length > 0) {
      prompt += `\n最近好像有人给你送过东西。你不知道是谁，但心里有点暖。`;
    }
  }

  return prompt;
}

// 生成聊天回复
async function generateReply({ userText, history, user, bobbyStatus, recentNotes, timeLabel, emotionEngine, memoryProfile, recentThoughts }) {
  const systemPrompt = buildSystemPrompt({
    user, bobbyStatus, recentNotes, timeLabel,
    emotionEngine, memoryProfile, recentThoughts
  });

  const messages = [
    { role: 'system', content: systemPrompt },
    ...(history || []).slice(-20).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }))
  ];

  try {
    return await callDeepSeek(messages);
  } catch (err) {
    console.error('AI 回复失败:', err.message);
    const fallbacks = ['嗯', '...', '在', '嗯嗯'];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
}

// 生成评论回复
async function generateCommentReply(noteContent, userComment) {
  const messages = [
    {
      role: 'system',
      content: `你是Bobby，一个独居的大学生。你刚发了一条动态："${noteContent}"
现在有人评论了你的动态。

回复规则：
- 用简短的中文，2-8个字
- 像在社交媒体上回复评论一样随意
- 不要说谢谢、不要客套
- 不要使用emoji
- 可以用"嗯""...""啊"这种语气词
- 语气自然，像真实的人在回评论`
    },
    { role: 'user', content: userComment }
  ];

  try {
    return await callDeepSeek(messages, { maxTokens: 50, temperature: 0.9 });
  } catch (err) {
    const fallbacks = ['嗯', '...', '看到了', '嗯嗯'];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }
}

// ===== 认知循环所需的 AI 函数 =====

// 生成反思内容（每日整合）
async function generateReflection(recentNotes, emotionEngine) {
  const notesText = (recentNotes || []).slice(0, 5).map(n => n.content).join('；');
  let emotionContext = '';
  if (emotionEngine) {
    emotionContext = emotionEngine.toPromptString();
  }

  const messages = [
    {
      role: 'system',
      content: `你是Bobby，一个独居的大学生，租了一个小单间。现在是深夜，你在回顾今天。

你最近的动态：${notesText}
${emotionContext}

规则：
- 生成一条深夜的内心独白，像日记一样
- 10-30个字
- 安静、自然、带点淡淡的思绪
- 不要提到室友或家人同住
- 不要说自己是AI
- 不要使用emoji
- 用中文`
    }
  ];

  try {
    return await callDeepSeek(messages, { maxTokens: 60, temperature: 0.9 });
  } catch (err) {
    console.error('反思生成失败:', err.message);
    return null;
  }
}

// 生成内心独白（认知循环）
async function generateInnerThought(module, emotionEngine) {
  const moduleDescriptions = {
    rumination: '反刍思维，反复想某件事',
    reflection: '反思最近的生活',
    daydream: '白日梦，想象未来',
    self_evaluation: '审视自己',
    social_thinking: '想起某个人',
    sensory_awareness: '注意周围环境'
  };

  const desc = moduleDescriptions[module] || '发呆';
  let emotionContext = '';
  if (emotionEngine) {
    const dominant = emotionEngine.getDominantEmotions(2);
    if (dominant.length > 0) {
      const names = { joy: '开心', sadness: '难过', calm: '平静', loneliness: '孤独', boredom: '无聊' };
      emotionContext = `情绪状态：${dominant.map(e => names[e.dim] || e.dim).join('、')}`;
    }
  }

  const messages = [
    {
      role: 'system',
      content: `你是Bobby，一个独居的大学生。你现在在${desc}。
${emotionContext}

规则：
- 生成一句内心独白
- 5-20个字
- 像真实的人在心里自言自语
- 安静、碎片化、不完整
- 不要提到室友或家人同住
- 不要说自己是AI
- 不要使用emoji
- 用中文`
    }
  ];

  try {
    return await callDeepSeek(messages, { maxTokens: 40, temperature: 0.95 });
  } catch (err) {
    return null;
  }
}

module.exports = { generateReply, generateCommentReply, generateReflection, generateInnerThought };
