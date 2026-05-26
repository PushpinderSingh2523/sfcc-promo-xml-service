'use strict';

// ─── Compatibility validator ───────────────────────────────────────────────────
//
// Compares two SAS blueprint records and identifies structural differences.
//
// Purpose:
//   When a new SFCC export arrives for a recurring SAS season, the extractor
//   produces a new blueprint.  Before that blueprint is used, this validator
//   is run against the previous blueprint version.  Any structural change is
//   surfaced — the caller decides how to proceed.
//
// Contract:
//   - This module NEVER mutates either blueprint.
//   - It only reads and compares.
//   - "Compatible" means: the new blueprint can be used as a drop-in replacement
//     for the old one without breaking any renderer call or clarification flow.
//
// A change is BREAKING when:
//   - A promotion slot is added or removed
//   - An assignment slot is added or removed
//   - A discount family changes (simple → product-amount or vice versa)
//   - A discount entry count changes (different number of tiers)
//   - A discount entry type changes (percentage → amount or vice versa)
//   - A qualifier match-mode changes
//   - A qualifier presence flag changes (hasCustomerGroups / hasSourceCodes / hasCoupons)
//   - A customer-groups block appears or disappears in an assignment
//   - A schedule presence flag changes (hasStartDate / hasEndDate)
//   - A frozen flag value changes (enabledFlag, archivedFlag, etc.)
//   - An exclusivity value changes
//   - A product condition block structure changes (type, catalogId, operator, categoryIds)
//   - disableGlobalExcludedProducts changes
//   - maxApplications changes
//
// A change is a WARNING when:
//   - The name locales change (new locale added or locale removed)
//   - A frozen custom attribute is added or removed
//   - A frozen custom attribute value changes
//   - A customer-group groupId changes (frozen: group membership is frozen)
//   - A rank changes
//   - The campaign enabledFlag or campaignScope changes
//   - The namespace changes
//
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} CompatibilityResult
 * @property {boolean}  compatible      - true only if there are zero breaking changes
 * @property {string[]} breakingChanges - human-readable breaking change descriptions
 * @property {string[]} warnings        - human-readable non-breaking anomaly descriptions
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Add a breaking-change entry with an optional slot-context prefix.
 */
function breaking(list, context, msg) {
  list.push(context ? `[${context}] ${msg}` : msg);
}

/**
 * Add a warning entry with an optional slot-context prefix.
 */
function warning(list, context, msg) {
  list.push(context ? `[${context}] ${msg}` : msg);
}

/**
 * Compare two arrays of primitive values for equality (order-sensitive).
 * Returns a description string if they differ, or null if they are equal.
 *
 * @param {Array} a
 * @param {Array} b
 * @returns {string|null}
 */
function arrayDiff(a, b) {
  if (!Array.isArray(a) && !Array.isArray(b)) return null;
  const aArr = Array.isArray(a) ? a : [a];
  const bArr = Array.isArray(b) ? b : [b];
  if (aArr.length !== bArr.length) {
    return `length ${aArr.length} → ${bArr.length}`;
  }
  for (let i = 0; i < aArr.length; i++) {
    if (aArr[i] !== bArr[i]) {
      return `[${i}] ${JSON.stringify(aArr[i])} → ${JSON.stringify(bArr[i])}`;
    }
  }
  return null;
}

/**
 * Deep-equality comparison used only for product condition structures.
 * Returns a string describing the first difference, or null if equal.
 *
 * @param {*} a
 * @param {*} b
 * @param {string} path - breadcrumb for error messages
 * @returns {string|null}
 */
function deepDiff(a, b, path) {
  if (a === b) return null;

  if (a === null && b === null) return null;
  if (a === null) return `${path}: was null, now present`;
  if (b === null) return `${path}: was present, now null`;

  if (typeof a !== typeof b) {
    return `${path}: type changed from ${typeof a} to ${typeof b}`;
  }

  if (Array.isArray(a) !== Array.isArray(b)) {
    return `${path}: array-ness changed`;
  }

  if (Array.isArray(a)) {
    if (a.length !== b.length) {
      return `${path}: array length ${a.length} → ${b.length}`;
    }
    for (let i = 0; i < a.length; i++) {
      const diff = deepDiff(a[i], b[i], `${path}[${i}]`);
      if (diff) return diff;
    }
    return null;
  }

  if (typeof a === 'object') {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    const allKeys = new Set([...keysA, ...keysB]);
    for (const key of allKeys) {
      if (!Object.prototype.hasOwnProperty.call(a, key)) {
        return `${path}.${key}: added`;
      }
      if (!Object.prototype.hasOwnProperty.call(b, key)) {
        return `${path}.${key}: removed`;
      }
      const diff = deepDiff(a[key], b[key], `${path}.${key}`);
      if (diff) return diff;
    }
    return null;
  }

  // Primitive non-equal
  return `${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`;
}

