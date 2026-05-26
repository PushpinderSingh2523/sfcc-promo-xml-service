'use strict';

// ─── Dependencies ─────────────────────────────────────────────────────────────

const { convert } = require('xmlbuilder2');

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} StructuralDifference
 * @property {string} path     - XPath-like path to the differing node
 * @property {*}      original - Value in the original XML (null if absent)
 * @property {*}      replayed - Value in the replayed XML (null if absent)
 */

// ─── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Strip the leading `@` from an attribute key to produce a readable path segment.
 * e.g. `@promotion-id` → `@promotion-id` (kept as-is for clarity in paths)
 */
function pathSegment(key) {
  return key;
}

// ─── Core comparator ──────────────────────────────────────────────────────────

/**
 * Recursively compare two nodes from xmlbuilder2 convert({ format: 'object' })
 * output, collecting structural differences.
 *
 * Node categories in convert output:
 *   string             → text-only element or attribute value → compare directly
 *   {}                 → empty element (e.g. <applicable-online/>) → compare by presence
 *   { @key: ..., ... } → element with attributes/children → recurse
 *   [ ... ]            → multiple same-name sibling elements → compare element-by-element
 *
 * XML semantic rules applied:
 *   - Element children: ORDER matters (compared in key-sequence order)
 *   - Attributes (@-prefixed): ORDER does NOT matter (compared as unordered set)
 *   - Text content (#): compared as a string
 *
 * @param {*}      original - Original node value
 * @param {*}      replayed - Replayed node value
 * @param {string} path     - Current XPath-like path (for error messages)
 * @param {StructuralDifference[]} diffs - Accumulated differences (mutated in-place)
 */
function compareNodes(original, replayed, path, diffs) {

  // ── Both absent ────────────────────────────────────────────────────────────
  if (original === undefined && replayed === undefined) return;

  // ── One side absent ────────────────────────────────────────────────────────
  if (original === undefined || original === null) {
    diffs.push({ path, original: null, replayed: summarise(replayed) });
    return;
  }
  if (replayed === undefined || replayed === null) {
    diffs.push({ path, original: summarise(original), replayed: null });
    return;
  }

  // ── Both strings (text-only element or attribute value) ───────────────────
  if (typeof original === 'string' && typeof replayed === 'string') {
    if (original !== replayed) {
      diffs.push({ path, original, replayed });
    }
    return;
  }

  // ── Both arrays (multiple same-name sibling elements) ─────────────────────
  if (Array.isArray(original) && Array.isArray(replayed)) {
    if (original.length !== replayed.length) {
      diffs.push({
        path,
        original: `array(${original.length})`,
        replayed: `array(${replayed.length})`,
      });
    }
    const len = Math.min(original.length, replayed.length);
    for (let i = 0; i < len; i++) {
      compareNodes(original[i], replayed[i], `${path}[${i}]`, diffs);
    }
    return;
  }

  // ── Type mismatch (one is array, other is not) ─────────────────────────────
  if (Array.isArray(original) !== Array.isArray(replayed)) {
    diffs.push({
      path,
      original: Array.isArray(original) ? `array(${original.length})` : typeof original,
      replayed: Array.isArray(replayed) ? `array(${replayed.length})` : typeof replayed,
    });
    return;
  }

  // ── Both objects (element with attributes/children, or empty element {}) ───
  if (typeof original === 'object' && typeof replayed === 'object') {
    // Separate keys into three categories:
    //   attrKeys  — XML attributes (@-prefixed): order-insensitive
    //   textKey   — text content (#): single value
    //   elemKeys  — child elements: ORDER-sensitive
    const origAttrKeys  = Object.keys(original).filter(k => k.startsWith('@'));
    const replAttrKeys  = Object.keys(replayed).filter(k => k.startsWith('@'));
    const origElemKeys  = Object.keys(original).filter(k => !k.startsWith('@') && k !== '#');
    const replElemKeys  = Object.keys(replayed).filter(k => !k.startsWith('@') && k !== '#');

    // ── Attributes (unordered set comparison) ──────────────────────────────
    const allAttrKeys = new Set([...origAttrKeys, ...replAttrKeys]);
    allAttrKeys.forEach(key => {
      const attrPath = `${path}/${pathSegment(key)}`;
      if (!(key in original)) {
        diffs.push({ path: attrPath, original: null, replayed: replayed[key] });
      } else if (!(key in replayed)) {
        diffs.push({ path: attrPath, original: original[key], replayed: null });
      } else {
        compareNodes(original[key], replayed[key], attrPath, diffs);
      }
    });

    // ── Text content (#) ───────────────────────────────────────────────────
    if ('#' in original || '#' in replayed) {
      const textPath = `${path}/#text`;
      compareNodes(original['#'], replayed['#'], textPath, diffs);
    }

    // ── Child element keys (order-sensitive) ──────────────────────────────
    const origSeq = origElemKeys.join(',');
    const replSeq = replElemKeys.join(',');

    if (origSeq !== replSeq) {
      // Sequences differ: report element-level presence changes
      const origSet = new Set(origElemKeys);
      const replSet = new Set(replElemKeys);

      // Elements in original but missing from replayed
      origElemKeys.forEach(key => {
        if (!replSet.has(key)) {
          diffs.push({
            path: `${path}/${key}`,
            original: summarise(original[key]),
            replayed: null,
          });
        }
      });

      // Elements in replayed but absent from original
      replElemKeys.forEach(key => {
        if (!origSet.has(key)) {
          diffs.push({
            path: `${path}/${key}`,
            original: null,
            replayed: summarise(replayed[key]),
          });
        }
      });

      // If same set of keys but different order, flag ordering change
      if (origSet.size === replSet.size &&
          [...origSet].every(k => replSet.has(k)) &&
          origSeq !== replSeq) {
        diffs.push({
          path: `${path}/[element-order]`,
          original: origElemKeys.join(', '),
          replayed: replElemKeys.join(', '),
        });
      }

      // Still recurse into common keys to find value-level differences
      origElemKeys.filter(k => replSet.has(k)).forEach(key => {
        compareNodes(original[key], replayed[key], `${path}/${key}`, diffs);
      });

    } else {
      // Same sequence: compare values in order
      origElemKeys.forEach(key => {
        compareNodes(original[key], replayed[key], `${path}/${key}`, diffs);
      });
    }

    return;
  }

  // ── Type mismatch (primitive vs object, etc.) ─────────────────────────────
  diffs.push({
    path,
    original: summarise(original),
    replayed: summarise(replayed),
  });
}

