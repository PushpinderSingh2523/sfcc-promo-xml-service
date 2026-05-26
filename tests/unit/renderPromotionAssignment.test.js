'use strict';

const { renderPromotionAssignment } = require('../../src/renderers/renderPromotionAssignment');

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeAssignmentSlot({
  promotionId      = 'PROMO-2025',
  campaignId       = 'CAMP-2025',
  qualifiersMode   = 'any',
  hasCustomerGroups = true,
  hasSourceCodes   = true,
  hasCoupons       = true,
  customerGroups   = null,
  couponIds        = null,
  rank             = 10,
  hasStartDate     = false,
  hasEndDate       = true,
  startDate        = null,
  endDate          = '2025-07-08T04:00:00.000Z',
} = {}) {
  return {
    frozenStructure: {
      qualifiers: { matchMode: qualifiersMode, hasCustomerGroups, hasSourceCodes, hasCoupons },
      customerGroups,
      rank,
      hasStartDate,
      hasEndDate,
    },
    editableFields: {
      promotionId,
      campaignId,
      couponIds,
      startDate,
      endDate,
    },
  };
}

// ─── Input validation ─────────────────────────────────────────────────────────

describe('renderPromotionAssignment — input validation', () => {
  test('throws for null input', () => {
    expect(() => renderPromotionAssignment(null)).toThrow('assignmentSlot');
  });

  test('throws when frozenStructure is missing', () => {
    expect(() => renderPromotionAssignment({ editableFields: { promotionId: 'P', campaignId: 'C' } }))
      .toThrow('frozenStructure');
  });

  test('throws when promotionId is empty', () => {
    expect(() => renderPromotionAssignment(makeAssignmentSlot({ promotionId: '' })))
      .toThrow('promotionId');
  });

  test('throws when campaignId is empty', () => {
    expect(() => renderPromotionAssignment(makeAssignmentSlot({ campaignId: '' })))
      .toThrow('campaignId');
  });

  test('throws when qualifiers is missing', () => {
    const slot = makeAssignmentSlot();
    delete slot.frozenStructure.qualifiers;
    expect(() => renderPromotionAssignment(slot)).toThrow('qualifiers');
  });

  test('throws when rank is not a number', () => {
    const slot = makeAssignmentSlot();
    slot.frozenStructure.rank = '10';
    expect(() => renderPromotionAssignment(slot)).toThrow('rank');
  });

  test('throws when hasStartDate=true but startDate is null', () => {
    expect(() => renderPromotionAssignment(makeAssignmentSlot({ hasStartDate: true, startDate: null })))
      .toThrow('startDate');
  });

  test('throws when hasEndDate=true but endDate is null', () => {
    expect(() => renderPromotionAssignment(makeAssignmentSlot({ hasEndDate: true, endDate: null })))
      .toThrow('endDate');
  });
});

// ─── Opening tag ──────────────────────────────────────────────────────────────

describe('renderPromotionAssignment — opening tag', () => {
  test('renders promotion-id attribute', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot({ promotionId: '2025-SAS-PROMO' }));
    expect(xml).toContain('promotion-id="2025-SAS-PROMO"');
  });

  test('renders campaign-id attribute', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot({ campaignId: '2025_SUMMER_SAS' }));
    expect(xml).toContain('campaign-id="2025_SUMMER_SAS"');
  });

  test('promotion-id appears before campaign-id in opening tag', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot());
    const openLine = xml.split('\n')[0];
    const promPos = openLine.indexOf('promotion-id');
    const campPos = openLine.indexOf('campaign-id');
    expect(promPos).toBeLessThan(campPos);
  });

  test('renders closing tag', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot());
    expect(xml).toContain('</promotion-campaign-assignment>');
  });
});

// ─── Qualifiers ───────────────────────────────────────────────────────────────

