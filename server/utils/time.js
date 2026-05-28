/**
 * 共享时间工具 - 消除多处重复的 getTimeLabel
 */

function getTimeLabel() {
  const h = new Date().getHours();
  if (h >= 23 || h < 1) return '深夜';
  if (h >= 1 && h < 3) return '凌晨';
  if (h >= 3 && h < 6) return '天快亮了';
  if (h >= 6 && h < 11) return '上午';
  if (h >= 11 && h < 14) return '中午';
  if (h >= 14 && h < 18) return '下午';
  if (h >= 18 && h < 21) return '傍晚';
  return '晚上';
}

function isNight() {
  const h = new Date().getHours();
  return h >= 23 || h < 3;
}

function getTimePeriod() {
  const h = new Date().getHours();
  if (h >= 23 || h < 3) return 'lateNight';
  if (h >= 3 && h < 6) return 'earlyMorning';
  if (h >= 6 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

module.exports = { getTimeLabel, isNight, getTimePeriod };
