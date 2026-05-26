'use strict';

const {
  buildRendererPayloads,
  _internals: { buildCampaignPayload, buildPromotionPayloads, buildAssignmentPayloads, answered },
} = require('../../src/blueprints/session/buildRendererPayloads');
const { STATUS } = require('../../src/blueprints/session/updateBlueprintSession');
const { buildAnswerKey } = require('../../src/blueprints/session/buildQuestionQueue');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeBlueprint(overrides = {}) {
  return {
    blueprintId: 'test-bp',
    campaignSlot: {
      frozenStructure: { enabledFlag: true, campaignScope: { applicableOnline: true } },
      editableFields:  { campaignId: '2025_SUMMER_SAS' },
    },
    promotionSlots: [{
      slotIndex: 0,
      frozenStructure: {
        enabledFlag: true, archivedFlag: false,
        nameLocales: ['x-default', 'en'],
        discountFamily: 'simple', simpleDiscountType: 'percentage',
        frozenCustomAttributes: [{ attributeId: 'someAttr', value: 'frozen' }],
      },
      editableFields: {
        promotionId: 'PROMO_A',
        names: [
          { xmlLang: 'x-default', value: 'Promo A' },
          { xmlLang: 'en',        value: 'Promo A EN' },
        ],
        simpleDiscountValue: 20,
        discountEntries: null,
        editableCustomAttributes: [
          { attributeId: 'storefront_msg_cart_inclusion', xmlLang: 'x-default', value: 'Old Inclusion Msg' },
        ],
      },
    }],
    assignmentSlots: [{
      slotIndex: 0,
      frozenStructure: {
        qualifiers: { matchMode: 'any' },
        rank: 10, hasStartDate: false, hasEndDate: true,
      },
      editableFields: {
        promotionId: 'PROMO_A',
        campaignId:  '2025_SUMMER_SAS',
        couponIds:   null,
        startDate:   null,
        endDate:     '2025-07-08T04:00:00.000Z',
      },
    }],
    ...overrides,
  };
}

function makeAnswerRecord(key, value) {
  return {
    fieldId: key.split('::')[0], key, slotType: key.split('::')[1],
    slotIndex: null, xmlLang: null, normalizedValue: value, answeredAt: '2026-01-01T00:01:00.000Z',
  };
}

function makeSession(answers = {}, overrides = {}) {
  return {
    sessionId:  'test-session',
    blueprintId: 'test-bp',
    status:     STATUS.COMPLETE,
    answers,
    invalidFields: {},
    ...overrides,
  };
}

// ─── answered helper ──────────────────────────────────────────────────────────

describe('_internals.answered', () => {
  const answers = {
    'campaignId::campaign::_::_': {
      fieldId: 'campaignId', key: 'campaignId::campaign::_::_',
      normalizedValue: '2026_SUMMER_SAS', answeredAt: '2026-01-01T00:01:00.000Z',
    },
  };

  test('returns normalizedValue when key exists in answers', () => {
    expect(answered(answers, 'campaignId::campaign::_::_', 'FALLBACK')).toBe('2026_SUMMER_SAS');
  });

  test('returns fallback when key does not exist', () => {
    expect(answered(answers, 'missing::key::_::_', 'FALLBACK')).toBe('FALLBACK');
  });

  test('fallback can be null', () => {
    expect(answered({}, 'any::key::_::_', null)).toBeNull();
  });

  test('fallback can be an array', () => {
    expect(answered({}, 'any::key::_::_', ['a', 'b'])).toEqual(['a', 'b']);
  });
});

// ─── buildRendererPayloads — input validation ─────────────────────────────────

describe('buildRendererPayloads — input validation', () => {
  test('throws when session is null', () => {
    expect(() => buildRendererPayloads(null, makeBlueprint()))
      .toThrow('session must be a non-null object');
  });

  test('throws when blueprint is null', () => {
    expect(() => buildRendererPayloads(makeSession(), null))
      .toThrow('blueprint must be a non-null object');
  });

  test('throws when session is CANCELLED', () => {
    expect(() => buildRendererPayloads(makeSession({}, { status: STATUS.CANCELLED }), makeBlueprint()))
      .toThrow('Cannot build payloads from a CANCELLED session');
  });

  test('does not throw for COMPLETE session', () => {
    expect(() => buildRendererPayloads(makeSession({}, { status: STATUS.COMPLETE }), makeBlueprint()))
      .not.toThrow();
  });

  test('does not throw for IN_PROGRESS session', () => {
    expect(() => buildRendererPayloads(makeSession({}, { status: STATUS.IN_PROGRESS }), makeBlueprint()))
      .not.toThrow();
  });
});

// ─── buildRendererPayloads — return shape ─────────────────────────────────────