// ─── Per-section comparators ──────────────────────────────────────────────────

/**
 * Compare campaign slots.
 *
 * @param {object} prev
 * @param {object} next
 * @param {string[]} bc - breaking changes list (mutated)
 * @param {string[]} w  - warnings list (mutated)
 */
function compareCampaignSlots(prev, next, bc, w) {
  const ctx = 'campaign';

  // enabledFlag is frozen; a change is a warning (unusual but non-breaking for XML)
  if (prev.frozenStructure.enabledFlag !== next.frozenStructure.enabledFlag) {
    warning(w, ctx, `enabledFlag changed: ${prev.frozenStructure.enabledFlag} → ${next.frozenStructure.enabledFlag}`);
  }

  // campaignScope.applicableOnline
  const prevOnline = prev.frozenStructure.campaignScope.applicableOnline;
  const nextOnline = next.frozenStructure.campaignScope.applicableOnline;
  if (prevOnline !== nextOnline) {
    warning(w, ctx, `campaignScope.applicableOnline changed: ${prevOnline} → ${nextOnline}`);
  }
}

/**
 * Compare frozen flags of two promotion slots.
 *
 * @param {object} prevFs - frozenStructure of previous slot
 * @param {object} nextFs - frozenStructure of next slot
 * @param {string} ctx
 * @param {string[]} bc
 */
function comparePromotionFlags(prevFs, nextFs, ctx, bc) {
  const flags = [
    'enabledFlag',
    'archivedFlag',
    'searchableFlag',
    'refinableFlag',
    'preventRequalifyingFlag',
    'prorateAcrossEligibleItemsFlag',
  ];
  flags.forEach(flag => {
    if (prevFs[flag] !== nextFs[flag]) {
      breaking(bc, ctx, `frozenStructure.${flag} changed: ${prevFs[flag]} → ${nextFs[flag]}`);
    }
  });

  if (prevFs.exclusivity !== nextFs.exclusivity) {
    breaking(bc, ctx, `exclusivity changed: ${prevFs.exclusivity} → ${nextFs.exclusivity}`);
  }
}

/**
 * Compare discount structures of two promotion slots.
 *
 * @param {object} prevFs
 * @param {object} nextFs
 * @param {string} ctx
 * @param {string[]} bc
 */
function comparePromotionDiscounts(prevFs, nextFs, ctx, bc) {
  if (prevFs.discountFamily !== nextFs.discountFamily) {
    breaking(bc, ctx,
      `discountFamily changed: ${prevFs.discountFamily} → ${nextFs.discountFamily}. ` +
      'This changes which XML elements the renderer emits and is not backward compatible.'
    );
    return; // No point comparing further if families differ
  }

  if (prevFs.discountFamily === 'simple') {
    if (prevFs.simpleDiscountType !== nextFs.simpleDiscountType) {
      breaking(bc, ctx,
        `simpleDiscountType changed: ${prevFs.simpleDiscountType} → ${nextFs.simpleDiscountType}`
      );
    }
  }

  if (prevFs.discountFamily === 'product-amount') {
    const prevTemplates = prevFs.discountEntryTemplates || [];
    const nextTemplates = nextFs.discountEntryTemplates || [];

    if (prevTemplates.length !== nextTemplates.length) {
      breaking(bc, ctx,
        `discountEntryTemplates count changed: ${prevTemplates.length} → ${nextTemplates.length}. ` +
        'Adding or removing discount tiers changes the XML structure.'
      );
    } else {
      prevTemplates.forEach((prev, i) => {
        if (prev.discountType !== nextTemplates[i].discountType) {
          breaking(bc, ctx,
            `discountEntryTemplates[${i}].discountType changed: ` +
            `${prev.discountType} → ${nextTemplates[i].discountType}`
          );
        }
      });
    }
  }
}

/**
 * Compare qualifying-products and discounted-products structures.
 *
 * @param {object} prevFs
 * @param {object} nextFs
 * @param {string} ctx
 * @param {string[]} bc
 */
function comparePromotionProducts(prevFs, nextFs, ctx, bc) {
  const qpDiff = deepDiff(prevFs.qualifyingProducts, nextFs.qualifyingProducts, 'qualifyingProducts');
  if (qpDiff) {
    breaking(bc, ctx, `qualifyingProducts structure changed: ${qpDiff}`);
  }

  const dpDiff = deepDiff(prevFs.discountedProducts, nextFs.discountedProducts, 'discountedProducts');
  if (dpDiff) {
    breaking(bc, ctx, `discountedProducts structure changed: ${dpDiff}`);
  }
}

