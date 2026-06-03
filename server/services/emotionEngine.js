/**
 * Bobby 情绪引擎
 *
 * 设计来源：
 * - SentiCore (30维情绪矩阵 + 时间衰减 + 基线漂移)
 * - lacuna-core (1/f粉红噪声 + 昼夜节律 + 惯性过滤)
 *
 * 核心理念：Bobby 不是"扮演"有情绪，而是有真实的内部情绪状态
 * 情绪会影响回复风格、动态内容、主动消息的语气
 */

const { BOBBY_DEFAULTS } = require('../config/bobbyDefaults');
const cfg = BOBBY_DEFAULTS.emotion;

// ===== 30 维情绪定义 (基于 Cowen & Keltner 2017) =====
const EMOTION_DIMENSIONS = [
  // Ekman 基础 6 维
  'joy', 'sadness', 'anger', 'fear', 'surprise', 'disgust',
  // Keltner 扩展维度
  'amusement', 'awe', 'contentment', 'desire', 'embarrassment',
  'guilt', 'horror', 'interest', 'love', 'nervousness', 'pride',
  'relief', 'satisfaction', 'shame', 'sympathy', 'triumph',
  // 补充维度
  'boredom', 'calm', 'confusion', 'excitement', 'frustration',
  'gratitude', 'hope', 'loneliness'
];

// ===== 情绪交互矩阵（共激活规则）=====
// 基于 Russell Circumplex 1980 + Cowen & Keltner 2017
const CO_ACTIVATION = {
  joy:        { contentment: 0.3, satisfaction: 0.2, excitement: 0.15, pride: 0.1 },
  sadness:    { loneliness: 0.35, guilt: 0.15, shame: 0.1, frustration: 0.1 },
  anger:      { frustration: 0.3, disgust: 0.15, horror: 0.05 },
  fear:       { nervousness: 0.3, horror: 0.2, surprise: 0.1 },
  boredom:    { loneliness: 0.2, frustration: 0.15, calm: 0.1 },
  calm:       { contentment: 0.2, relief: 0.15, hope: 0.1 },
  love:       { joy: 0.2, contentment: 0.25, pride: 0.1, sympathy: 0.15 },
  loneliness: { sadness: 0.3, boredom: 0.15, hope: 0.1 },
  excitement: { joy: 0.2, surprise: 0.15, interest: 0.2 },
  frustration:{ anger: 0.2, boredom: 0.1, nervousness: 0.15 }
};

// ===== 用户情绪关键词映射（从共享配置加载）=====
// 映射到 EmotionEngine 内部使用的维度名
const USER_EMOTION_KEYWORDS = {
  joy:        BOBBY_DEFAULTS.moodKeywords.happy,
  sadness:    BOBBY_DEFAULTS.moodKeywords.sad,
  anger:      BOBBY_DEFAULTS.moodKeywords.angry,
  fear:       BOBBY_DEFAULTS.moodKeywords.anxious,
  tired:      BOBBY_DEFAULTS.moodKeywords.tired,
  love:       BOBBY_DEFAULTS.moodKeywords.loving,
  loneliness: BOBBY_DEFAULTS.moodKeywords.sad,     // 孤独与悲伤共用关键词
  confusion:  BOBBY_DEFAULTS.moodKeywords.confused,
  hope:       BOBBY_DEFAULTS.moodKeywords.hopeful,
  gratitude:  BOBBY_DEFAULTS.moodKeywords.grateful
};

