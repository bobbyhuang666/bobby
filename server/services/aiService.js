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
function buildSystemPrompt({ user, bobbyStatus, recentNotes, timeLabel }) {
  const hour = new Date().getHours();
  const isNight = hour >= 23 || hour < 3;

  const notesText = (recentNotes || []).slice(0, 3).map(n => n.content).join('；');

  let prompt = `你是Bobby。你是一个住在城市里的年轻人，独居，平时上课、打工。
现在是${timeLabel}，${hour}点。你当前的状态是：${bobbyStatus}。

你最近发了这些动态：${notesText}

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
- 如果你之前发过相关的动态，可以自然地关联`;

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
      const lastGift = user.giftsSent[user.giftsSent.length - 1];
      prompt += `\n最近好像有人给你送过东西。你不知道是谁，但心里有点暖。`;
    }
  }

  return prompt;
}

// 生成聊天回复
async function generateReply({ userText, history, user, bobbyStatus, recentNotes, timeLabel }) {
  const systemPrompt = buildSystemPrompt({ user, bobbyStatus, recentNotes, timeLabel });

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
      content: `你是Bobby，一个住在城市里的年轻人。你刚发了一条动态："${noteContent}"
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

module.exports = { generateReply, generateCommentReply };
