/**
 * Bobby 天气服务
 * 接入 Open-Meteo（免费，无需 API key）
 * 厦门坐标：24.48°N, 118.09°E
 */

const XIAMEN_LAT = 24.48;
const XIAMEN_LON = 118.09;

// WMO 天气代码转中文描述
const WMO_CODES = {
  0: '晴',
  1: '大部晴朗',
  2: '多云',
  3: '阴天',
  45: '雾',
  48: '雾凇',
  51: '小毛毛雨',
  53: '毛毛雨',
  55: '大毛毛雨',
  56: '冻毛毛雨',
  57: '冻雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '冻小雨',
  67: '冻大雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '雪粒',
  80: '阵雨',
  81: '中阵雨',
  82: '大阵雨',
  85: '小阵雪',
  86: '大阵雪',
  95: '雷暴',
  96: '雷暴伴小冰雹',
  99: '雷暴伴大冰雹'
};

// 缓存天气数据（每 30 分钟刷新一次）
let weatherCache = null;
let lastFetchTime = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30 分钟

/**
 * 获取厦门当前天气
 * @returns {{ temp: number, description: string, humidity: number, windSpeed: number, isRaining: boolean, raw: object }}
 */
async function getXiamenWeather() {
  const now = Date.now();
  if (weatherCache && (now - lastFetchTime) < CACHE_DURATION) {
    return weatherCache;
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${XIAMEN_LAT}&longitude=${XIAMEN_LON}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=Asia/Shanghai`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000) // 5 秒超时
    });

    if (!response.ok) {
      throw new Error(`Weather API error: ${response.status}`);
    }

    const data = await response.json();
    const current = data.current;

    const weatherCode = current.weather_code;
    const description = WMO_CODES[weatherCode] || '不知道';
    const isRaining = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(weatherCode);

    weatherCache = {
      temp: Math.round(current.temperature_2m),
      description,
      humidity: current.relative_humidity_2m,
      windSpeed: Math.round(current.wind_speed_10m),
      isRaining,
      raw: current
    };
    lastFetchTime = now;

    return weatherCache;
  } catch (err) {
    console.error('天气获取失败:', err.message);
    return weatherCache || null; // 返回缓存或 null
  }
}

/**
 * 生成天气相关的自然语言片段（用于注入 prompt 或动态）
 * @returns {string} 例如 "外面在下雨，有点闷" 或 ""
 */
async function getWeatherContext() {
  const weather = await getXiamenWeather();
  if (!weather) return '';

  const parts = [];

  // 温度感受（先给精确数字，再给感受）
  parts.push(`现在${weather.temp}度`);
  if (weather.temp >= 35) parts.push('好热');
  else if (weather.temp >= 30) parts.push('有点热');
  else if (weather.temp >= 25) parts.push('天气还行');
  else if (weather.temp >= 15) parts.push('有点凉');
  else parts.push('挺冷的');

  // 天气状况
  if (weather.isRaining) {
    parts.push('在下雨');
  } else if (weather.description === '阴天') {
    parts.push('天阴沉沉的');
  } else if (weather.description === '雾') {
    parts.push('雾好大');
  } else if (weather.description.includes('晴')) {
    parts.push('太阳挺大的');
  }

  // 湿度（厦门常见）
  if (weather.humidity >= 85) parts.push('好潮');

  // 风（靠海城市常有的）
  if (weather.windSpeed >= 20) parts.push('风好大');

  return parts.join('，');
}

/**
 * 生成一条天气相关的碎片文字
 * @returns {string|null}
 */
async function generateWeatherNote() {
  const weather = await getXiamenWeather();
  if (!weather) return null;

  const templates = [];

  if (weather.isRaining) {
    templates.push(
      '下雨了。窗户上全是水痕。',
      '雨声好大。在窗户边发了会呆。',
      '下雨了，出门忘带伞。',
      '雨停了。地上还有水坑。'
    );
  }

  if (weather.temp >= 33) {
    templates.push(
      '太热了。风扇吹的都是热风。',
      '热得不想出门。在屋里躺着。',
      '买了瓶冰水。瓶子外面全是水珠。'
    );
  }

  if (weather.windSpeed >= 15) {
    templates.push(
      '海风好大。晾的衣服差点飞了。',
      '风把窗帘吹起来了。好几次。',
      '外面风好大。呼呼的。'
    );
  }

  if (weather.humidity >= 85) {
    templates.push(
      '潮得不行。衣服晾了两天还没干。',
      '空气黏黏的。不舒服。'
    );
  }

  if (weather.description.includes('晴') && weather.temp >= 20 && weather.temp <= 30) {
    templates.push(
      '今天天气不错。阳光很好。',
      '天气好，出去走了一下。还行。'
    );
  }

  if (weather.description === '阴天') {
    templates.push(
      '天阴沉沉的。闷。',
      '阴天。不太想动。'
    );
  }

  if (templates.length === 0) return null;
  return templates[Math.floor(Math.random() * templates.length)];
}

module.exports = { getXiamenWeather, getWeatherContext, generateWeatherNote };
