'use strict';

const { parse, parseDates } = require('../../../src/services/parserStrategies/scheduleParser');

const NOW = new Date('2026-01-15T12:00:00.000Z');

describe('scheduleParser.parse', () => {
  describe('ISO date range', () => {
    test('explicit ISO range', () => {
      const r = parse('2025-06-01 to 2025-06-30', NOW);
      expect(r.confidence).toBeGreaterThan(0.90);
      expect(r.value.startDate).toContain('2025-06-01');
      expect(r.matchedPatterns).toContain('iso-range');
    });
  });

  describe('named month range', () => {
    test('Jan 1 to Jan 31 2025', () => {
      const r = parse('from Jan 1 to Jan 31 2025', NOW);
      expect(new Date(r.value.startDate).getUTCMonth()).toBe(0);
      expect(new Date(r.value.endDate).getUTCDate()).toBe(31);
      expect(r.matchedPatterns).toContain('named-month-range');
    });
  });

  describe('single month', () => {
    test('in July → July of upcoming year', () => {
      const r = parse('10% off in July', NOW);
      expect(new Date(r.value.startDate).getUTCMonth()).toBe(6);
      expect(new Date(r.value.startDate).getUTCDate()).toBe(1);
    });

    test('during August 2026', () => {
      const r = parse('during August 2026', NOW);
      expect(new Date(r.value.startDate).getUTCFullYear()).toBe(2026);
      expect(new Date(r.value.startDate).getUTCMonth()).toBe(7);
    });
  });

  describe('named events', () => {
    test('christmas → December', () => {
      const r = parse('christmas sale', NOW);
      expect(new Date(r.value.startDate).getUTCMonth()).toBe(11);
    });

    test('black friday → November', () => {
      const r = parse('Black Friday deal', NOW);
      expect(new Date(r.value.startDate).getUTCMonth()).toBe(10);
    });

    test('cyber monday', () => {
      const r = parse('Cyber Monday sale', NOW);
      expect(new Date(r.value.startDate).getUTCMonth()).toBe(10);
      expect(new Date(r.value.startDate).getUTCDate()).toBe(27);
    });

    test('valentines day → February', () => {
      const r = parse("Valentine's Day promo", NOW);
      expect(new Date(r.value.startDate).getUTCMonth()).toBe(1);
    });
  });

  describe('relative keywords', () => {
    test('this week → 7-day window', () => {
      const r = parse('free shipping this week', NOW);
      const diff = Math.round((new Date(r.value.endDate) - new Date(r.value.startDate)) / 86400000);
      expect(diff).toBe(7);
    });

    test('this month → start/end of January 2026', () => {
      const r = parse('this month promo', NOW);
      expect(new Date(r.value.startDate).getUTCDate()).toBe(1);
      expect(new Date(r.value.endDate).getUTCMonth()).toBe(0);
    });

    test('next month → February 2026', () => {
      const r = parse('next month promotion', NOW);
      expect(new Date(r.value.startDate).getUTCMonth()).toBe(1);
    });

    test('this weekend → Sat-Sun', () => {
      const r = parse('free shipping this weekend', NOW);
      const diff = Math.round((new Date(r.value.endDate) - new Date(r.value.startDate)) / 86400000);
      expect(diff).toBe(1);
    });
  });

  describe('duration', () => {
    test('for 30 days', () => {
      const r = parse('promotion runs for 30 days', NOW);
      const diff = Math.round((new Date(r.value.endDate) - new Date(r.value.startDate)) / 86400000);
      expect(diff).toBe(30);
    });

    test('for 2 weeks', () => {
      const r = parse('sale for 2 weeks', NOW);
      const diff = Math.round((new Date(r.value.endDate) - new Date(r.value.startDate)) / 86400000);
      expect(diff).toBe(14);
    });
  });

  describe('fallback', () => {
    test('no date → 90-day default with low confidence', () => {
      const r = parse('10% off everything', NOW);
      expect(r.confidence).toBeLessThan(0.20);
      expect(r.warnings.length).toBeGreaterThan(0);
      const diff = Math.round((new Date(r.value.endDate) - new Date(r.value.startDate)) / 86400000);
      expect(diff).toBe(90);
    });
  });
});

describe('parseDates (compat)', () => {
  test('returns { startDate, endDate } for this month', () => {
    const { startDate, endDate } = parseDates('save 10% this month', NOW);
    expect(new Date(startDate).getUTCDate()).toBe(1);
    expect(new Date(endDate).getUTCMonth()).toBe(new Date(startDate).getUTCMonth());
  });
});