/**
 * Compare optional frozen rule fields.
 *
 * @param {object} prevFs
 * @param {object} nextFs
 * @param {string} ctx
 * @param {string[]} bc
 */
function comparePromotionRuleExtras(prevFs, nextFs, ctx, bc) {
  if (prevFs.disableGlobalExcludedProducts !== nextFs.disableGlobalExcludedProducts) {
    breaking(bc, ctx,
      `disableGlobalExcludedProducts changed: ` +
      `${prevFs.disableGlobalExcludedProducts} → ${nextFs.disableGlobalExcludedProducts}`
    );
  }

  if (prevFs.maxApplications !== nextFs.maxApplications) {
    breaking(bc, ctx,
      `maxApplications changed: ${prevFs.maxApplications} → ${nextFs.maxApplications}`
    );
  }
}

/**
 * Compare custom attribute sets of two promotion slots.
 *
 * Frozen attribute changes are warnings.
 * Name locale changes are warnings.
 *
 * @param {object} prevFs
 * @param {object} nextFs
 * @param {string} ctx
 * @param {string[]} w
 */
function comparePromotionAttributes(prevFs, nextFs, ctx, w) {
  // Name locales
  const localeDiff = arrayDiff(prevFs.nameLocales, nextFs.nameLocales);
  if (localeDiff) {
    warning(w, ctx, `nameLocales changed: ${localeDiff}`);
  }

  // Frozen custom attribute count
  const prevFrozen = prevFs.frozenCustomAttributes || [];
  const nextFrozen = nextFs.frozenCustomAttributes || [];

  if (prevFrozen.length !== nextFrozen.length) {
    warning(w, ctx,
      `frozenCustomAttributes count changed: ${prevFrozen.length} → ${nextFrozen.length}. ` +
      'New or removed custom-attribute elements detected.'
    );
  } else {
    prevFrozen.forEach((attr, i) => {
      const nextAttr = nextFrozen[i];
      if (attr.attributeId !== nextAttr.attributeId) {
        warning(w, ctx,
          `frozenCustomAttributes[${i}].attributeId changed: ` +
          `${attr.attributeId} → ${nextAttr.attributeId}`
        );
      } else if (attr.value !== nextAttr.value) {
        warning(w, ctx,
          `frozenCustomAttributes[${i}] (${attr.attributeId}) value changed: ` +
          `${JSON.stringify(attr.value)} → ${JSON.stringify(nextAttr.value)}`
        );
      }
    });
  }
}

/**
 * Compare two promotion slots at the same slotIndex.
 *
 * @param {object} prev
 * @param {object} next
 * @param {string[]} bc
 * @param {string[]} w
 */
function comparePromotionSlot(prev, next, bc, w) {
  const ctx = `promotionSlots[${prev.slotIndex}]`;

  const prevFs = prev.frozenStructure;
  const nextFs = next.frozenStructure;

  comparePromotionFlags(prevFs, nextFs, ctx, bc);
  comparePromotionDiscounts(prevFs, nextFs, ctx, bc);
  comparePromotionProducts(prevFs, nextFs, ctx, bc);
  comparePromotionRuleExtras(prevFs, nextFs, ctx, bc);
  comparePromotionAttributes(prevFs, nextFs, ctx, w);
}

/**
 * Compare two assignment slots at the same slotIndex.
 *
 * @param {object} prev
 * @param {object} next
 * @param {string[]} bc
 * @param {string[]} w
 */