class EmotionEngine {
  constructor() {
    // 30 维当前情绪值 (-1.0 ~ +1.0)
    this.current = {};
    // 30 维基线值（长期人格倾向）
    this.baseline = {};
    // 压力 (0-10)
    this.stress = 2;
    // 心率模拟 (50-130)
    this.heartRate = cfg.defaultHeartRate;
    // 粉红噪声状态
    this._pinkNoiseState = {};

    // 初始化
    EMOTION_DIMENSIONS.forEach(dim => {
      this.current[dim] = 0;
      this.baseline[dim] = 0;
      this._pinkNoiseState[dim] = Math.random();
    });

    // Bobby 的默认基线人格：偏平静、微孤独、有点无聊
    this.baseline.calm = 0.3;
    this.baseline.loneliness = 0.15;
    this.baseline.boredom = 0.1;
    this.baseline.contentment = 0.1;
    this.baseline.joy = 0.05;

    // 将当前值设为基线
    EMOTION_DIMENSIONS.forEach(dim => {
      this.current[dim] = this.baseline[dim];
    });
  }

  // 从持久化数据恢复
  static fromJSON(data) {
    const engine = new EmotionEngine();
    if (data.current) engine.current = { ...engine.current, ...data.current };
    if (data.baseline) engine.baseline = { ...engine.baseline, ...data.baseline };
    if (data.stress !== undefined) engine.stress = data.stress;
    if (data.heartRate !== undefined) engine.heartRate = data.heartRate;
    return engine;
  }

  toJSON() {
    return {
      current: { ...this.current },
      baseline: { ...this.baseline },
      stress: this.stress,
      heartRate: this.heartRate
    };
  }

  // ===== 核心：每轮更新（每次交互调用）=====
  tick(userText = '', hoursSinceLastTick = 0.5) {
    // 1. 时间衰减：情绪向基线回归
    this._decay(hoursSinceLastTick);

    // 2. 用户情绪感染
    if (userText) {
      this._emotionalContagion(userText);
    }

    // 3. 1/f 粉红噪声漂移
    this._pinkNoiseDrift();

    // 4. 昼夜节律调整
    this._circadianRhythm();

    // 5. 共激活扩散
    this._coActivation();

    // 6. 惯性过滤（防止急转）
    this._inertiaFilter();

    // 7. 压力-心率耦合
    this._stressHeartCoupling();

    // 8. 基线漂移（永久人格演化，每次 0.1%）
    this._baselineDrift();

    // 9. 裁剪到有效范围
    this._clamp();
  }

  // 时间衰减：E(t) = Baseline + (E_prev - Baseline) * e^(-λ * Δt)
  _decay(dt) {
    const lambda = cfg.decayLambda;
    EMOTION_DIMENSIONS.forEach(dim => {
      const diff = this.current[dim] - this.baseline[dim];
      this.current[dim] = this.baseline[dim] + diff * Math.exp(-lambda * dt);
    });
  }

  // 用户情绪感染
  _emotionalContagion(userText) {
    const detected = {};
    for (const [emotion, regex] of Object.entries(USER_EMOTION_KEYWORDS)) {
      if (regex.test(userText)) {
        detected[emotion] = true;
      }
    }

    // 根据检测到的用户情绪，影响 Bobby 的情绪
    if (detected.sadness || detected.loneliness) {
      this.current.sadness += 0.08;
      this.current.sympathy += 0.12;
      this.current.loneliness += 0.05;
    }
    if (detected.joy) {
      this.current.joy += 0.06;
      this.current.contentment += 0.04;
    }
    if (detected.anger || detected.frustration) {
      this.current.nervousness += 0.05;
      this.current.calm -= 0.03;
    }
    if (detected.tired) {
      this.current.boredom += 0.04;
      this.current.calm += 0.02;
    }
    if (detected.fear) {
      this.current.sympathy += 0.08;
      this.current.nervousness += 0.04;
    }
    if (detected.love) {
      this.current.love += 0.06;
      this.current.joy += 0.04;
      this.current.contentment += 0.03;
    }
    if (detected.hope) {
      this.current.hope += 0.06;
      this.current.calm += 0.03;
    }
    if (detected.gratitude) {
      this.current.contentment += 0.05;
      this.current.pride += 0.03;
    }
  }

  // 1/f 粉红噪声漂移
  _pinkNoiseDrift() {
    EMOTION_DIMENSIONS.forEach(dim => {
      // 简化的粉红噪声：多个不同频率的随机游走叠加
      const noise = this._nextPinkNoise(dim);
      // 影响力很小，但持续不断
      this.current[dim] += noise * cfg.pinkNoiseAmplitude;
    });
  }