describe('buildRendererPayloads — return shape', () => {
  let result;

  beforeAll(() => {
    result = buildRendererPayloads(makeSession(), makeBlueprint());
  });

  test('returns { campaignSlot, promotionSlots, assignmentSlots }', () => {
    expect(result).toHaveProperty('campaignSlot');
    expect(result).toHaveProperty('promotionSlots');
    expect(result).toHaveProperty('assignmentSlots');
  });

  test('promotionSlots is an array with one entry', () => {
    expect(Array.isArray(result.promotionSlots)).toBe(true);
    expect(result.promotionSlots).toHaveLength(1);
  });

  test('assignmentSlots is an array with one entry', () => {
    expect(Array.isArray(result.assignmentSlots)).toBe(true);
    expect(result.assignmentSlots).toHaveLength(1);
  });
});

// ─── buildCampaignPayload ─────────────────────────────────────────────────────

describe('_internals.buildCampaignPayload', () => {
  test('uses answered campaignId when present', () => {
    const answers = {
      'campaignId::campaign::_::_': makeAnswerRecord('campaignId::campaign::_::_', '2026_SUMMER_SAS'),
    };
    const payload = buildCampaignPayload(makeBlueprint(), answers);
    expect(payload.editableFields.campaignId).toBe('2026_SUMMER_SAS');
  });

  test('falls back to original campaignId when not answered', () => {
    const payload = buildCampaignPayload(makeBlueprint(), {});
    expect(payload.editableFields.campaignId).toBe('2025_SUMMER_SAS');
  });

  test('frozenStructure is shallow-copied unchanged', () => {
    const bp      = makeBlueprint();
    const payload = buildCampaignPayload(bp, {});
    expect(payload.frozenStructure).toEqual(bp.campaignSlot.frozenStructure);
    expect(payload.frozenStructure).not.toBe(bp.campaignSlot.frozenStructure);
  });
});

// ─── buildPromotionPayloads ───────────────────────────────────────────────────

describe('_internals.buildPromotionPayloads', () => {
  const PROMO_ID_KEY   = buildAnswerKey('promotionId',         'promotion', 0, null);
  const NAME_XDEFAULT  = buildAnswerKey('name',                'promotion', 0, 'x-default');
  const NAME_EN        = buildAnswerKey('name',                'promotion', 0, 'en');
  const SDV_KEY        = buildAnswerKey('simpleDiscountValue',  'promotion', 0, null);
  const ATTR_KEY       = buildAnswerKey('storefront_msg_cart_inclusion', 'promotion', 0, 'x-default');

  test('uses answered promotionId', () => {
    const answers = { [PROMO_ID_KEY]: makeAnswerRecord(PROMO_ID_KEY, 'NEW_PROMO_A') };
    const payloads = buildPromotionPayloads(makeBlueprint(), answers);
    expect(payloads[0].editableFields.promotionId).toBe('NEW_PROMO_A');
  });

  test('falls back to original promotionId', () => {
    const payloads = buildPromotionPayloads(makeBlueprint(), {});
    expect(payloads[0].editableFields.promotionId).toBe('PROMO_A');
  });

  test('names array built per locale', () => {
    const answers = {
      [NAME_XDEFAULT]: makeAnswerRecord(NAME_XDEFAULT, 'New Promo A'),
      [NAME_EN]:       makeAnswerRecord(NAME_EN,       'New Promo A EN'),
    };
    const payloads = buildPromotionPayloads(makeBlueprint(), answers);
    const names    = payloads[0].editableFields.names;
    expect(names).toHaveLength(2);
    expect(names.find(n => n.xmlLang === 'x-default').value).toBe('New Promo A');
    expect(names.find(n => n.xmlLang === 'en').value).toBe('New Promo A EN');
  });

  test('name falls back to original when not answered', () => {
    const payloads = buildPromotionPayloads(makeBlueprint(), {});
    const names    = payloads[0].editableFields.names;
    expect(names.find(n => n.xmlLang === 'x-default').value).toBe('Promo A');
    expect(names.find(n => n.xmlLang === 'en').value).toBe('Promo A EN');
  });

  test('simpleDiscountValue uses answered value', () => {
    const answers  = { [SDV_KEY]: makeAnswerRecord(SDV_KEY, 30) };
    const payloads = buildPromotionPayloads(makeBlueprint(), answers);
    expect(payloads[0].editableFields.simpleDiscountValue).toBe(30);
  });

  test('simpleDiscountValue falls back to original', () => {
    const payloads = buildPromotionPayloads(makeBlueprint(), {});
    expect(payloads[0].editableFields.simpleDiscountValue).toBe(20);
  });

  test('editableCustomAttributes answered value replaces original', () => {
    const answers  = { [ATTR_KEY]: makeAnswerRecord(ATTR_KEY, 'New Inclusion Msg') };
    const payloads = buildPromotionPayloads(makeBlueprint(), answers);
    const attrs    = payloads[0].editableFields.editableCustomAttributes;
    expect(attrs[0].value).toBe('New Inclusion Msg');
  });

  test('editableCustomAttributes fall back to original when not answered', () => {
    const payloads = buildPromotionPayloads(makeBlueprint(), {});
    const attrs    = payloads[0].editableFields.editableCustomAttributes;
    expect(attrs[0].value).toBe('Old Inclusion Msg');
  });

  test('frozenStructure is copied and frozenCustomAttributes preserved', () => {
    const payloads = buildPromotionPayloads(makeBlueprint(), {});
    expect(payloads[0].frozenStructure.frozenCustomAttributes).toHaveLength(1);
    expect(payloads[0].frozenStructure.frozenCustomAttributes[0].attributeId).toBe('someAttr');
  });

  test('slotIndex is preserved on payload', () => {
    const payloads = buildPromotionPayloads(makeBlueprint(), {});
    expect(payloads[0].slotIndex).toBe(0);
  });
});

