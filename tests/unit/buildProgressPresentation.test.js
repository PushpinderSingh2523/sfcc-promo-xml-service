'use strict';

const { buildProgressPresentation } = require('../../src/presentation/adapters/buildProgressPresentation');
const { GROUP_ORDER }               = require('../../src/blueprints/fieldRegistry/sasEditableFieldRegistry');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(overrides = {}) {
  const groupedProgress = {};
  GROUP_ORDER.forEach(g => {
    groupedProgress[g] = { total: 0, answered: 0, complete: false };
  });
  // Put some questions in Campaign and Identity
  groupedProgress['Campaign']  = { total: 1, answered: 1, complete: true };
  groupedProgress['Identity']  = { total: 4, answered: 2, complete: false };
  groupedProgress['Scheduling'] = { total: 2, answered: 0, complete: false };

  return {
    sessionId:            'test-session',
    status:               'IN_PROGRESS',
    completionPercentage: 43,
    currentGroup:         'Identity',
    questionQueue:        new Array(7).fill(null).map((_, i) => ({ key: `k${i}` })),
    answers: {
      'campaignId::campaign::_::_': { normalizedValue: 'VAL' },
      'promotionId::promotion::0::_': { normalizedValue: 'P0' },
      'promotionId::promotion::1::_': { normalizedValue: 'P1' },
    },
    invalidFields: {},
    groupedProgress,
    ...overrides,
  };
}

// ─── Input validation ─────────────────────────────────────────────────────────

describe('buildProgressPresentation — input validation', () => {
  test('throws when session is null', () => {
    expect(() => buildProgressPresentation(null)).toThrow('session must be a non-null object');
  });

  test('throws when session is not an object', () => {
    expect(() => buildProgressPresentation('bad')).toThrow('session must be a non-null object');
  });
});

// ─── Return shape ─────────────────────────────────────────────────────────────

describe('buildProgressPresentation — return shape', () => {
  let presentation;

  beforeAll(() => { presentation = buildProgressPresentation(makeSession()); });

  test('type is "progress"', () => {
    expect(presentation.type).toBe('progress');
  });

  test('has all required fields', () => {
    const required = [
      'type', 'currentGroup', 'completedQuestions', 'totalQuestions',
      'remainingQuestions', 'completionPercentage', 'status', 'groups',
    ];
    required.forEach(field => expect(presentation).toHaveProperty(field));
  });

  test('groups is an array', () => {
    expect(Array.isArray(presentation.groups)).toBe(true);
  });

  test('each group entry has group, total, answered, complete', () => {
    presentation.groups.forEach(g => {
      expect(g).toHaveProperty('group');
      expect(g).toHaveProperty('total');
      expect(g).toHaveProperty('answered');
      expect(g).toHaveProperty('complete');
    });
  });
});

// ─── Counts ───────────────────────────────────────────────────────────────────

describe('buildProgressPresentation — counts', () => {
  test('totalQuestions = questionQueue.length', () => {
    const p = buildProgressPresentation(makeSession());
    expect(p.totalQuestions).toBe(7);
  });

  test('completedQuestions = valid answer count (excludes invalid)', () => {
    const session = makeSession({
      answers: {
        'k1': { normalizedValue: 'V1' },
        'k2': { normalizedValue: 'V2' },
      },
      invalidFields: { 'k2': { errors: [] } },
    });
    const p = buildProgressPresentation(session);
    expect(p.completedQuestions).toBe(1); // k1 is valid; k2 is invalid
  });

  test('remainingQuestions = totalQuestions - completedQuestions', () => {
    const p = buildProgressPresentation(makeSession());
    expect(p.remainingQuestions).toBe(p.totalQuestions - p.completedQuestions);
  });

  test('completionPercentage from session', () => {
    const p = buildProgressPresentation(makeSession({ completionPercentage: 75 }));
    expect(p.completionPercentage).toBe(75);
  });

  test('status from session', () => {
    const p = buildProgressPresentation(makeSession({ status: 'VALIDATION_FAILED' }));
    expect(p.status).toBe('VALIDATION_FAILED');
  });

  test('currentGroup from session', () => {
    const p = buildProgressPresentation(makeSession({ currentGroup: 'Discounting' }));
    expect(p.currentGroup).toBe('Discounting');
  });

  test('currentGroup null when session.currentGroup is null', () => {
    const p = buildProgressPresentation(makeSession({ currentGroup: null }));
    expect(p.currentGroup).toBeNull();
  });
});

