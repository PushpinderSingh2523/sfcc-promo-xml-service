'use strict';

/**
 * SAS Blueprint Replay Validation — Integration Tests
 *
 * Proves the complete round-trip:
 *
 *   Real Summer_SAS.xml
 *       ↓  extractSASBlueprint
 *   Blueprint record
 *       ↓  assembleBlueprintXML
 *   Reconstructed XML
 *       ↓  compareXMLStructures
 *   zero structural differences
 *
 * These tests are the acceptance gate for the blueprint architecture.
 * A passing result means the extractor + renderers + assembler reproduce
 * the original SFCC document structure without any structural drift.
 */

const path = require('path');
const fs   = require('fs');

const { validateBlueprintReplay }   = require('../../src/blueprints/validateBlueprintReplay');
const { extractSASBlueprint }        = require('../../src/blueprints/extractors/extractSASBlueprint');
const { assembleBlueprintXML }       = require('../../src/blueprints/assembleBlueprintXML');
const { compareXMLStructures }       = require('../../src/blueprints/utils/compareXMLStructures');

// ─── Fixture ──────────────────────────────────────────────────────────────────

const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/Summer_SAS.xml');
const originalXml  = fs.readFileSync(FIXTURE_PATH, 'utf8');

// ─── Core replay parity ───────────────────────────────────────────────────────

