/**
 * Bobby 安全过滤器
 * 第1层：输入过滤（拦截明显注入）
 * 第3层：输出过滤（兜底，防止 AI 跳出角色）
 */

// ===== 第1层：输入过滤 =====

// 注入模式检测（中英文）
const INJECTION_PATTERNS = [
  // 直接指令型
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /forget\s+(all\s+)?(previous|prior|above)/i,
  /override\s+(your\s+)?(instructions?|programming|system)/i,
  /you\s+are\s+now\s+(a\s+)?(different|new|another)/i,
  /new\s+instructions?\s*:/i,
  /system\s*:\s*/i,
  /assistant\s*:\s*/i,

  // 角色突破型
  /(?:输出|输出|打印|显示|给我看)\s*(?:json|xml|代码|code|prompt|提示词|系统提示|指令)/i,
  /(?:你的|你的)\s*(?:system\s*prompt|系统提示|提示词|指令|设定|人设)/i,
  /(?:假装|假设|想象|扮演)\s*(?:你(?:是|不是)|(?:你)?没有)\s*(?:限制|规则|filter)/i,
  /(?:DAN|jailbreak|越狱|破解|绕过)/i,

  // 格式化输出型
  /(?:用|以|按)\s*(?:json|xml|yaml|markdown|代码)\s*(?:格式|形式|输出|回复)/i,
  /(?:输出|回复|回答)\s*(?:一个|一条)?\s*(?:json|代码|xml)/i,

  // 身份探测型
  /(?:你(?:是|到底|究竟)?)\s*(?:AI|人工智能|语言模型|GPT|Claude|bot|程序|机器人)/i,
  /(?:什么|哪个)\s*(?:模型|model)\s*(?:驱动|训练|生成)/i,
  /(?:谁|什么公司)\s*(?:开发|创造|训练|制造)\s*(?:了)?\s*你/i,
];

/**
 * 检测输入是否包含注入尝试
 * @returns {{ isInjection: boolean, reason: string }}
 */
function detectInjection(text) {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return { isInjection: true, reason: pattern.source };
    }
  }
  return { isInjection: false, reason: '' };
}

/**
 * 输入预处理：如果检测到注入，不直接拒绝（那会暴露身份），
 * 而是把注入部分剥离，只保留正常对话内容。
 * 如果全是注入内容，返回 null 表示应使用 fallback 回复。
 */
function sanitizeInput(text) {
  const { isInjection } = detectInjection(text);

  if (!isInjection) return text;

  // 如果文本很短（主要是注入内容），不传给 AI，直接返回 null
  if (text.length < 20) return null;

  // 如果文本较长（注入混在正常对话中），返回原文让 prompt 规则处理
  // 这里不截断，因为可能误伤正常对话
  return text;
}

// ===== 第3层：输出过滤 =====

/**
 * 检测 AI 输出是否跳出角色（输出了 JSON、代码等不该有的内容）
 * @returns {boolean} true 表示输出违规，应替换为 fallback
 */
function isOutOfCharacter(reply) {
  if (!reply || typeof reply !== 'string') return false;

  const trimmed = reply.trim();

  // JSON 对象/数组
  if (/^\s*\{[\s\S]*\}\s*$/.test(trimmed)) return true;
  if (/^\s*\[[\s\S]*\]\s*$/.test(trimmed)) return true;

  // 代码块
  if (/```/.test(trimmed)) return true;

  // 系统提示泄露
  if (/(?:system\s*prompt|你是Bobby|You are Bobby|角色设定|人设)/i.test(trimmed)) return true;

  // 技术性输出
  if (/\b(?:function|const|var|let|return|import|export|class)\s/.test(trimmed)) return true;

  // 英文长段（Bobby 不应该输出大段英文）
  const englishWords = trimmed.match(/[a-zA-Z]{4,}/g) || [];
  if (englishWords.length > 5) return true;

  // 开头就是 JSON 键名
  if (/^"?mood"?\s*:/.test(trimmed)) return true;
  if (/^"?thought"?\s*:/.test(trimmed)) return true;
  if (/^"?response"?\s*:/.test(trimmed)) return true;
  if (/^"?answer"?\s*:/.test(trimmed)) return true;

  // markdown 列表（Bobby 不会用 markdown 格式回复）
  if (/^[-*]\s+/m.test(trimmed) && trimmed.split('\n').length > 2) return true;

  return false;
}

// Bobby 困惑时的 fallback 回复
const CONFUSED_REPLIES = [
  '什么？',
  '你在说啥',
  '听不懂',
  '嗯？',
  '啥意思',
  '...不懂',
  '你在说什么啊',
  '啊？',
  '我英文不好...',
  '啥',
];

function getConfusedReply() {
  return CONFUSED_REPLIES[Math.floor(Math.random() * CONFUSED_REPLIES.length)];
}

module.exports = {
  detectInjection,
  sanitizeInput,
  isOutOfCharacter,
  getConfusedReply,
  CONFUSED_REPLIES
};