/**
 * Produce a short human-readable summary of a node value for diff messages.
 *
 * @param {*} value
 * @returns {string}
 */
function summarise(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? ', ...' : ''}}`;
  }
  return String(value);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compare two SFCC promotion XML documents structurally.
 *
 * Both documents are parsed with xmlbuilder2 convert({ format: 'object' }).
 * The resulting object trees are compared recursively using XML semantics:
 *   - Element child ordering is significant
 *   - Attribute ordering within an element is NOT significant
 *   - Insignificant whitespace (whitespace-only text nodes) is ignored
 *   - Self-closing and explicit-empty elements are equivalent
 *
 * @param {string} originalXml - The reference XML document
 * @param {string} replayedXml - The reconstructed XML document
 * @returns {{ equal: boolean, differences: StructuralDifference[] }}
 */
function compareXMLStructures(originalXml, replayedXml) {
  if (typeof originalXml !== 'string' || originalXml.trim() === '') {
    throw new Error('originalXml must be a non-empty string');
  }
  if (typeof replayedXml !== 'string' || replayedXml.trim() === '') {
    throw new Error('replayedXml must be a non-empty string');
  }

  let origObj, replObj;

  try {
    origObj = convert(originalXml, { format: 'object' });
  } catch (err) {
    throw new Error(`Failed to parse originalXml: ${err.message}`);
  }

  try {
    replObj = convert(replayedXml, { format: 'object' });
  } catch (err) {
    throw new Error(`Failed to parse replayedXml: ${err.message}`);
  }

  const differences = [];
  compareNodes(origObj, replObj, '', differences);

  return {
    equal:       differences.length === 0,
    differences,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  compareXMLStructures,
  _internals: {
    compareNodes,
    summarise,
  },
};