describe('SAS Replay Validation — core parity', () => {
  let result;

  beforeAll(() => {
    result = validateBlueprintReplay(originalXml, {
      blueprintId:  'summer-sas-2025',
      sourceExport: 'Summer_SAS.xml',
      extractedAt:  '2025-01-01T00:00:00.000Z',
    });
  });

  test('replaySuccessful is true', () => {
    if (!result.replaySuccessful) {
      // Surface the actual diffs to make debugging fast
      const diffSummary = result.structuralDifferences
        .slice(0, 10)
        .map(d => `  ${d.path}: [${JSON.stringify(d.original)}] → [${JSON.stringify(d.replayed)}]`)
        .join('\n');
      throw new Error(
        `Replay failed with ${result.structuralDifferences.length} difference(s):\n${diffSummary}`
      );
    }
    expect(result.replaySuccessful).toBe(true);
  });

  test('structuralDifferences is empty array', () => {
    expect(result.structuralDifferences).toHaveLength(0);
  });

  test('result shape has expected keys', () => {
    expect(result).toHaveProperty('replaySuccessful');
    expect(result).toHaveProperty('structuralDifferences');
    expect(result).toHaveProperty('warnings');
    expect(Array.isArray(result.structuralDifferences)).toBe(true);
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});

// ─── Determinism ─────────────────────────────────────────────────────────────

describe('SAS Replay Validation — determinism', () => {
  test('three consecutive replays produce identical XML output', () => {
    const opts = {
      blueprintId:  'det-test',
      sourceExport: 'Summer_SAS.xml',
      extractedAt:  '2025-01-01T00:00:00.000Z',
    };

    const bp1 = extractSASBlueprint(originalXml, opts);
    const bp2 = extractSASBlueprint(originalXml, opts);
    const bp3 = extractSASBlueprint(originalXml, opts);

    const xml1 = assembleBlueprintXML(bp1);
    const xml2 = assembleBlueprintXML(bp2);
    const xml3 = assembleBlueprintXML(bp3);

    expect(xml1).toBe(xml2);
    expect(xml2).toBe(xml3);
  });

  test('extractSASBlueprint is deterministic (same JSON output each call)', () => {
    const opts = { blueprintId: 'x', sourceExport: 'y', extractedAt: '2025-01-01T00:00:00.000Z' };
    const bp1 = extractSASBlueprint(originalXml, opts);
    const bp2 = extractSASBlueprint(originalXml, opts);
    expect(JSON.stringify(bp1)).toBe(JSON.stringify(bp2));
  });

  test('assembleBlueprintXML is deterministic for the same blueprint', () => {
    const bp = extractSASBlueprint(originalXml, {
      blueprintId: 'x', sourceExport: 'y', extractedAt: '2025-01-01T00:00:00.000Z',
    });
    const xml1 = assembleBlueprintXML(bp);
    const xml2 = assembleBlueprintXML(bp);
    const xml3 = assembleBlueprintXML(bp);
    expect(xml1).toBe(xml2);
    expect(xml2).toBe(xml3);
  });
});

// ─── Blueprint structural completeness ───────────────────────────────────────

describe('SAS Replay Validation — blueprint completeness', () => {
  let blueprint;

  beforeAll(() => {
    blueprint = extractSASBlueprint(originalXml, {
      blueprintId:  'completeness-check',
      sourceExport: 'Summer_SAS.xml',
      extractedAt:  '2025-01-01T00:00:00.000Z',
    });
  });

  test('blueprint has a campaignSlot', () => {
    expect(blueprint.campaignSlot).toBeDefined();
    expect(blueprint.campaignSlot.editableFields.campaignId).toBe('2025_SUMMER_SAS');
  });

  test('blueprint has exactly 4 promotionSlots (matching source file)', () => {
    expect(blueprint.promotionSlots).toHaveLength(4);
  });

  test('blueprint has exactly 4 assignmentSlots (matching source file)', () => {
    expect(blueprint.assignmentSlots).toHaveLength(4);
  });

  test('each promotionSlot has a non-empty promotionId', () => {
    blueprint.promotionSlots.forEach(slot => {
      expect(slot.editableFields.promotionId).toBeTruthy();
    });
  });

  test('each assignmentSlot promotionId matches a promotionSlot promotionId', () => {
    const promotionIds = new Set(blueprint.promotionSlots.map(s => s.editableFields.promotionId));
    blueprint.assignmentSlots.forEach(slot => {
      expect(promotionIds.has(slot.editableFields.promotionId)).toBe(true);
    });
  });

  test('all assignmentSlots reference the same campaignId', () => {
    blueprint.assignmentSlots.forEach(slot => {
      expect(slot.editableFields.campaignId).toBe('2025_SUMMER_SAS');
    });
  });
});

// ─── Replayed document structure ─────────────────────────────────────────────

describe('SAS Replay Validation — replayed document structure', () => {
  let replayedXml;

  beforeAll(() => {
    const bp = extractSASBlueprint(originalXml, {
      blueprintId: 'doc-structure', sourceExport: 'S.xml', extractedAt: '2025-01-01T00:00:00.000Z',
    });
    replayedXml = assembleBlueprintXML(bp);
  });

  test('replayed XML starts with XML declaration', () => {
    expect(replayedXml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  test('replayed XML contains SFCC namespace', () => {
    expect(replayedXml).toContain('http://www.demandware.com/xml/impex/promotion/2008-01-31');
  });

  test('replayed XML contains campaign element', () => {
    expect(replayedXml).toContain('<campaign campaign-id="2025_SUMMER_SAS"');
  });

  test('replayed XML contains global-promotion-settings', () => {
    expect(replayedXml).toContain('<global-promotion-settings>');
    expect(replayedXml).toContain('</global-promotion-settings>');
  });

  test('replayed XML contains 4 promotion elements', () => {
    const count = (replayedXml.match(/<promotion promotion-id=/g) || []).length;
    expect(count).toBe(4);
  });

  test('replayed XML contains 4 promotion-campaign-assignment elements', () => {
    const count = (replayedXml.match(/<promotion-campaign-assignment /g) || []).length;
    expect(count).toBe(4);
  });

  test('replayed XML ends with </promotions> followed by newline', () => {
    expect(replayedXml.endsWith('</promotions>\n')).toBe(true);
  });
});

// ─── Partial mutation detection ───────────────────────────────────────────────

describe('SAS Replay Validation — structural comparison sensitivity', () => {
  test('adding an extra element causes replaySuccessful to be false', () => {
    // Inject a fake element into the replayed XML
    const bp = extractSASBlueprint(originalXml, {
      blueprintId: 'mut-test', sourceExport: 'S.xml', extractedAt: '2025-01-01T00:00:00.000Z',
    });
    const assembled = assembleBlueprintXML(bp);
    const tampered  = assembled.replace('</promotions>', '<extra-element/>\n</promotions>');

    const cmpResult = compareXMLStructures(originalXml, tampered);
    expect(cmpResult.equal).toBe(false);
  });

  test('removing a promotion element causes replaySuccessful to be false', () => {
    const bp = extractSASBlueprint(originalXml, {
      blueprintId: 'del-test', sourceExport: 'S.xml', extractedAt: '2025-01-01T00:00:00.000Z',
    });
    // Build a sliced blueprint with only 3 promotions
    const slicedBp = { ...bp, promotionSlots: bp.promotionSlots.slice(0, 3), assignmentSlots: bp.assignmentSlots.slice(0, 3) };
    const assembled = assembleBlueprintXML(slicedBp);

    const cmpResult = compareXMLStructures(originalXml, assembled);
    expect(cmpResult.equal).toBe(false);
  });

  test('changing a promotion-id causes replaySuccessful to be false', () => {
    const bp = extractSASBlueprint(originalXml, {
      blueprintId: 'id-test', sourceExport: 'S.xml', extractedAt: '2025-01-01T00:00:00.000Z',
    });
    const assembled = assembleBlueprintXML(bp);
    // Change one promotion-id to something that won't match
    const originalId = bp.promotionSlots[0].editableFields.promotionId;
    const tampered   = assembled.replace(
      `promotion-id="${originalId}"`,
      `promotion-id="TAMPERED_ID"`
    );

    const cmpResult = compareXMLStructures(originalXml, tampered);
    expect(cmpResult.equal).toBe(false);
  });
});

// ─── validateBlueprintReplay error handling ───────────────────────────────────

describe('validateBlueprintReplay — error handling', () => {
  test('throws for null input', () => {
    expect(() => validateBlueprintReplay(null)).toThrow('originalXml');
  });

  test('throws for empty string input', () => {
    expect(() => validateBlueprintReplay('')).toThrow('originalXml');
  });

  test('returns replaySuccessful:false for invalid XML (extraction phase)', () => {
    const result = validateBlueprintReplay('<not-a-valid-sfcc-export/>');
    expect(result.replaySuccessful).toBe(false);
    expect(result.structuralDifferences.length).toBeGreaterThan(0);
  });

  test('structuralDifferences entries have path, original, replayed keys on failure', () => {
    const result = validateBlueprintReplay('<not-a-valid-sfcc-export/>');
    result.structuralDifferences.forEach(d => {
      expect(d).toHaveProperty('path');
      expect(d).toHaveProperty('original');
      expect(d).toHaveProperty('replayed');
    });
  });
});
