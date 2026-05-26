'use strict';

/**
 * scheduleParser.js
 *
 * Extracts promotion schedule (startDate, endDate) from natural language.
 * All dates are UTC-safe using Date.UTC() — no local-timezone influence.
 *
 * parse() → { value: { startDate, endDate, level }, confidence, matchedPatterns, warnings }
 *
 * level: 'campaign' | 'assignment' | 'none'  (advisory to orchestrator)
 */

const { addDays } = require('../../utils/helpers');

const MONTH_MAP = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

const MONTH_NAMES_RE = Object.keys(MONTH_MAP).join('|');

function utcMonthStart(year, month) {
  return new Date(Date.UTC(year, month, 1, 0, 0, 0));
}

function utcMonthEnd(year, month) {
  return new Date(Date.UTC(year, month + 1, 0, 23, 59, 59));
}

// ─── Backward-compat export (same signature as old localParser.parseDates) ────

function parseDates(text, now = new Date()) {
  return parse(text, now).value;
}

// ─── Main export ───────────────────────────────────────────────────────────────

function parse(text, now = new Date()) {
  const lower = text.toLowerCase();
  const nowYear  = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth();

  // 1. Explicit ISO dates: "2025-06-01 to 2025-06-30"
  const isoRange = text.match(
    /(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?)\s*(?:to|[-–])\s*(\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?)/i
  );
  if (isoRange) {
    return {
      value: { startDate: new Date(isoRange[1]).toISOString(), endDate: new Date(isoRange[2]).toISOString(), level: 'assignment' },
      confidence: 0.97,
      matchedPatterns: ['iso-range'],
      warnings: [],
    };
  }

  // 2. Explicit named-month range: "from Jan 1 to Jan 31 2025"
  const explicitRange = text.match(
    /(?:from\s+)?([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*(?:to|[-–])\s*([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})?/i
  );
  if (explicitRange) {
    const [, sm, sd, em, ed, yr] = explicitRange;
    const year = yr ? parseInt(yr, 10) : nowYear;
    const sIdx = MONTH_MAP[sm.toLowerCase()];
    const eIdx = MONTH_MAP[em.toLowerCase()];
    if (sIdx !== undefined && eIdx !== undefined) {
      return {
        value: {
          startDate: new Date(Date.UTC(year, sIdx, parseInt(sd, 10), 0, 0, 0)).toISOString(),
          endDate:   new Date(Date.UTC(year, eIdx, parseInt(ed, 10), 23, 59, 59)).toISOString(),
          level: 'assignment',
        },
        confidence: 0.95,
        matchedPatterns: ['named-month-range'],
        warnings: [],
      };
    }
  }

  // 3. Single month + optional year: "in July 2025", "during August"
  const monthYearMatch = text.match(
    new RegExp(`\\b(${MONTH_NAMES_RE})\\b(?:[^\\d]*(\\d{4}))?`, 'i')
  );
  if (monthYearMatch) {
    const monthName = monthYearMatch[1].toLowerCase();
    let year = monthYearMatch[2] ? parseInt(monthYearMatch[2], 10) : nowYear;
    const monthIdx = MONTH_MAP[monthName];
    if (monthIdx !== undefined) {
      if (!monthYearMatch[2] && (monthIdx < nowMonth || (monthIdx === nowMonth && utcMonthEnd(year, monthIdx) < now))) {
        year += 1;
      }
      return {
        value: {
          startDate: utcMonthStart(year, monthIdx).toISOString(),
          endDate:   utcMonthEnd(year, monthIdx).toISOString(),
          level: 'campaign',
        },
        confidence: 0.82,
        matchedPatterns: ['single-month'],
        warnings: [],
      };
    }
  }

  // 4. Named events
  if (/\b(?:holiday|christmas|xmas)\b/i.test(lower)) {
    const year = nowMonth >= 11 ? nowYear + 1 : nowYear;
    return {
      value: {
        startDate: utcMonthStart(year, 11).toISOString(),
        endDate:   utcMonthEnd(year, 11).toISOString(),
        level: 'campaign',
      },
      confidence: 0.78,
      matchedPatterns: ['holiday-christmas'],
      warnings: [],
    };
  }

  if (/\bblack\s*friday\b/i.test(lower)) {
    return {
      value: {
        startDate: new Date(Date.UTC(nowYear, 10, 24, 0, 0, 0)).toISOString(),
        endDate:   new Date(Date.UTC(nowYear, 10, 27, 23, 59, 59)).toISOString(),
        level: 'campaign',
      },
      confidence: 0.85,
      matchedPatterns: ['black-friday'],
      warnings: [],
    };
  }

  if (/\bcyber\s*monday\b/i.test(lower)) {
    return {
      value: {
        startDate: new Date(Date.UTC(nowYear, 10, 27, 0, 0, 0)).toISOString(),
        endDate:   new Date(Date.UTC(nowYear, 10, 27, 23, 59, 59)).toISOString(),
        level: 'campaign',
      },
      confidence: 0.85,
      matchedPatterns: ['cyber-monday'],
      warnings: [],
    };
  }

  if (/\bvalentine(?:'?s)?\s*day\b/i.test(lower)) {
    const year = (nowMonth >= 1 && now > new Date(Date.UTC(nowYear, 1, 14))) ? nowYear + 1 : nowYear;
    return {
      value: {
        startDate: new Date(Date.UTC(year, 1, 10, 0, 0, 0)).toISOString(),
        endDate:   new Date(Date.UTC(year, 1, 14, 23, 59, 59)).toISOString(),
        level: 'campaign',
      },
      confidence: 0.80,
      matchedPatterns: ['valentines-day'],
      warnings: [],
    };
  }

  if (/\bmother(?:'?s)?\s*day\b/i.test(lower)) {
    return {
      value: {
        startDate: utcMonthStart(nowYear, 4).toISOString(),
        endDate:   utcMonthEnd(nowYear, 4).toISOString(),
        level: 'campaign',
      },
      confidence: 0.78,
      matchedPatterns: ["mothers-day"],
      warnings: [],
    };
  }

  if (/\bbirthday\b/i.test(lower)) {
    return {
      value: {
        startDate: utcMonthStart(nowYear, nowMonth).toISOString(),
        endDate:   utcMonthEnd(nowYear, nowMonth).toISOString(),
        level: 'campaign',
      },
      confidence: 0.60,
      matchedPatterns: ['birthday-event'],
      warnings: ['Birthday date resolved to current month — verify if a specific month is intended.'],
    };
  }

  // 5. Relative keywords
  if (/\bthis\s+week\b/i.test(lower)) {
    return {
      value: { startDate: new Date(now).toISOString(), endDate: addDays(now, 7), level: 'assignment' },
      confidence: 0.80,
      matchedPatterns: ['this-week'],
      warnings: [],
    };
  }

  if (/\bthis\s+month\b/i.test(lower)) {
    return {
      value: {
        startDate: utcMonthStart(nowYear, nowMonth).toISOString(),
        endDate:   utcMonthEnd(nowYear, nowMonth).toISOString(),
        level: 'campaign',
      },
      confidence: 0.80,
      matchedPatterns: ['this-month'],
      warnings: [],
    };
  }

  if (/\bnext\s+month\b/i.test(lower)) {
    return {
      value: {
        startDate: utcMonthStart(nowYear, nowMonth + 1).toISOString(),
        endDate:   utcMonthEnd(nowYear, nowMonth + 1).toISOString(),
        level: 'campaign',
      },
      confidence: 0.80,
      matchedPatterns: ['next-month'],
      warnings: [],
    };
  }

  if (/\bthis\s+weekend\b/i.test(lower)) {
    const day = now.getUTCDay();
    const toSat = day === 6 ? 0 : 6 - day;
    return {
      value: { startDate: addDays(now, toSat), endDate: addDays(now, toSat + 1), level: 'assignment' },
      confidence: 0.75,
      matchedPatterns: ['this-weekend'],
      warnings: [],
    };
  }

  if (/\bnext\s+week\b/i.test(lower)) {
    return {
      value: { startDate: addDays(now, 7), endDate: addDays(now, 14), level: 'assignment' },
      confidence: 0.75,
      matchedPatterns: ['next-week'],
      warnings: [],
    };
  }

  // 6. Duration: "for 30 days", "for 2 weeks"
  const durationDays = text.match(/for\s+(\d+)\s+days?/i);
  if (durationDays) {
    const d = parseInt(durationDays[1], 10);
    return {
      value: { startDate: new Date(now).toISOString(), endDate: addDays(now, d), level: 'assignment' },
      confidence: 0.72,
      matchedPatterns: ['duration-days'],
      warnings: [],
    };
  }

  const durationWeeks = text.match(/for\s+(\d+)\s+weeks?/i);
  if (durationWeeks) {
    const w = parseInt(durationWeeks[1], 10);
    return {
      value: { startDate: new Date(now).toISOString(), endDate: addDays(now, w * 7), level: 'assignment' },
      confidence: 0.72,
      matchedPatterns: ['duration-weeks'],
      warnings: [],
    };
  }

  // 7. No schedule detected — default 90 days
  return {
    value: { startDate: new Date(now).toISOString(), endDate: addDays(now, 90), level: 'none' },
    confidence: 0.10,
    matchedPatterns: ['fallback-90-days'],
    warnings: ['No schedule detected — defaulting to 90 days from today. A schedule is recommended.'],
  };
}

module.exports = { parse, parseDates, MONTH_MAP, utcMonthStart, utcMonthEnd };