  _nextPinkNoise(dim) {
    // 简化的 Voss-McCartney 粉红噪声近似
    const state = this._pinkNoiseState[dim];
    const white = (Math.random() - 0.5) * 2;
    // 一阶 IIR 低通滤波
    const alpha = 0.1;
    this._pinkNoiseState[dim] = state * (1 - alpha) + white * alpha;
    return this._pinkNoiseState[dim];
  }

  // 昼夜节律
  _circadianRhythm() {
    const h = new Date().getHours();

    // 深夜：更孤独、更无聊、更平静
    if (h >= 23 || h < 3) {
      this.current.loneliness += 0.02;
      this.current.calm += 0.015;
      this.current.boredom += 0.01;
      this.heartRate -= 2; // 心率降低
    }
    // 凌晨：最低能量
    else if (h >= 3 && h < 6) {
      this.current.boredom += 0.02;
      this.current.calm += 0.02;
      this.heartRate -= 3;
    }
    // 上午：精力恢复
    else if (h >= 6 && h < 12) {
      this.current.joy += 0.01;
      this.current.interest += 0.015;
      this.heartRate += 1;
    }
    // 下午：平淡
    else if (h >= 12 && h < 18) {
      this.current.boredom += 0.01;
      this.heartRate += 0;
    }
    // 傍晚：活跃
    else if (h >= 18 && h < 23) {
      this.current.excitement += 0.01;
      this.current.interest += 0.01;
      this.heartRate += 2;
    }
  }

  // 共激活扩散
  _coActivation() {
    const additions = {};
    EMOTION_DIMENSIONS.forEach(dim => {
      additions[dim] = 0;
    });

    for (const [source, targets] of Object.entries(CO_ACTIVATION)) {
      const intensity = Math.max(0, this.current[source]);
      for (const [target, factor] of Object.entries(targets)) {
        additions[target] += intensity * factor * 0.3;
      }
    }

    EMOTION_DIMENSIONS.forEach(dim => {
      this.current[dim] += additions[dim];
    });
  }

  // 惯性过滤：防止情绪急转
  _inertiaFilter() {
    const maxChange = cfg.maxDeltaPerTick;
    EMOTION_DIMENSIONS.forEach(dim => {
      const prev = this.current[dim];
      const clamped = Math.max(this.baseline[dim] - 1, Math.min(this.baseline[dim] + 1, this.current[dim]));
      const delta = clamped - prev;
      if (Math.abs(delta) > maxChange) {
        this.current[dim] = prev + Math.sign(delta) * maxChange;
      }
    });
  }

  // 压力-心率双向耦合
  _stressHeartCoupling() {
    // 压力影响心率
    this.heartRate += this.stress * cfg.hrStressFactor * 0.01;
    // 心率反过来影响压力
    if (this.heartRate > cfg.stressThreshold) {
      this.stress += 0.05;
    } else if (this.heartRate < cfg.relaxThreshold) {
      this.stress -= 0.03;
    }
    // 裁剪
    this.heartRate = Math.max(cfg.heartRateMin, Math.min(cfg.heartRateMax, this.heartRate));
    this.stress = Math.max(0, Math.min(10, this.stress));
  }

  // 基线漂移：每次交互偏移 0.1%（永久人格演化）
  _baselineDrift() {
    const DRIFT_RATE = cfg.driftRate;
    EMOTION_DIMENSIONS.forEach(dim => {
      const diff = this.current[dim] - this.baseline[dim];
      this.baseline[dim] += diff * DRIFT_RATE;
    });
  }

  // 裁剪到有效范围
  _clamp() {
    EMOTION_DIMENSIONS.forEach(dim => {
      this.current[dim] = Math.max(-1, Math.min(1, this.current[dim]));
      this.baseline[dim] = Math.max(-1, Math.min(1, this.baseline[dim]));
    });
  }