function compareAssignmentSlot(prev, next, bc, w) {
  const ctx = `assignmentSlots[${prev.slotIndex}]`;

  const prevFs = prev.frozenStructure;
  const nextFs = next.frozenStructure;

  // ── Qualifiers ───────────────────────────────────────────────────────────
  const prevQ = prevFs.qualifiers;
  const nextQ = nextFs.qualifiers;

  if (prevQ.matchMode !== nextQ.matchMode) {
    breaking(bc, ctx,
      `qualifiers.matchMode changed: ${prevQ.matchMode} → ${nextQ.matchMode}`
    );
  }

  ['hasCustomerGroups', 'hasSourceCodes', 'hasCoupons'].forEach(flag => {
    if (prevQ[flag] !== nextQ[flag]) {
      breaking(bc, ctx,
        `qualifiers.${flag} changed: ${prevQ[flag]} → ${nextQ[flag]}. ` +
        'Qualifier element presence is frozen structural data.'
      );
    }
  });

  // ── Customer groups outside qualifiers ───────────────────────────────────
  const prevCG = prevFs.customerGroups;
  const nextCG = nextFs.customerGroups;

  if ((prevCG === null) !== (nextCG === null)) {
    breaking(bc, ctx,
      `customerGroups block presence changed: ${prevCG === null ? 'absent' : 'present'} → ` +
      `${nextCG === null ? 'absent' : 'present'}`
    );
  } else if (prevCG !== null && nextCG !== null) {
    if (prevCG.matchMode !== nextCG.matchMode) {
      breaking(bc, ctx,
        `customerGroups.matchMode changed: ${prevCG.matchMode} → ${nextCG.matchMode}`
      );
    }

    const groupDiff = arrayDiff(prevCG.groupIds, nextCG.groupIds);
    if (groupDiff) {
      warning(w, ctx, `customerGroups.groupIds changed: ${groupDiff}`);
    }
  }

  // ── Schedule presence ─────────────────────────────────────────────────────
  if (prevFs.hasStartDate !== nextFs.hasStartDate) {
    breaking(bc, ctx,
      `hasStartDate changed: ${prevFs.hasStartDate} → ${nextFs.hasStartDate}. ` +
      'Presence of <start-date> is frozen structural data.'
    );
  }
  if (prevFs.hasEndDate !== nextFs.hasEndDate) {
    breaking(bc, ctx,
      `hasEndDate changed: ${prevFs.hasEndDate} → ${nextFs.hasEndDate}. ` +
      'Presence of <end-date> is frozen structural data.'
    );
  }

  // ── Rank (warning) ────────────────────────────────────────────────────────
  if (prevFs.rank !== nextFs.rank) {
    warning(w, ctx, `rank changed: ${prevFs.rank} → ${nextFs.rank}`);
  }
}

// ─── Main validator ───────────────────────────────────────────────────────────

/**
 * Compare a newly extracted SAS blueprint against a prior blueprint version.
 *
 * Returns a CompatibilityResult.  The caller must inspect `compatible` and
 * `breakingChanges` before accepting the new blueprint for production use.
 *
 * This function DOES NOT mutate either blueprint.  It only reads and reports.
 *
 * @param {object} previousBlueprint - The stored prior blueprint record
 * @param {object} nextBlueprint     - The newly extracted blueprint record
 * @returns {CompatibilityResult}
 */
function validateBlueprintCompatibility(previousBlueprint, nextBlueprint) {
  if (!previousBlueprint || typeof previousBlueprint !== 'object') {
    throw new Error('previousBlueprint must be a non-null object');
  }
  if (!nextBlueprint || typeof nextBlueprint !== 'object') {
    throw new Error('nextBlueprint must be a non-null object');
  }

  const breakingChanges = [];
  const warnings        = [];

  // ── Slot count checks (breaking) ─────────────────────────────────────────
  const prevPromoCount = (previousBlueprint.promotionSlots  || []).length;
  const nextPromoCount = (nextBlueprint.promotionSlots       || []).length;
  const prevAssignCount = (previousBlueprint.assignmentSlots || []).length;
  const nextAssignCount = (nextBlueprint.assignmentSlots      || []).length;

  if (prevPromoCount !== nextPromoCount) {
    breaking(breakingChanges, null,
      `promotionSlots count changed: ${prevPromoCount} → ${nextPromoCount}. ` +
      'Adding or removing promotion slots changes campaign structure.'
    );
  }

  if (prevAssignCount !== nextAssignCount) {
    breaking(breakingChanges, null,
      `assignmentSlots count changed: ${prevAssignCount} → ${nextAssignCount}. ` +
      'Adding or removing assignment slots changes campaign structure.'
    );
  }

  // ── Campaign ──────────────────────────────────────────────────────────────
  if (previousBlueprint.campaignSlot && nextBlueprint.campaignSlot) {
    compareCampaignSlots(
      previousBlueprint.campaignSlot,
      nextBlueprint.campaignSlot,
      breakingChanges,
      warnings
    );
  }

  // ── Promotion slots (pairwise by index) ───────────────────────────────────
  const slotCount = Math.min(prevPromoCount, nextPromoCount);
  for (let i = 0; i < slotCount; i++) {
    comparePromotionSlot(
      previousBlueprint.promotionSlots[i],
      nextBlueprint.promotionSlots[i],
      breakingChanges,
      warnings
    );
  }

  // ── Assignment slots (pairwise by index) ─────────────────────────────────
  const assignCount = Math.min(prevAssignCount, nextAssignCount);
  for (let i = 0; i < assignCount; i++) {
    compareAssignmentSlot(
      previousBlueprint.assignmentSlots[i],
      nextBlueprint.assignmentSlots[i],
      breakingChanges,
      warnings
    );
  }

  return {
    compatible:     breakingChanges.length === 0,
    breakingChanges,
    warnings,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  validateBlueprintCompatibility,
  // Named exports for unit testing of internal helpers
  _internals: {
    arrayDiff,
    deepDiff,
    compareCampaignSlots,
    comparePromotionSlot,
    compareAssignmentSlot,
  },
};
