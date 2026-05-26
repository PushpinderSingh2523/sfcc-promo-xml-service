'use strict';

// ─── Dependencies ─────────────────────────────────────────────────────────────

const {
  REGISTRY_MAP,
  GROUP_ORDER,
  getField,
} = require('../fieldRegistry/sasEditableFieldRegistry');

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} ClassifiedField
 * @property {string}  fieldId        — Registry field identifier
 * @property {string}  slotType       — 'campaign' | 'promotion' | 'assignment'
 * @property {number|null} slotIndex  — Zero-based source order; null for campaign
 * @property {string}  path           — Human-readable blueprint path for debugging
 * @property {*}       currentValue   — The extracted value from the blueprint
 * @property {string|null} xmlLang    — Locale tag when field is localized, else null
 * @property {object}  registryEntry  — Full registry definition for this field
 */

// ─── Validators ───────────────────────────────────────────────────────────────

function validateBlueprint(blueprint) {
  if (!blueprint || typeof blueprint !== 'object') {
    throw new Error('blueprint must be a non-null object');
  }
  if (!blueprint.campaignSlot) {
    throw new Error('blueprint.campaignSlot is required');
  }
  if (!Array.isArray(blueprint.promotionSlots) || blueprint.promotionSlots.length === 0) {
    throw new Error('blueprint.promotionSlots must be a non-empty array');
  }
  if (!Array.isArray(blueprint.assignmentSlots) || blueprint.assignmentSlots.length === 0) {
    throw new Error('blueprint.assignmentSlots must be a non-empty array');
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Emit one ClassifiedField if the registry entry exists for the given fieldId.
 * Silently skips fields not found in the registry (they remain frozen/unknown).
 *
 * @param {string}      fieldId
 * @param {string}      slotType
 * @param {number|null} slotIndex
 * @param {string}      path
 * @param {*}           currentValue
 * @param {string|null} xmlLang
 * @returns {ClassifiedField|null}
 */
function makeClassifiedField(fieldId, slotType, slotIndex, path, currentValue, xmlLang = null) {
  const registryEntry = getField(fieldId);
  if (!registryEntry) return null;

  return {
    fieldId,
    slotType,
    slotIndex,
    path,
    currentValue,
    xmlLang,
    registryEntry,
  };
}

/**
 * Walk a promotion slot and emit one ClassifiedField per editable (or
 * registry-tracked frozen) field that has a non-null value.
 *
 * @param {object} slot       — A promotionSlot from the blueprint
 * @param {number} slotIndex
 * @returns {ClassifiedField[]}
 */
function classifyPromotionSlot(slot, slotIndex) {
  const { frozenStructure: fs, editableFields: ef } = slot;
  const ctx    = `promotionSlots[${slotIndex}]`;
  const fields = [];

  const emit = (fieldId, subPath, value, xmlLang = null) => {
    const cf = makeClassifiedField(
      fieldId,
      'promotion',
      slotIndex,
      `${ctx}.${subPath}`,
      value,
      xmlLang
    );
    if (cf) fields.push(cf);
  };

  // ── Identity ────────────────────────────────────────────────────────────────
  emit('promotionId', 'editableFields.promotionId', ef.promotionId);

  // ── Names (one classified field per locale) ────────────────────────────────
  if (Array.isArray(ef.names)) {
    ef.names.forEach((nameEntry, ni) => {
      emit('name', `editableFields.names[${ni}]`, nameEntry.value, nameEntry.xmlLang);
    });
  }

  // ── Simple discount ─────────────────────────────────────────────────────────
  if (ef.simpleDiscountValue !== null && ef.simpleDiscountValue !== undefined) {
    emit('simpleDiscountValue', 'editableFields.simpleDiscountValue', ef.simpleDiscountValue);
  }

  // ── Tiered discount entries ─────────────────────────────────────────────────
  if (Array.isArray(ef.discountEntries) && ef.discountEntries.length > 0) {
    emit('discountEntries', 'editableFields.discountEntries', ef.discountEntries);
  }

  // ── Editable custom attributes ──────────────────────────────────────────────
  if (Array.isArray(ef.editableCustomAttributes)) {
    ef.editableCustomAttributes.forEach((attr, ai) => {
      emit(
        attr.attributeId,
        `editableFields.editableCustomAttributes[${ai}]`,
        attr.value,
        attr.xmlLang
      );
    });
  }

  // ── Frozen replay-critical fields ──────────────────────────────────────────
  // These are not editable but are tracked for replay-critical awareness.
  emit('exclusivity', 'frozenStructure.exclusivity', fs.exclusivity);

  if (fs.maxApplications !== null && fs.maxApplications !== undefined) {
    emit('maxApplications', 'frozenStructure.maxApplications', fs.maxApplications);
  }

  if (fs.disableGlobalExcludedProducts === true) {
    emit('disableGlobalExcludedProducts', 'frozenStructure.disableGlobalExcludedProducts', true);
  }

  // Frozen custom attributes that are replay-critical (e.g. thresholdPercentage, thresholdValues)
  if (Array.isArray(fs.frozenCustomAttributes)) {
    fs.frozenCustomAttributes.forEach((attr, ai) => {
      if (REGISTRY_MAP.has(attr.attributeId)) {
        const cf = makeClassifiedField(
          attr.attributeId,
          'promotion',
          slotIndex,
          `${ctx}.frozenStructure.frozenCustomAttributes[${ai}]`,
          attr.value,
          attr.xmlLang
        );
        if (cf) fields.push(cf);
      }
    });
  }

  // Locale metadata
  if (Array.isArray(fs.nameLocales) && fs.nameLocales.length > 0) {
    emit('nameLocales', 'frozenStructure.nameLocales', fs.nameLocales);
  }

  // Category IDs (frozen but registry-tracked)
  const collectCategoryIds = (productsBlock, fieldId, subLabel) => {
    if (!productsBlock) return;
    const ids = [];
    if (productsBlock.includedProducts) {
      productsBlock.includedProducts.conditionGroups.forEach(cg => {
        if (cg.condition.type === 'category') {
          cg.condition.categoryIds.forEach(id => ids.push(id));
        }
      });
    }
    if (ids.length > 0) {
      emit(fieldId, `frozenStructure.${subLabel}`, ids);
    }
  };

  const collectExcludedCategoryIds = (productsBlock, subLabel) => {
    if (!productsBlock || !productsBlock.excludedProducts) return;
    const ids = [];
    productsBlock.excludedProducts.conditionGroups.forEach(cg => {
      if (cg.condition.type === 'category') {
        cg.condition.categoryIds.forEach(id => ids.push(id));
      }
    });
    if (ids.length > 0) {
      emit('excludedCategoryIds', `frozenStructure.${subLabel}`, ids);
    }
  };

  collectCategoryIds(fs.qualifyingProducts, 'includedCategoryIds', 'qualifyingProducts.includedProducts');
  collectCategoryIds(fs.discountedProducts, 'includedCategoryIds', 'discountedProducts.includedProducts');
  collectExcludedCategoryIds(fs.qualifyingProducts, 'qualifyingProducts.excludedProducts');
  collectExcludedCategoryIds(fs.discountedProducts, 'discountedProducts.excludedProducts');

  return fields;
}

/**
 * Walk an assignment slot and emit one ClassifiedField per editable (or
 * registry-tracked frozen) field that has a non-null value.
 *
 * @param {object} slot       — An assignmentSlot from the blueprint
 * @param {number} slotIndex
 * @returns {ClassifiedField[]}
 */
function classifyAssignmentSlot(slot, slotIndex) {
  const { frozenStructure: fs, editableFields: ef } = slot;
  const ctx    = `assignmentSlots[${slotIndex}]`;
  const fields = [];

  const emit = (fieldId, subPath, value) => {
    const cf = makeClassifiedField(
      fieldId,
      'assignment',
      slotIndex,
      `${ctx}.${subPath}`,
      value
    );
    if (cf) fields.push(cf);
  };

  // ── Coupons ──────────────────────────────────────────────────────────────────
  if (ef.couponIds !== null && ef.couponIds !== undefined) {
    emit('couponIds', 'editableFields.couponIds', ef.couponIds);
  }

  // ── Scheduling ────────────────────────────────────────────────────────────────
  if (fs.hasStartDate && ef.startDate !== null && ef.startDate !== undefined) {
    emit('startDate', 'editableFields.startDate', ef.startDate);
  }
  if (fs.hasEndDate && ef.endDate !== null && ef.endDate !== undefined) {
    emit('endDate', 'editableFields.endDate', ef.endDate);
  }

  // ── Eligibility (frozen, replay-critical) ────────────────────────────────────
  emit('qualifiersMatchMode', 'frozenStructure.qualifiers.matchMode', fs.qualifiers.matchMode);
  emit('hasCustomerGroups', 'frozenStructure.qualifiers.hasCustomerGroups', fs.qualifiers.hasCustomerGroups);
  emit('hasSourceCodes', 'frozenStructure.qualifiers.hasSourceCodes', fs.qualifiers.hasSourceCodes);
  emit('hasCoupons', 'frozenStructure.qualifiers.hasCoupons', fs.qualifiers.hasCoupons);

  if (fs.customerGroups !== null && fs.customerGroups !== undefined) {
    emit('customerGroupIds', 'frozenStructure.customerGroups.groupIds', fs.customerGroups.groupIds);
  }

  // ── Operational ───────────────────────────────────────────────────────────────
  emit('rank', 'frozenStructure.rank', fs.rank);

  return fields;
}

// ─── Group builder ────────────────────────────────────────────────────────────

/**
 * Organise a flat list of ClassifiedFields into groups following GROUP_ORDER.
 *
 * Within each group, fields are ordered by:
 *   1. slotType ('campaign' < 'promotion' < 'assignment')
 *   2. slotIndex (ascending)
 *   3. fieldId (alphabetical — secondary stable sort)
 *
 * @param {ClassifiedField[]} fields
 * @returns {object} Map from group name → ClassifiedField[]
 */
function buildGroupedFields(fields) {
  const SLOT_RANK = { campaign: 0, promotion: 1, assignment: 2 };

  const grouped = {};
  GROUP_ORDER.forEach(g => { grouped[g] = []; });

  fields.forEach(cf => {
    const group = cf.registryEntry.group;
    if (grouped[group]) {
      grouped[group].push(cf);
    }
  });

  // Stable sort within each group
  GROUP_ORDER.forEach(g => {
    grouped[g].sort((a, b) => {
      const rankDiff = (SLOT_RANK[a.slotType] || 0) - (SLOT_RANK[b.slotType] || 0);
      if (rankDiff !== 0) return rankDiff;
      const idxDiff = (a.slotIndex || 0) - (b.slotIndex || 0);
      if (idxDiff !== 0) return idxDiff;
      return a.fieldId.localeCompare(b.fieldId);
    });
  });

  return grouped;
}

/**
 * Build an ordered flat list of editable ClassifiedFields following GROUP_ORDER.
 * Excludes non-editable fields — these appear only in groupedFields.
 *
 * @param {ClassifiedField[]} fields
 * @returns {ClassifiedField[]}
 */
function buildOrderedQuestions(fields) {
  const editable = fields.filter(cf => cf.registryEntry.editable === true);

  const SLOT_RANK = { campaign: 0, promotion: 1, assignment: 2 };
  const groupRank = {};
  GROUP_ORDER.forEach((g, i) => { groupRank[g] = i; });

  return [...editable].sort((a, b) => {
    const gDiff = (groupRank[a.registryEntry.group] || 0) - (groupRank[b.registryEntry.group] || 0);
    if (gDiff !== 0) return gDiff;
    const sDiff = (SLOT_RANK[a.slotType] || 0) - (SLOT_RANK[b.slotType] || 0);
    if (sDiff !== 0) return sDiff;
    const iDiff = (a.slotIndex || 0) - (b.slotIndex || 0);
    if (iDiff !== 0) return iDiff;
    return a.fieldId.localeCompare(b.fieldId);
  });
}

/**
 * Build a list of validation requirements for all editable fields present.
 *
 * @param {ClassifiedField[]} fields
 * @returns {object[]} — [{ fieldId, path, validation, required }]
 */
function buildValidationRequirements(fields) {
  return fields
    .filter(cf => cf.registryEntry.editable && cf.registryEntry.validation !== null)
    .map(cf => ({
      fieldId:    cf.fieldId,
      path:       cf.path,
      validation: cf.registryEntry.validation,
      required:   cf.registryEntry.required,
    }));
}

// ─── Main classifier ──────────────────────────────────────────────────────────

/**
 * Walk a complete SAS blueprint record and produce a deterministic, exhaustive
 * classification of all editable fields and replay-critical frozen fields.
 *
 * Classification is purely mechanical:
 *   - Every field that exists in the blueprint is checked against the registry.
 *   - Registry-tracked fields are emitted with full metadata.
 *   - Unrecognised fields (not in registry) are silently passed over.
 *   - Source order (slotIndex) is preserved.
 *   - Ordering within groups is deterministic (slot rank → index → fieldId).
 *
 * @param {object} blueprint - Canonical SAS blueprint record
 * @returns {{
 *   groupedFields:          object,       // GROUP_ORDER keys → ClassifiedField[]
 *   orderedQuestions:       ClassifiedField[], // editable fields only, group-ordered
 *   validationRequirements: object[],     // validation metadata for editable fields
 * }}
 */
function classifyEditableFields(blueprint) {
  validateBlueprint(blueprint);

  const allFields = [];

  // ── Campaign slot ─────────────────────────────────────────────────────────
  const cs = blueprint.campaignSlot;
  const campaignId = makeClassifiedField(
    'campaignId',
    'campaign',
    null,
    'campaignSlot.editableFields.campaignId',
    cs.editableFields.campaignId
  );
  if (campaignId) allFields.push(campaignId);

  // ── Promotion slots (source order) ───────────────────────────────────────
  blueprint.promotionSlots.forEach((slot, i) => {
    classifyPromotionSlot(slot, i).forEach(cf => allFields.push(cf));
  });

  // ── Assignment slots (source order) ──────────────────────────────────────
  blueprint.assignmentSlots.forEach((slot, i) => {
    classifyAssignmentSlot(slot, i).forEach(cf => allFields.push(cf));
  });

  return {
    groupedFields:          buildGroupedFields(allFields),
    orderedQuestions:       buildOrderedQuestions(allFields),
    validationRequirements: buildValidationRequirements(allFields),
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  classifyEditableFields,
  // Internal helpers exported for unit testing
  _internals: {
    classifyPromotionSlot,
    classifyAssignmentSlot,
    buildGroupedFields,
    buildOrderedQuestions,
    buildValidationRequirements,
    makeClassifiedField,
  },
};