describe('renderPromotionAssignment — qualifiers block', () => {
  test('renders qualifiers with match-mode attribute', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot({ qualifiersMode: 'any' }));
    expect(xml).toContain('<qualifiers match-mode="any">');
  });

  test('renders match-mode="all" when specified', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot({ qualifiersMode: 'all' }));
    expect(xml).toContain('<qualifiers match-mode="all">');
  });

  test('renders customer-groups/ inside qualifiers when hasCustomerGroups=true', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot({ hasCustomerGroups: true }));
    // Must be inside qualifiers, before </qualifiers>
    const qualOpen  = xml.indexOf('<qualifiers');
    const qualClose = xml.indexOf('</qualifiers>');
    const cgPos     = xml.indexOf('<customer-groups/>', qualOpen);
    expect(cgPos).toBeGreaterThan(qualOpen);
    expect(cgPos).toBeLessThan(qualClose);
  });

  test('omits customer-groups/ when hasCustomerGroups=false', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot({ hasCustomerGroups: false }));
    const qualOpen  = xml.indexOf('<qualifiers');
    const qualClose = xml.indexOf('</qualifiers>');
    const cgPos     = xml.indexOf('<customer-groups/>', qualOpen);
    expect(cgPos).toBe(-1);
  });

  test('renders source-codes/ when hasSourceCodes=true', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot({ hasSourceCodes: true }));
    const qualOpen  = xml.indexOf('<qualifiers');
    const qualClose = xml.indexOf('</qualifiers>');
    const scPos     = xml.indexOf('<source-codes/>', qualOpen);
    expect(scPos).toBeGreaterThan(qualOpen);
    expect(scPos).toBeLessThan(qualClose);
  });

  test('omits source-codes/ when hasSourceCodes=false', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot({ hasSourceCodes: false }));
    expect(xml.indexOf('<source-codes/>')).toBe(-1);
  });

  test('renders coupons/ inside qualifiers when hasCoupons=true', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot({ hasCoupons: true }));
    const qualOpen  = xml.indexOf('<qualifiers');
    const qualClose = xml.indexOf('</qualifiers>');
    const coupPos   = xml.indexOf('<coupons/>', qualOpen);
    expect(coupPos).toBeGreaterThan(qualOpen);
    expect(coupPos).toBeLessThan(qualClose);
  });

  test('qualifier sub-elements appear in canonical order: customer-groups, source-codes, coupons', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot({
      hasCustomerGroups: true,
      hasSourceCodes: true,
      hasCoupons: true,
    }));
    const qualStart = xml.indexOf('<qualifiers');
    const cgIdx = xml.indexOf('<customer-groups/>', qualStart);
    const scIdx = xml.indexOf('<source-codes/>', qualStart);
    const cpIdx = xml.indexOf('<coupons/>', qualStart);
    expect(cgIdx).toBeLessThan(scIdx);
    expect(scIdx).toBeLessThan(cpIdx);
  });
});

// ─── Outer coupons block ──────────────────────────────────────────────────────

describe('renderPromotionAssignment — outer coupons block', () => {
  test('renders outer coupons block when couponIds is non-null', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot({ couponIds: ['CPN-2025'] }));
    // Outer coupons block (with content) after </qualifiers>
    const qualClose = xml.indexOf('</qualifiers>');
    const couponEl  = xml.indexOf('<coupon coupon-id=', qualClose);
    expect(couponEl).toBeGreaterThan(qualClose);
  });

  test('renders coupon coupon-id attribute', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot({ couponIds: ['2025-Summer-SAS-CS'] }));
    expect(xml).toContain('<coupon coupon-id="2025-Summer-SAS-CS"/>');
  });

  test('renders multiple coupon elements when couponIds has multiple entries', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot({ couponIds: ['CPN-A', 'CPN-B'] }));
    expect(xml).toContain('<coupon coupon-id="CPN-A"/>');
    expect(xml).toContain('<coupon coupon-id="CPN-B"/>');
  });

  test('omits outer coupons block when couponIds is null', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot({ couponIds: null }));
    const qualClose = xml.indexOf('</qualifiers>');
    const couponEl  = xml.indexOf('<coupon ', qualClose);
    expect(couponEl).toBe(-1);
  });
});