// ─── buildAssignmentPayloads ──────────────────────────────────────────────────

describe('_internals.buildAssignmentPayloads', () => {
  const CAMPAIGN_KEY  = buildAnswerKey('campaignId',  'campaign',   null, null);
  const PROMO_ID_KEY  = buildAnswerKey('promotionId', 'promotion',  0,    null);
  const END_DATE_KEY  = buildAnswerKey('endDate',     'assignment', 0,    null);
  const START_DATE_KEY = buildAnswerKey('startDate',  'assignment', 0,    null);
  const COUPON_KEY    = buildAnswerKey('couponIds',   'assignment', 0,    null);

  test('assignment promotionId is mapped through promotion answers', () => {
    // Promotion 0 answered with new promotionId
    const answers = { [PROMO_ID_KEY]: makeAnswerRecord(PROMO_ID_KEY, 'NEW_PROMO_A') };
    const payloads = buildAssignmentPayloads(makeBlueprint(), answers);
    // assignment[0] was linked to PROMO_A → should now point to NEW_PROMO_A
    expect(payloads[0].editableFields.promotionId).toBe('NEW_PROMO_A');
  });

  test('assignment promotionId falls back when promotion answer missing', () => {
    const payloads = buildAssignmentPayloads(makeBlueprint(), {});
    expect(payloads[0].editableFields.promotionId).toBe('PROMO_A');
  });

  test('assignment campaignId from campaign answer', () => {
    const answers = { [CAMPAIGN_KEY]: makeAnswerRecord(CAMPAIGN_KEY, '2026_SUMMER_SAS') };
    const payloads = buildAssignmentPayloads(makeBlueprint(), answers);
    expect(payloads[0].editableFields.campaignId).toBe('2026_SUMMER_SAS');
  });

  test('assignment campaignId falls back to original when not answered', () => {
    const payloads = buildAssignmentPayloads(makeBlueprint(), {});
    expect(payloads[0].editableFields.campaignId).toBe('2025_SUMMER_SAS');
  });

  test('endDate is included when hasEndDate=true', () => {
    const answers  = { [END_DATE_KEY]: makeAnswerRecord(END_DATE_KEY, '2026-07-08T04:00:00.000Z') };
    const payloads = buildAssignmentPayloads(makeBlueprint(), answers);
    expect(payloads[0].editableFields.endDate).toBe('2026-07-08T04:00:00.000Z');
  });

  test('startDate is null when hasStartDate=false regardless of answers', () => {
    const answers  = { [START_DATE_KEY]: makeAnswerRecord(START_DATE_KEY, '2026-06-01T04:00:00.000Z') };
    const payloads = buildAssignmentPayloads(makeBlueprint(), answers);
    expect(payloads[0].editableFields.startDate).toBeNull();
  });

  test('startDate is included when hasStartDate=true', () => {
    const bp = makeBlueprint();
    bp.assignmentSlots[0].frozenStructure.hasStartDate = true;
    const answers  = { [START_DATE_KEY]: makeAnswerRecord(START_DATE_KEY, '2026-06-01T04:00:00.000Z') };
    const payloads = buildAssignmentPayloads(bp, answers);
    expect(payloads[0].editableFields.startDate).toBe('2026-06-01T04:00:00.000Z');
  });

  test('couponIds from coupon answer', () => {
    const answers  = { [COUPON_KEY]: makeAnswerRecord(COUPON_KEY, ['COUPON_A']) };
    const payloads = buildAssignmentPayloads(makeBlueprint(), answers);
    expect(payloads[0].editableFields.couponIds).toEqual(['COUPON_A']);
  });

  test('couponIds falls back to original', () => {
    const payloads = buildAssignmentPayloads(makeBlueprint(), {});
    expect(payloads[0].editableFields.couponIds).toBeNull();
  });

  test('slotIndex preserved', () => {
    const payloads = buildAssignmentPayloads(makeBlueprint(), {});
    expect(payloads[0].slotIndex).toBe(0);
  });

  test('frozenStructure shallow-copied unchanged', () => {
    const bp       = makeBlueprint();
    const payloads = buildAssignmentPayloads(bp, {});
    expect(payloads[0].frozenStructure).toEqual(bp.assignmentSlots[0].frozenStructure);
    expect(payloads[0].frozenStructure).not.toBe(bp.assignmentSlots[0].frozenStructure);
  });
});

