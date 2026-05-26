'use strict';

const { renderCampaign } = require('../../src/renderers/renderCampaign');

// ─── Fixture helpers ──────────────────────────────────────────────────────────

function makeCampaignSlot({
  campaignId        = '2025_SUMMER_SAS',
  enabledFlag       = true,
  applicableOnline  = true,
} = {}) {
  return {
    frozenStructure: {
      enabledFlag,
      campaignScope: { applicableOnline },
    },
    editableFields: { campaignId },
  };
}

// ─── Input validation ─────────────────────────────────────────────────────────

describe('renderCampaign — input validation', () => {
  test('throws for null input', () => {
    expect(() => renderCampaign(null)).toThrow('campaignSlot');
  });

  test('throws for non-object input', () => {
    expect(() => renderCampaign('string')).toThrow();
  });

  test('throws when frozenStructure is missing', () => {
    expect(() => renderCampaign({ editableFields: { campaignId: 'X' } }))
      .toThrow('frozenStructure');
  });

  test('throws when editableFields is missing', () => {
    expect(() => renderCampaign({ frozenStructure: { enabledFlag: true, campaignScope: { applicableOnline: true } } }))
      .toThrow('editableFields');
  });

  test('throws when campaignId is empty string', () => {
    expect(() => renderCampaign(makeCampaignSlot({ campaignId: '' })))
      .toThrow('campaignId');
  });

  test('throws when enabledFlag is not boolean', () => {
    const slot = makeCampaignSlot();
    slot.frozenStructure.enabledFlag = 'true';
    expect(() => renderCampaign(slot)).toThrow('enabledFlag');
  });
});

// ─── Document structure ───────────────────────────────────────────────────────

describe('renderCampaign — document structure', () => {
  test('renders opening and closing campaign tags', () => {
    const xml = renderCampaign(makeCampaignSlot());
    expect(xml).toContain('<campaign ');
    expect(xml).toContain('</campaign>');
  });

  test('campaign-id attribute contains the editable campaignId', () => {
    const xml = renderCampaign(makeCampaignSlot({ campaignId: '2025_SUMMER_SAS' }));
    expect(xml).toContain('campaign-id="2025_SUMMER_SAS"');
  });

  test('renders enabled-flag as true when enabledFlag=true', () => {
    const xml = renderCampaign(makeCampaignSlot({ enabledFlag: true }));
    expect(xml).toContain('<enabled-flag>true</enabled-flag>');
  });

  test('renders enabled-flag as false when enabledFlag=false', () => {
    const xml = renderCampaign(makeCampaignSlot({ enabledFlag: false }));
    expect(xml).toContain('<enabled-flag>false</enabled-flag>');
  });

  test('renders campaign-scope wrapper', () => {
    const xml = renderCampaign(makeCampaignSlot());
    expect(xml).toContain('<campaign-scope>');
    expect(xml).toContain('</campaign-scope>');
  });

  test('renders applicable-online self-closing element when applicableOnline=true', () => {
    const xml = renderCampaign(makeCampaignSlot({ applicableOnline: true }));
    expect(xml).toContain('<applicable-online/>');
  });

  test('omits applicable-online when applicableOnline=false', () => {
    const xml = renderCampaign(makeCampaignSlot({ applicableOnline: false }));
    expect(xml).not.toContain('<applicable-online');
  });
});

// ─── Element ordering ─────────────────────────────────────────────────────────

describe('renderCampaign — element ordering', () => {
  test('enabled-flag appears before campaign-scope', () => {
    const xml = renderCampaign(makeCampaignSlot());
    const enabledPos = xml.indexOf('<enabled-flag>');
    const scopePos   = xml.indexOf('<campaign-scope>');
    expect(enabledPos).toBeLessThan(scopePos);
  });

  test('campaign-id attribute appears in the opening tag', () => {
    const xml = renderCampaign(makeCampaignSlot({ campaignId: 'TEST' }));
    const openingTag = xml.split('\n')[0];
    expect(openingTag).toContain('campaign-id="TEST"');
  });
});

// ─── Indentation ─────────────────────────────────────────────────────────────

describe('renderCampaign — indentation', () => {
  test('campaign element is indented 4 spaces', () => {
    const xml = renderCampaign(makeCampaignSlot());
    expect(xml.startsWith('    <campaign ')).toBe(true);
  });

  test('enabled-flag is indented 8 spaces', () => {
    const xml = renderCampaign(makeCampaignSlot());
    expect(xml).toContain('        <enabled-flag>');
  });

  test('applicable-online is indented 12 spaces', () => {
    const xml = renderCampaign(makeCampaignSlot({ applicableOnline: true }));
    expect(xml).toContain('            <applicable-online/>');
  });
});

// ─── XML escaping ─────────────────────────────────────────────────────────────

describe('renderCampaign — XML escaping', () => {
  test('campaign-id with special characters is escaped', () => {
    const xml = renderCampaign(makeCampaignSlot({ campaignId: 'Camp<&>Test' }));
    expect(xml).toContain('campaign-id="Camp&lt;&amp;&gt;Test"');
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('renderCampaign — determinism', () => {
  test('same input always produces identical output', () => {
    const slot = makeCampaignSlot();
    const r1 = renderCampaign(slot);
    const r2 = renderCampaign(slot);
    const r3 = renderCampaign(slot);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });
});

// ─── Source-parity: Summer_SAS campaign structure ─────────────────────────────

describe('renderCampaign — Summer_SAS.xml parity', () => {
  const sasCampaign = makeCampaignSlot({
    campaignId:       '2025_SUMMER_SAS',
    enabledFlag:      true,
    applicableOnline: true,
  });

  test('renders all expected elements for SAS campaign', () => {
    const xml = renderCampaign(sasCampaign);
    expect(xml).toContain('campaign-id="2025_SUMMER_SAS"');
    expect(xml).toContain('<enabled-flag>true</enabled-flag>');
    expect(xml).toContain('<campaign-scope>');
    expect(xml).toContain('<applicable-online/>');
    expect(xml).toContain('</campaign>');
  });

  test('renders no unexpected elements', () => {
    const xml = renderCampaign(sasCampaign);
    expect(xml).not.toContain('<promotion');
    expect(xml).not.toContain('<assignment');
    expect(xml).not.toContain('<global-promotion-settings');
  });
});