// ─── Outer customer-groups block ──────────────────────────────────────────────

describe('renderPromotionAssignment — outer customer-groups block', () => {
  const cgSlot = makeAssignmentSlot({
    customerGroups: { matchMode: 'any', groupIds: ['Everyone-webapp-except-employees'] },
    couponIds: null,
  });

  test('renders customer-groups block when frozenStructure.customerGroups is not null', () => {
    const xml = renderPromotionAssignment(cgSlot);
    expect(xml).toContain('<customer-groups match-mode="any">');
    expect(xml).toContain('<customer-group group-id="Everyone-webapp-except-employees"/>');
  });

  test('renders closing customer-groups tag', () => {
    const xml = renderPromotionAssignment(cgSlot);
    expect(xml).toContain('</customer-groups>');
  });

  test('omits customer-groups outer block when frozenStructure.customerGroups is null', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot({ customerGroups: null, couponIds: null }));
    const qualClose = xml.indexOf('</qualifiers>');
    const cgOuter   = xml.indexOf('<customer-groups ', qualClose);
    expect(cgOuter).toBe(-1);
  });

  test('renders multiple group-id entries', () => {
    const slot = makeAssignmentSlot({
      customerGroups: { matchMode: 'all', groupIds: ['GroupA', 'GroupB'] },
    });
    const xml = renderPromotionAssignment(slot);
    expect(xml).toContain('<customer-group group-id="GroupA"/>');
    expect(xml).toContain('<customer-group group-id="GroupB"/>');
  });
});

// ─── Rank ─────────────────────────────────────────────────────────────────────

describe('renderPromotionAssignment — rank', () => {
  test('renders rank element with correct value', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot({ rank: 10 }));
    expect(xml).toContain('<rank>10</rank>');
  });

  test('rank appears after qualifiers', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot());
    const qualClose = xml.indexOf('</qualifiers>');
    const rankPos   = xml.indexOf('<rank>');
    expect(rankPos).toBeGreaterThan(qualClose);
  });
});

// ─── Schedule ─────────────────────────────────────────────────────────────────

describe('renderPromotionAssignment — schedule', () => {
  test('renders schedule block with end-date when hasEndDate=true', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot({
      hasEndDate: true,
      endDate: '2025-07-08T04:00:00.000Z',
    }));
    expect(xml).toContain('<schedule>');
    expect(xml).toContain('<end-date>2025-07-08T04:00:00.000Z</end-date>');
  });

  test('omits schedule block when both hasStartDate and hasEndDate are false', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot({ hasStartDate: false, hasEndDate: false }));
    expect(xml).not.toContain('<schedule>');
  });

  test('renders start-date when hasStartDate=true', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot({
      hasStartDate: true,
      startDate: '2025-07-07T04:00:00.000Z',
      hasEndDate: true,
      endDate: '2025-07-29T04:00:00.000Z',
    }));
    expect(xml).toContain('<start-date>2025-07-07T04:00:00.000Z</start-date>');
    expect(xml).toContain('<end-date>2025-07-29T04:00:00.000Z</end-date>');
  });

  test('omits start-date when hasStartDate=false', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot({ hasStartDate: false }));
    expect(xml).not.toContain('<start-date>');
  });

  test('start-date appears before end-date', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot({
      hasStartDate: true,
      startDate: '2025-07-07T04:00:00.000Z',
      hasEndDate: true,
      endDate: '2025-07-29T04:00:00.000Z',
    }));
    expect(xml.indexOf('<start-date>')).toBeLessThan(xml.indexOf('<end-date>'));
  });
});

// ─── Element ordering (canonical) ────────────────────────────────────────────

