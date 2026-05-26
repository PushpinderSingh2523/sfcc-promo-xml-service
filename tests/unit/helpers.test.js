const { slugify, toISODate, addDays } = require('../../src/utils/helpers');

describe('helpers.slugify', () => {
  it('converts spaces to hyphens', () => {
    expect(slugify('Summer Sale 2025')).toBe('summer-sale-2025');
  });

  it('strips special characters', () => {
    expect(slugify('10% Off!')).toBe('10-off');
  });

  it('collapses multiple hyphens', () => {
    expect(slugify('hello---world')).toBe('hello-world');
  });

  it('truncates to 50 characters', () => {
    const long = 'a'.repeat(100);
    expect(slugify(long)).toHaveLength(50);
  });

  it('handles already-lowercase kebab string', () => {
    expect(slugify('already-kebab')).toBe('already-kebab');
  });
});

describe('helpers.toISODate', () => {
  it('passes through valid ISO string', () => {
    const iso = '2025-06-01T00:00:00.000Z';
    expect(toISODate(iso)).toBe(iso);
  });

  it('returns a date string for valid date input', () => {
    const result = toISODate('2025-06-01');
    expect(result).toContain('2025-06-01');
  });

  it('returns today for null input', () => {
    const result = toISODate(null);
    expect(new Date(result).getTime()).toBeGreaterThan(0);
  });

  it('returns today for invalid input', () => {
    const result = toISODate('not-a-date');
    expect(new Date(result).getTime()).toBeGreaterThan(0);
  });
});

describe('helpers.addDays', () => {
  it('adds days to a date', () => {
    const base = new Date('2025-01-01T00:00:00.000Z');
    const result = addDays(base, 30);
    expect(result).toContain('2025-01-31');
  });

  it('handles string input', () => {
    const start = new Date('2025-01-01T00:00:00.000Z');
    const result = addDays('2025-01-01T00:00:00.000Z', 90);
    const diffMs = new Date(result).getTime() - start.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(90);
  });
});