// ─── buildRendererPayloads — mutation safety ──────────────────────────────────

describe('buildRendererPayloads — mutation safety', () => {
  test('does not mutate the session', () => {
    const session  = makeSession();
    const snapshot = JSON.stringify(session);
    buildRendererPayloads(session, makeBlueprint());
    expect(JSON.stringify(session)).toBe(snapshot);
  });

  test('does not mutate the blueprint', () => {
    const bp       = makeBlueprint();
    const snapshot = JSON.stringify(bp);
    buildRendererPayloads(makeSession(), bp);
    expect(JSON.stringify(bp)).toBe(snapshot);
  });

  test('result is deterministic — same inputs produce same output', () => {
    const session  = makeSession();
    const bp       = makeBlueprint();
    const result1  = buildRendererPayloads(session, bp);
    const result2  = buildRendererPayloads(session, bp);
    expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
  });
});

// ─── Full session → payload integration ───────────────────────────────────────

describe('buildRendererPayloads — full answered session', () => {
  const CAMPAIGN_KEY  = buildAnswerKey('campaignId',            'campaign',   null,      null);
  const PROMO_ID_KEY  = buildAnswerKey('promotionId',           'promotion',  0,         null);
  const NAME_XDEF_KEY = buildAnswerKey('name',                  'promotion',  0,         'x-default');
  const NAME_EN_KEY   = buildAnswerKey('name',                  'promotion',  0,         'en');
  const SDV_KEY       = buildAnswerKey('simpleDiscountValue',   'promotion',  0,         null);
  const END_DATE_KEY  = buildAnswerKey('endDate',               'assignment', 0,         null);

  const answers = {
    [CAMPAIGN_KEY]:  makeAnswerRecord(CAMPAIGN_KEY,  '2026_SUMMER_SAS'),
    [PROMO_ID_KEY]:  makeAnswerRecord(PROMO_ID_KEY,  '2026_PROMO_A'),
    [NAME_XDEF_KEY]: makeAnswerRecord(NAME_XDEF_KEY, 'New Promo Name'),
    [NAME_EN_KEY]:   makeAnswerRecord(NAME_EN_KEY,   'New Promo Name EN'),
    [SDV_KEY]:       makeAnswerRecord(SDV_KEY,       25),
    [END_DATE_KEY]:  makeAnswerRecord(END_DATE_KEY,  '2026-07-08T04:00:00.000Z'),
  };

  let result;
  beforeAll(() => {
    result = buildRendererPayloads(makeSession(answers), makeBlueprint());
  });

  test('campaignSlot has updated campaignId', () => {
    expect(result.campaignSlot.editableFields.campaignId).toBe('2026_SUMMER_SAS');
  });

  test('promotionSlot[0] has updated promotionId', () => {
    expect(result.promotionSlots[0].editableFields.promotionId).toBe('2026_PROMO_A');
  });

  test('promotionSlot[0] names are updated per locale', () => {
    const names = result.promotionSlots[0].editableFields.names;
    expect(names.find(n => n.xmlLang === 'x-default').value).toBe('New Promo Name');
    expect(names.find(n => n.xmlLang === 'en').value).toBe('New Promo Name EN');
  });

  test('promotionSlot[0] simpleDiscountValue is updated', () => {
    expect(result.promotionSlots[0].editableFields.simpleDiscountValue).toBe(25);
  });

  test('assignmentSlot[0] promotionId cross-referenced from promotion answer', () => {
    expect(result.assignmentSlots[0].editableFields.promotionId).toBe('2026_PROMO_A');
  });

  test('assignmentSlot[0] campaignId updated', () => {
    expect(result.assignmentSlots[0].editableFields.campaignId).toBe('2026_SUMMER_SAS');
  });

  test('assignmentSlot[0] endDate updated', () => {
    expect(result.assignmentSlots[0].editableFields.endDate).toBe('2026-07-08T04:00:00.000Z');
  });
});