describe('renderPromotionAssignment — canonical element ordering', () => {
  test('qualifiers appears before rank', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot());
    expect(xml.indexOf('<qualifiers')).toBeLessThan(xml.indexOf('<rank>'));
  });

  test('rank appears before schedule', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot());
    expect(xml.indexOf('<rank>')).toBeLessThan(xml.indexOf('<schedule>'));
  });

  test('outer coupons block appears after qualifiers and before rank', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot({ couponIds: ['CPN'] }));
    const qualClose  = xml.indexOf('</qualifiers>');
    const couponsPos = xml.indexOf('<coupons>', qualClose);
    const rankPos    = xml.indexOf('<rank>');
    expect(couponsPos).toBeGreaterThan(qualClose);
    expect(couponsPos).toBeLessThan(rankPos);
  });

  test('outer customer-groups block appears after qualifiers and before rank', () => {
    const xml = renderPromotionAssignment(makeAssignmentSlot({
      customerGroups: { matchMode: 'any', groupIds: ['G1'] },
    }));
    const qualClose = xml.indexOf('</qualifiers>');
    const cgPos     = xml.indexOf('<customer-groups ', qualClose);
    const rankPos   = xml.indexOf('<rank>');
    expect(cgPos).toBeGreaterThan(qualClose);
    expect(cgPos).toBeLessThan(rankPos);
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('renderPromotionAssignment — determinism', () => {
  test('same input always produces identical output', () => {
    const slot = makeAssignmentSlot({ couponIds: ['CPN'], customerGroups: null });
    const r1 = renderPromotionAssignment(slot);
    const r2 = renderPromotionAssignment(slot);
    expect(r1).toBe(r2);
  });
});

// ─── SAS export parity fixtures ──────────────────────────────────────────────

describe('renderPromotionAssignment — Summer_SAS.xml assignment patterns', () => {
  test('APPEASEMENT pattern: any qualifiers, coupon block, no customer-groups, end-date only', () => {
    const xml = renderPromotionAssignment({
      frozenStructure: {
        qualifiers: { matchMode: 'any', hasCustomerGroups: true, hasSourceCodes: true, hasCoupons: true },
        customerGroups: null,
        rank: 10,
        hasStartDate: false,
        hasEndDate: true,
      },
      editableFields: {
        promotionId: '2025-SUMMER-SAS-APPEASEMENT',
        campaignId: '2025_SUMMER_SAS',
        couponIds: ['2025-Summer-SAS-CS'],
        startDate: null,
        endDate: '2025-07-08T04:00:00.000Z',
      },
    });
    expect(xml).toContain('promotion-id="2025-SUMMER-SAS-APPEASEMENT"');
    expect(xml).toContain('<qualifiers match-mode="any">');
    expect(xml).toContain('<coupon coupon-id="2025-Summer-SAS-CS"/>');
    expect(xml).not.toContain('<customer-groups ');
    expect(xml).toContain('<end-date>2025-07-08T04:00:00.000Z</end-date>');
    expect(xml).not.toContain('<start-date>');
  });

  test('WEBAPP pattern: all qualifiers, customer-groups block, no coupons, start+end dates', () => {
    const xml = renderPromotionAssignment({
      frozenStructure: {
        qualifiers: { matchMode: 'all', hasCustomerGroups: true, hasSourceCodes: true, hasCoupons: true },
        customerGroups: { matchMode: 'any', groupIds: ['Webapp-users'] },
        rank: 10,
        hasStartDate: true,
        hasEndDate: true,
      },
      editableFields: {
        promotionId: '2025_Summer_SAS_WebApp',
        campaignId: '2025_SUMMER_SAS',
        couponIds: null,
        startDate: '2025-07-07T04:00:00.000Z',
        endDate: '2025-07-29T04:00:00.000Z',
      },
    });
    expect(xml).toContain('<qualifiers match-mode="all">');
    expect(xml).toContain('<customer-groups match-mode="any">');
    expect(xml).toContain('<customer-group group-id="Webapp-users"/>');
    expect(xml).not.toContain('<coupon ');
    expect(xml).toContain('<start-date>2025-07-07T04:00:00.000Z</start-date>');
    expect(xml).toContain('<end-date>2025-07-29T04:00:00.000Z</end-date>');
  });
});