  // ===== 查询接口 =====

  // 获取主导情绪（前N个）
  getDominantEmotions(n = 3) {
    return EMOTION_DIMENSIONS
      .map(dim => ({ dim, value: this.current[dim] }))
      .sort((a, b) => b.value - a.value)
      .slice(0, n)
      .filter(e => e.value > 0.05);
  }

  // 获取整体情绪效价 (-1 负面 ~ +1 正面)
  getValence() {
    const positive = ['joy', 'contentment', 'satisfaction', 'love', 'pride',
                      'relief', 'amusement', 'awe', 'hope', 'gratitude',
                      'excitement', 'interest', 'triumph', 'calm'];
    const negative = ['sadness', 'anger', 'fear', 'disgust', 'guilt',
                      'shame', 'horror', 'nervousness', 'frustration',
                      'boredom', 'loneliness', 'confusion', 'embarrassment'];

    let pos = 0, neg = 0;
    positive.forEach(d => pos += Math.max(0, this.current[d]));
    negative.forEach(d => neg += Math.max(0, this.current[d]));

    return Math.max(-1, Math.min(1, (pos - neg) / 5));
  }

  // 获取唤醒度 (低 ~ 高)
  getArousal() {
    const highArousal = ['excitement', 'anger', 'fear', 'surprise', 'horror',
                         'nervousness', 'triumph', 'desire'];
    const lowArousal = ['calm', 'boredom', 'contentment', 'sadness', 'relief'];

    let high = 0, low = 0;
    highArousal.forEach(d => high += Math.max(0, this.current[d]));
    lowArousal.forEach(d => low += Math.max(0, this.current[d]));

    return Math.max(0, Math.min(1, (high - low + 1) / 2));
  }

  // 生成情绪描述（用于 prompt 注入）
  // 采用7级强度描述，与Andy保持一致
  toPromptString() {
    // 优先使用Andy注入的情绪数据（如果可用）
    if (this._andyDominant && this._andyDominant.length > 0) {
      return this._generateAndyStylePrompt();
    }

    // 降级：使用Bobby自己的情绪数据
    return this._generateBobbyStylePrompt();
  }

  // 使用Andy数据生成情绪描述
  _generateAndyStylePrompt() {
    const dominant = this._andyDominant.slice(0, 5); // 取前5个
    const valence = this._andyValence || 0;
    const arousal = this._andyArousal || 0.5;
    const stress = this._andyStress || 0;

    return this._formatEmotionPrompt(dominant, valence, arousal, stress);
  }

  // 使用Bobby自己的情绪数据生成描述
  _generateBobbyStylePrompt() {
    const dominant = this.getDominantEmotions(5); // 从3个增加到5个
    if (dominant.length === 0) return '';

    const valence = this.getValence();
    const arousal = this.getArousal();
    const stress = this.stress;

    return this._formatEmotionPrompt(dominant, valence, arousal, stress);
  }

