'use strict';

const { buildXMLArtifact, _internals } = require('../../src/teams/runtime/buildXMLArtifact');
const { buildFilename, safeName }      = _internals;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOptions(overrides = {}) {
  return {
    xmlContent:  '<?xml version="1.0"?><promotions/>',
    campaignId:  '2026_SUMMER_SAS',
    sessionId:   'sess-001',
    blueprintId: 'bp-Summer_SAS_2025',
    generatedAt: '2026-06-15T04:00:00.000Z',
    ...overrides,
  };
}

// ─── Input validation ─────────────────────────────────────────────────────────

describe('buildXMLArtifact — input validation', () => {
  test('throws when xmlContent is empty', () => {
    expect(() => buildXMLArtifact(makeOptions({ xmlContent: '' }))).toThrow('xmlContent must be a non-empty string');
  });
  test('throws when xmlContent is not a string', () => {
    expect(() => buildXMLArtifact(makeOptions({ xmlContent: null }))).toThrow('xmlContent must be a non-empty string');
  });
  test('throws when sessionId is missing', () => {
    expect(() => buildXMLArtifact(makeOptions({ sessionId: '' }))).toThrow('sessionId must be a non-empty string');
  });
  test('throws when blueprintId is missing', () => {
    expect(() => buildXMLArtifact(makeOptions({ blueprintId: '' }))).toThrow('blueprintId must be a non-empty string');
  });
});

// ─── Return shape ─────────────────────────────────────────────────────────────

describe('buildXMLArtifact — return shape', () => {
  let artifact;
  beforeAll(() => { artifact = buildXMLArtifact(makeOptions()); });

  test('has all required fields', () => {
    ['filename', 'xmlContent', 'sessionId', 'blueprintId', 'generatedAt', 'byteSize']
      .forEach(f => expect(artifact).toHaveProperty(f));
  });

  test('xmlContent is preserved verbatim', () => {
    expect(artifact.xmlContent).toBe('<?xml version="1.0"?><promotions/>');
  });

  test('sessionId is preserved', () => {
    expect(artifact.sessionId).toBe('sess-001');
  });

  test('blueprintId is preserved', () => {
    expect(artifact.blueprintId).toBe('bp-Summer_SAS_2025');
  });

  test('generatedAt is preserved', () => {
    expect(artifact.generatedAt).toBe('2026-06-15T04:00:00.000Z');
  });

  test('byteSize is a positive integer', () => {
    expect(Number.isInteger(artifact.byteSize)).toBe(true);
    expect(artifact.byteSize).toBeGreaterThan(0);
  });
});

// ─── Filename generation ──────────────────────────────────────────────────────

describe('buildXMLArtifact — filename', () => {
  test('filename starts with SAS_', () => {
    const a = buildXMLArtifact(makeOptions({ campaignId: '2026_SUMMER_SAS' }));
    expect(a.filename).toMatch(/^SAS_/);
  });

  test('filename ends with .xml', () => {
    const a = buildXMLArtifact(makeOptions());
    expect(a.filename).toMatch(/\.xml$/);
  });

  test('campaignId with hyphens is sanitized', () => {
    // sessionId 'sess-001' → safeName → 'SESS_001'
    const a = buildXMLArtifact(makeOptions({ campaignId: '2026-SUMMER-PROMO' }));
    expect(a.filename).toBe('SAS_2026_SUMMER_PROMO_20260615_SESS_001.xml');
  });

  test('date part derived from generatedAt', () => {
    const a = buildXMLArtifact(makeOptions({ generatedAt: '2026-08-01T00:00:00.000Z' }));
    expect(a.filename).toContain('20260801');
  });

  test('null campaignId uses UNKNOWN', () => {
    const a = buildXMLArtifact(makeOptions({ campaignId: null }));
    expect(a.filename).toMatch(/^SAS_UNKNOWN_/);
  });

  test('generatedAt defaults to now when not provided', () => {
    const before = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const a = buildXMLArtifact({
      xmlContent:  '<?xml version="1.0"?><promotions/>',
      sessionId:   'sess-001',
      blueprintId: 'bp-001',
    });
    const after = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    // The date in the filename must be today (before or same as after)
    // Filename now includes sessionId slug: SAS_..._<YYYYMMDD>_<SLUG>.xml
    const dateInFilename = a.filename.match(/(\d{8})_/)[1];
    expect(dateInFilename >= before).toBe(true);
    expect(dateInFilename <= after).toBe(true);
  });
});

// ─── buildFilename internal ───────────────────────────────────────────────────

describe('buildFilename', () => {
  test('standard campaign without sessionId produces date-only filename', () => {
    expect(buildFilename('2026_SUMMER_SAS', '2026-06-15T04:00:00.000Z'))
      .toBe('SAS_2026_SUMMER_SAS_20260615.xml');
  });

  test('with sessionId appends sanitized session slug (max 16 chars)', () => {
    expect(buildFilename('2026_SUMMER_SAS', '2026-06-15T04:00:00.000Z', 'sess-001'))
      .toBe('SAS_2026_SUMMER_SAS_20260615_SESS_001.xml');
  });

  test('sessionId slug is capped at 16 chars of safeName', () => {
    const f = buildFilename('CAM', '2026-06-15T04:00:00.000Z', 'very-long-session-id-that-exceeds-limit');
    // safeName('very-long-session-id-that-exceeds-limit').slice(0,16) = 'VERY_LONG_SESSIO'
    expect(f).toBe('SAS_CAM_20260615_VERY_LONG_SESSIO.xml');
  });

  test('missing generatedAt uses fallback date', () => {
    const f = buildFilename('CAM', null);
    expect(f).toBe('SAS_CAM_00000000.xml');
  });
});

// ─── safeName internal ────────────────────────────────────────────────────────

describe('safeName', () => {
  test('uppercases the value', () => {
    expect(safeName('summer')).toBe('SUMMER');
  });
  test('replaces hyphens with underscores', () => {
    expect(safeName('2026-SUMMER')).toBe('2026_SUMMER');
  });
  test('replaces spaces with underscores', () => {
    expect(safeName('Summer SAS')).toBe('SUMMER_SAS');
  });
  test('null returns UNKNOWN', () => {
    expect(safeName(null)).toBe('UNKNOWN');
  });
});

// ─── byteSize ─────────────────────────────────────────────────────────────────

describe('buildXMLArtifact — byteSize', () => {
  test('byteSize matches Buffer.byteLength of xmlContent', () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?><promotions/>';
    const a = buildXMLArtifact(makeOptions({ xmlContent: xml }));
    expect(a.byteSize).toBe(Buffer.byteLength(xml, 'utf8'));
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('buildXMLArtifact — determinism', () => {
  test('same inputs produce identical output', () => {
    const opts = makeOptions();
    expect(JSON.stringify(buildXMLArtifact(opts))).toBe(JSON.stringify(buildXMLArtifact(opts)));
  });
});