// ─── Group ordering ───────────────────────────────────────────────────────────

describe('buildProgressPresentation — group ordering', () => {
  test('groups follow GROUP_ORDER exactly', () => {
    const p = buildProgressPresentation(makeSession());
    const groupNames = p.groups.map(g => g.group);
    // Groups with questions: Campaign (pos 0), Identity (pos 1), Scheduling (pos 2)
    expect(groupNames[0]).toBe('Campaign');
    expect(groupNames[1]).toBe('Identity');
    expect(groupNames[2]).toBe('Scheduling');
  });

  test('groups with total=0 are omitted', () => {
    const p = buildProgressPresentation(makeSession());
    p.groups.forEach(g => expect(g.total).toBeGreaterThan(0));
  });

  test('all 12 group slots available but only non-empty shown', () => {
    const p = buildProgressPresentation(makeSession());
    expect(p.groups.length).toBe(3); // Campaign + Identity + Scheduling
  });

  test('group complete=true when answered===total>0', () => {
    const p = buildProgressPresentation(makeSession());
    const campaignGroup = p.groups.find(g => g.group === 'Campaign');
    expect(campaignGroup.complete).toBe(true);
  });

  test('group complete=false when answered<total', () => {
    const p = buildProgressPresentation(makeSession());
    const identityGroup = p.groups.find(g => g.group === 'Identity');
    expect(identityGroup.complete).toBe(false);
  });
});

// ─── Mutation safety ──────────────────────────────────────────────────────────

describe('buildProgressPresentation — mutation safety', () => {
  test('does NOT mutate the input session', () => {
    const s        = makeSession();
    const snapshot = JSON.stringify(s);
    buildProgressPresentation(s);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  test('modifying returned groups does not affect re-build', () => {
    const s = makeSession();
    const p = buildProgressPresentation(s);
    p.groups.push({ group: 'Fake', total: 99, answered: 0, complete: false });
    const p2 = buildProgressPresentation(s);
    expect(p2.groups.length).toBe(3); // unchanged
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('buildProgressPresentation — determinism', () => {
  test('same session produces identical output', () => {
    const s = makeSession();
    expect(JSON.stringify(buildProgressPresentation(s)))
      .toBe(JSON.stringify(buildProgressPresentation(s)));
  });
});

// ─── Summer_SAS.xml integration ───────────────────────────────────────────────

describe('buildProgressPresentation — Summer_SAS.xml session', () => {
  const path = require('path');
  const fs   = require('fs');
  const { extractSASBlueprint }    = require('../../src/blueprints/extractors/extractSASBlueprint');
  const { createBlueprintSession } = require('../../src/blueprints/session/createBlueprintSession');

  let session;

  beforeAll(() => {
    const xml = fs.readFileSync(path.resolve(__dirname, '../fixtures/Summer_SAS.xml'), 'utf8');
    const bp  = extractSASBlueprint(xml);
    session   = createBlueprintSession(bp, { sessionId: 'prog-test', createdAt: '2026-01-01T00:00:00.000Z' });
  });

  test('produces progress presentation without error', () => {
    expect(() => buildProgressPresentation(session)).not.toThrow();
  });

  test('totalQuestions is 35', () => {
    expect(buildProgressPresentation(session).totalQuestions).toBe(35);
  });

  test('completedQuestions is 0 at session start', () => {
    expect(buildProgressPresentation(session).completedQuestions).toBe(0);
  });

  test('groups follow GROUP_ORDER for Summer_SAS.xml groups', () => {
    const p = buildProgressPresentation(session);
    const groupNames = p.groups.map(g => g.group);
    // Campaign must precede Identity, Identity must precede Scheduling
    expect(groupNames.indexOf('Campaign')).toBeLessThan(groupNames.indexOf('Identity'));
    expect(groupNames.indexOf('Identity')).toBeLessThan(groupNames.indexOf('Scheduling'));
  });

  test('no group with total=0 included', () => {
    const p = buildProgressPresentation(session);
    p.groups.forEach(g => expect(g.total).toBeGreaterThan(0));
  });
});