  // 格式化情绪描述（通用方法）
  _formatEmotionPrompt(dominant, valence, arousal, stress) {
    if (dominant.length === 0) return '';

    const emotionNames = {
      joy: '开心', sadness: '难过', anger: '生气', fear: '害怕',
      surprise: '惊讶', disgust: '厌恶', amusement: '觉得好笑',
      awe: '敬畏', contentment: '满足', desire: '渴望',
      embarrassment: '尴尬', guilt: '内疚', horror: '恐惧',
      interest: '感兴趣', love: '喜欢/爱', nervousness: '紧张',
      pride: '自豪', relief: '如释重负', satisfaction: '满意',
      shame: '羞耻', sympathy: '同情', triumph: '得意',
      boredom: '无聊', calm: '平静', confusion: '困惑',
      excitement: '兴奋', frustration: '沮丧/烦躁', gratitude: '感激',
      hope: '希望', loneliness: '孤独'
    };

    // 7级强度描述（与Andy保持一致）
    const intensityLabel = (abs) => {
      if (abs > 0.85) return '极度';
      if (abs > 0.7) return '非常';
      if (abs > 0.55) return '很';
      if (abs > 0.4) return '挺';
      if (abs > 0.25) return '比较';
      if (abs > 0.12) return '有点';
      return '略微';
    };

    // 分离正面和负面情绪
    const positiveEmotions = [];
    const negativeEmotions = [];
    for (const { dim, value } of dominant) {
      if (Math.abs(value) < 0.12) continue;
      const name = emotionNames[dim] || dim;
      const label = intensityLabel(Math.abs(value));
      const negNames = {
        joy: '不开心', contentment: '不满足', calm: '不安',
        excitement: '低落', hope: '失望', satisfaction: '不满意',
      };
      if (value > 0) {
        positiveEmotions.push({ name, label, value, dim });
      } else {
        const displayName = negNames[dim] || name;
        negativeEmotions.push({ name: displayName, label, value: -value, dim });
      }
    }

    // 生成场景叙事
    let scene = '';
    const hasAmbivalence = positiveEmotions.length > 0 && negativeEmotions.length > 0
      && positiveEmotions[0].value > 0.25 && negativeEmotions[0].value > 0.25;

    if (hasAmbivalence) {
      // 矛盾情绪：用对比隐喻
      const pos = positiveEmotions[0];
      const neg = negativeEmotions[0];
      scene = `你的内心处于矛盾之中——${pos.label}${pos.name}的暖意(${pos.value.toFixed(2)})与${neg.label}${neg.name}的阴影(-${neg.value.toFixed(2)})在拉锯`;
      if (positiveEmotions.length > 1) {
        scene += `，同时还夹杂着${positiveEmotions.slice(1, 3).map(e => `${e.label}${e.name}`).join('、')}`;
      }
    } else if (valence > 0.2) {
      // 偏正面
      const top = positiveEmotions[0] || { name: '平静', label: '' };
      scene = `${top.label}${top.name}的情绪主导着你的心境`;
      if (negativeEmotions.length > 0 && negativeEmotions[0].value > 0.15) {
        scene += `，但深处有一丝${negativeEmotions[0].label}${negativeEmotions[0].name}`;
      }
    } else if (valence < -0.2) {
      // 偏负面
      const top = negativeEmotions[0] || { name: '不安', label: '' };
      scene = `${top.label}${top.name}的情绪笼罩着你`;
      if (positiveEmotions.length > 0 && positiveEmotions[0].value > 0.15) {
        scene += `，心底还残留着一些${positiveEmotions[0].label}${positiveEmotions[0].name}`;
      }
    } else {
      // 中性
      const all = [...positiveEmotions, ...negativeEmotions].sort((a, b) => b.value - a.value);
      if (all.length > 0) {
        scene = `你的内心平静而微妙，${all[0].label}${all[0].name}`;
        if (all.length > 1) scene += `与${all[1].label}${all[1].name}并存`;
      } else {
        scene = '你的内心比较平静';
      }
    }

    // 附加关键指标
    const stressDesc = stress > 5 ? '压力很大' : stress > 3 ? '有点压力' : '';
    const energyDesc = arousal > 0.7 ? '精力充沛' : arousal > 0.4 ? '' : '有些疲倦';

    let result = scene;
    if (stressDesc || energyDesc) {
      const extras = [stressDesc, energyDesc].filter(Boolean).join('，');
      result += `。${extras}`;
    }

    return result;
  }

  // 礼物影响情绪
  applyGiftEffect(giftType) {
    if (giftType === 'good') {
      this.current.joy += 0.15;
      this.current.contentment += 0.1;
      this.current.gratitude += 0.12;
      this.stress -= 0.3;
    } else if (giftType === 'bad') {
      this.current.frustration += 0.1;
      this.current.surprise += 0.15;
      this.current.amusement += 0.08; // 好笑多过生气
      this.stress += 0.2;
    }
  }
}

module.exports = { EmotionEngine, EMOTION_DIMENSIONS };
