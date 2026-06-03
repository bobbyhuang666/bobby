/**
 * 时间工具测试
 *
 * 测试共享时间工具函数：
 *   - getTimeLabel
 *   - isNight
 *   - getTimePeriod
 */

const { getTimeLabel, isNight, getTimePeriod } = require('../../utils/time');

describe('时间工具', () => {

  afterEach(() => {
    jest.useRealTimers();
  });

  // ═══════════════════════════════════════════
  // getTimeLabel
  // ═══════════════════════════════════════════
  describe('getTimeLabel', () => {
    it('23点 → 深夜', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 23:30:00'));
      expect(getTimeLabel()).toBe('深夜');
    });

    it('0点 → 深夜', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 00:30:00'));
      expect(getTimeLabel()).toBe('深夜');
    });

    it('1点 → 凌晨', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 01:30:00'));
      expect(getTimeLabel()).toBe('凌晨');
    });

    it('2点 → 凌晨', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 02:30:00'));
      expect(getTimeLabel()).toBe('凌晨');
    });

    it('4点 → 天快亮了', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 04:00:00'));
      expect(getTimeLabel()).toBe('天快亮了');
    });

    it('8点 → 上午', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 08:00:00'));
      expect(getTimeLabel()).toBe('上午');
    });

    it('10点 → 上午', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 10:00:00'));
      expect(getTimeLabel()).toBe('上午');
    });

    it('12点 → 中午', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 12:00:00'));
      expect(getTimeLabel()).toBe('中午');
    });

    it('15点 → 下午', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 15:00:00'));
      expect(getTimeLabel()).toBe('下午');
    });

    it('19点 → 傍晚', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 19:00:00'));
      expect(getTimeLabel()).toBe('傍晚');
    });

    it('21点 → 晚上', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 21:00:00'));
      expect(getTimeLabel()).toBe('晚上');
    });

    it('22点 → 晚上', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 22:00:00'));
      expect(getTimeLabel()).toBe('晚上');
    });
  });

  // ═══════════════════════════════════════════
  // isNight
  // ═══════════════════════════════════════════
  describe('isNight', () => {
    it('23点 → 夜晚', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 23:30:00'));
      expect(isNight()).toBe(true);
    });

    it('0点 → 夜晚', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 00:00:00'));
      expect(isNight()).toBe(true);
    });

    it('2点 → 夜晚', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 02:00:00'));
      expect(isNight()).toBe(true);
    });

    it('3点 → 不是夜晚', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 03:00:00'));
      expect(isNight()).toBe(false);
    });

    it('12点 → 不是夜晚', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 12:00:00'));
      expect(isNight()).toBe(false);
    });

    it('22点 → 不是夜晚', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 22:00:00'));
      expect(isNight()).toBe(false);
    });
  });

  // ═══════════════════════════════════════════
  // getTimePeriod
  // ═══════════════════════════════════════════
  describe('getTimePeriod', () => {
    it('0点 → lateNight', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 00:00:00'));
      expect(getTimePeriod()).toBe('lateNight');
    });

    it('2点 → lateNight', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 02:00:00'));
      expect(getTimePeriod()).toBe('lateNight');
    });

    it('4点 → earlyMorning', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 04:00:00'));
      expect(getTimePeriod()).toBe('earlyMorning');
    });

    it('8点 → morning', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 08:00:00'));
      expect(getTimePeriod()).toBe('morning');
    });

    it('11点 → morning', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 11:00:00'));
      expect(getTimePeriod()).toBe('morning');
    });

    it('13点 → afternoon', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 13:00:00'));
      expect(getTimePeriod()).toBe('afternoon');
    });

    it('18点 → evening', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 18:00:00'));
      expect(getTimePeriod()).toBe('evening');
    });

    it('20点 → evening', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 20:00:00'));
      expect(getTimePeriod()).toBe('evening');
    });

    it('22点 → night', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 22:00:00'));
      expect(getTimePeriod()).toBe('night');
    });

    it('23点 → lateNight', () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-01 23:00:00'));
      expect(getTimePeriod()).toBe('lateNight');
    });
  });
});
