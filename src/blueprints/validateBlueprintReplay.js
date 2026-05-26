'use strict';

// ─── Dependencies ─────────────────────────────────────────────────────────────

const { extractSASBlueprint }   = require('./extractors/extractSASBlueprint');
const { assembleBlueprintXML }  = require('./assembleBlueprintXML');
const { compareXMLStructures }  = require('./utils/compareXMLStructures');

// ─── Replay Validator ─────────────────────────────────────────────────────────

/**
 * @typedef {object} ReplayResult
 * @property {boolean}  replaySuccessful    - true only when zero structural differences found
 * @property {Array}    structuralDifferences - human-readable diff entries
 * @property {string[]} warnings            - non-blocking anomaly messages
 */

/**
 * Validate Blueprint Replay Parity.
 *
 * Performs the complete round-trip:
 *
 *   originalXml
 *       ↓ extractSASBlueprint
 *   blueprint record
 *       ↓ assembleBlueprintXML
 *   replayedXml
 *       ↓ compareXMLStructures
 *   ReplayResult
 *
 * This is the proof that the blueprint architecture preserves enterprise-approved
 * XML structure deterministically.  A replaySuccessful:true result from the
 * real Summer_SAS.xml export means:
 *
 *   "The extractor + renderers + assembler reproduce the original document
 *    structure without any structural drift."
 *
 * Comparison rules:
 *   Allowed:   insignificant whitespace, line ending differences,
 *              self-closing vs explicit-empty element forms
 *   Not allowed: element additions, element removals, text content changes,
 *                attribute changes, element reordering, hierarchy changes
 *
 * @param {string} originalXml - Raw XML content of the SFCC promotion export
 * @param {object} [options]
 * @param {string} [options.blueprintId]  - for the extracted blueprint record
 * @param {string} [options.sourceExport] - for the extracted blueprint record
 * @returns {ReplayResult}
 */
function validateBlueprintReplay(originalXml, options = {}) {
  if (typeof originalXml !== 'string' || originalXml.trim() === '') {
    throw new Error('originalXml must be a non-empty string');
  }

  const warnings = [];

  // ── Step 1: Extract blueprint ─────────────────────────────────────────────
  let blueprint;
  try {
    blueprint = extractSASBlueprint(originalXml, {
      blueprintId:  options.blueprintId  || 'replay-validation',
      sourceExport: options.sourceExport || 'original.xml',
      extractedAt:  options.extractedAt  || '2000-01-01T00:00:00.000Z',
    });
  } catch (err) {
    return {
      replaySuccessful:     false,
      structuralDifferences: [{
        path:     '/[extraction]',
        original: 'extraction succeeded',
        replayed: `extraction failed: ${err.message}`,
      }],
      warnings,
    };
  }

  // ── Step 2: Assemble replayed XML from blueprint ──────────────────────────
  let replayedXml;
  try {
    replayedXml = assembleBlueprintXML(blueprint);
  } catch (err) {
    return {
      replaySuccessful:     false,
      structuralDifferences: [{
        path:     '/[assembly]',
        original: 'assembly succeeded',
        replayed: `assembly failed: ${err.message}`,
      }],
      warnings,
    };
  }

  // ── Step 3: Compare original vs replayed ─────────────────────────────────
  let comparison;
  try {
    comparison = compareXMLStructures(originalXml, replayedXml);
  } catch (err) {
    return {
      replaySuccessful:     false,
      structuralDifferences: [{
        path:     '/[comparison]',
        original: 'comparison succeeded',
        replayed: `comparison failed: ${err.message}`,
      }],
      warnings,
    };
  }

  return {
    replaySuccessful:     comparison.equal,
    structuralDifferences: comparison.differences,
    warnings,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { validateBlueprintReplay };
