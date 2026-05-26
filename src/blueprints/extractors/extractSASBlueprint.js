'use strict';

// ─── Dependencies ─────────────────────────────────────────────────────────────

const { convert } = require('xmlbuilder2');

// ─── Constants ────────────────────────────────────────────────────────────────

const SFCC_NS = 'http://www.demandware.com/xml/impex/promotion/2008-01-31';

/**
 * Canonical fingerprint of <global-promotion-settings> as produced by
 * xmlbuilder2 convert({ format: 'object' }) on real SFCC exports.
 *
 * If the parsed export's global-promotion-settings deviates from this
 * fingerprint in any way, extraction is halted and an error is thrown.
 * This is the sole structural invariant that crosses all SAS exports.
 *
 * Source of truth: Summer_SAS.xml (2025 enterprise export).
 */
const FROZEN_GLOBAL_SETTINGS_FINGERPRINT = Object.freeze({
  'global-excluded-products': {
    'included-products': {
      'condition-group': [
        {
          'category-condition': {
            '@catalog-id': 'siteCatalog_ToryUS',
            '@operator':   'is equal',
            'category-id': 'Exclusions-Always',
          },
        },
        {
          'category-condition': {
            '@catalog-id': 'siteCatalog_ToryUS',
            '@operator':   'is equal',
            'category-id': 'accessories-seedbox-foundation',
          },
        },
        {
          'category-condition': {
            '@catalog-id': 'siteCatalog_ToryUS',
            '@operator':   'is equal',
            'category-id': 'accessories-masks',
          },
        },
      ],
    },
  },
  'global-excluded-product-options': {
    'product-option-id': 'monogramming',
  },
});

/**
 * The set of custom-attribute IDs that carry user-facing copy and therefore
 * change between SAS seasons.  All other attribute IDs are frozen.
 *
 * Rules:
 *   - Any attribute whose value is human-readable cart/storefront copy → editable
 *   - Any attribute whose value is a boolean flag string → frozen
 *   - Any attribute whose value is a nested <value> numeric config → frozen
 *     (structure frozen; the architecture designates these as out-of-scope
 *      for season-over-season clarification in the current phase)
 *
 * Source of truth: Summer_SAS.xml attribute-id inventory + architecture doc §3.2
 */
const EDITABLE_CUSTOM_ATTR_IDS = new Set([
  'storefront_msg_cart_inclusion',
  'storefront_msg_cart_exclusion',
  'includedBadge',
  'includedBadgeSPP',
  'couponErrorMsgNoActivePromotion',
  'couponErrorMsgRedemptionLimitExeeded',
  'couponErrorMsgNoApplicablePromotion',
  'couponErrorMsgNoApplicablePromo',
]);

// ─── Utility helpers ──────────────────────────────────────────────────────────

/**
 * Normalise a value that may be a single item or an array into an array.
 * Does NOT add defaults — if the value is undefined or null, returns [].
 *
 * @param {*} value
 * @returns {Array}
 */
function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Parse an XML boolean text value ('true' / 'false') into a JS boolean.
 * Throws if the string is neither.
 *
 * @param {string} raw
 * @param {string} nodeName - used in error messages only
 * @returns {boolean}
 */
function parseBoolNode(raw, nodeName) {
  if (raw === 'true')  return true;
  if (raw === 'false') return false;
  throw new Error(`Expected boolean string for <${nodeName}> but got: ${JSON.stringify(raw)}`);
}

/**
 * Deep-equality comparison.  Used exclusively to compare the
 * global-promotion-settings fingerprint.
 *
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => deepEqual(item, b[i]));
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(key => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]));
}

// ─── Condition-group / product-condition extraction ───────────────────────────

/**
 * Extract a single condition from a condition-group node.
 * The condition-group must contain exactly one of:
 *   - <category-condition>
 *   - <price-condition>
 *
 * Returns a typed condition object.  Throws if neither is present.
 *
 * @param {object} cgNode - xmlbuilder2 object representation of <condition-group>
 * @returns {{ type: 'category'|'price', ... }}
 */
function extractConditionFromGroup(cgNode) {
  if (cgNode['category-condition'] !== undefined) {
    const cc = cgNode['category-condition'];
    return {
      type:        'category',
      catalogId:   cc['@catalog-id'],
      operator:    cc['@operator'],
      categoryIds: toArray(cc['category-id']),
    };
  }

  if (cgNode['price-condition'] !== undefined) {
    const pc = cgNode['price-condition'];
    return {
      type:     'price',
      operator: pc['@operator'],
      price:    parseFloat(pc['price']),
    };
  }

  throw new Error(
    'Unrecognised condition-group: expected <category-condition> or <price-condition>. ' +
    `Got keys: ${Object.keys(cgNode).join(', ')}`
  );
}

/**
 * Extract a <included-products> or <excluded-products> node into a
 * ProductConditionBlock.
 *
 * Preserves source order of condition-groups.  Each condition-group
 * maps to one conditionGroups[] entry.
 *
 * @param {object} productsNode - xmlbuilder2 object for the products element
 * @returns {{ conditionGroups: Array }}
 */
function extractProductConditionBlock(productsNode) {
  const rawGroups = toArray(productsNode['condition-group']);
  if (rawGroups.length === 0) {
    throw new Error('Product condition block has no <condition-group> elements');
  }
  const conditionGroups = rawGroups.map(cg => ({
    condition: extractConditionFromGroup(cg),
  }));
  return { conditionGroups };
}

/**
 * Extract a <qualifying-products> element or return null if not present.
 *
 * @param {object} rule - product-promotion-rule node
 * @returns {{ includedProducts, excludedProducts }|null}
 */
function extractQualifyingProducts(rule) {
  if (rule['qualifying-products'] === undefined) return null;

  const qp = rule['qualifying-products'];
  return {
    includedProducts: extractProductConditionBlock(qp['included-products']),
    excludedProducts: qp['excluded-products']
      ? extractProductConditionBlock(qp['excluded-products'])
      : null,
  };
}

/**
 * Extract a <discounted-products> element or return null if not present.
 *
 * @param {object} rule - product-promotion-rule node
 * @returns {{ includedProducts, excludedProducts }|null}
 */
function extractDiscountedProducts(rule) {
  if (rule['discounted-products'] === undefined) return null;

  const dp = rule['discounted-products'];
  return {
    includedProducts: extractProductConditionBlock(dp['included-products']),
    excludedProducts: dp['excluded-products']
      ? extractProductConditionBlock(dp['excluded-products'])
      : null,
  };
}

// ─── Discount family extraction ───────────────────────────────────────────────

/**
 * Classify the discount family of a product-promotion-rule.
 *
 * Returns 'simple' if <simple-discount> is present.
 * Returns 'product-amount' if <discounts condition-type="product-amount"> is present.
 * Throws if neither is detected.
 *
 * @param {object} rule
 * @returns {'simple'|'product-amount'}
 */
function classifyDiscountFamily(rule) {
  if (rule['simple-discount'] !== undefined) return 'simple';
  if (rule['discounts'] !== undefined) {
    const condType = rule['discounts']['@condition-type'];
    if (condType === 'product-amount') return 'product-amount';
    throw new Error(`Unsupported <discounts condition-type>: ${JSON.stringify(condType)}`);
  }
  throw new Error(
    'Cannot classify discount family: neither <simple-discount> nor <discounts> found in product-promotion-rule'
  );
}

/**
 * Extract frozen type and editable value for a 'simple' discount family.
 *
 * @param {object} rule
 * @returns {{ simpleDiscountType: 'percentage'|'amount', simpleDiscountValue: number }}
 */
function extractSimpleDiscountFields(rule) {
  const sd = rule['simple-discount'];

  if (sd['percentage'] !== undefined) {
    return {
      simpleDiscountType:  'percentage',
      simpleDiscountValue: parseFloat(sd['percentage']),
    };
  }
  if (sd['amount'] !== undefined) {
    return {
      simpleDiscountType:  'amount',
      simpleDiscountValue: parseFloat(sd['amount']),
    };
  }
  throw new Error(
    'Unrecognised <simple-discount> content: expected <percentage> or <amount>'
  );
}

/**
 * Extract frozen templates and editable values for a 'product-amount' discount family.
 *
 * Returns:
 *   discountEntryTemplates — frozen discount type per tier
 *   discountEntries        — editable threshold + value per tier
 *
 * @param {object} rule
 * @returns {{ discountEntryTemplates: Array, discountEntries: Array }}
 */
function extractProductAmountDiscountFields(rule) {
  const discountsNode = rule['discounts'];
  const rawDiscounts  = toArray(discountsNode['discount']);

  if (rawDiscounts.length === 0) {
    throw new Error('<discounts> block contains no <discount> elements');
  }

  const discountEntryTemplates = [];
  const discountEntries        = [];

  rawDiscounts.forEach((d, i) => {
    let discountType;
    let discountValue;

    if (d['percentage'] !== undefined) {
      discountType  = 'percentage';
      discountValue = parseFloat(d['percentage']);
    } else if (d['amount'] !== undefined) {
      discountType  = 'amount';
      discountValue = parseFloat(d['amount']);
    } else {
      throw new Error(
        `discounts[${i}]: expected <percentage> or <amount> inside <discount>`
      );
    }

    if (d['threshold'] === undefined) {
      throw new Error(`discounts[${i}]: missing <threshold>`);
    }

    discountEntryTemplates.push({ discountType });
    discountEntries.push({
      threshold:     parseFloat(d['threshold']),
      discountValue,
    });
  });

  return { discountEntryTemplates, discountEntries };
}

// ─── Custom-attribute extraction ──────────────────────────────────────────────

/**
 * Extract all <custom-attribute> elements and partition them into:
 *   frozenCustomAttributes   — boolean flags, numeric configs, structural attrs
 *   editableCustomAttributes — user-facing copy that changes every season
 *
 * Classification is determined solely by EDITABLE_CUSTOM_ATTR_IDS.
 * There is no heuristic inference — if an attributeId is not in the set, it is frozen.
 *
 * Two value types are recognised:
 *   'text'   — attribute has direct text content (#)
 *   'nested' — attribute contains a <value> child element
 *
 * @param {object} caContainerNode - <custom-attributes> node
 * @returns {{ frozenCustomAttributes: Array, editableCustomAttributes: Array }}
 */
function extractCustomAttributes(caContainerNode) {
  const rawAttrs = toArray(caContainerNode['custom-attribute']);

  const frozenCustomAttributes   = [];
  const editableCustomAttributes = [];

  rawAttrs.forEach(attr => {
    const attributeId = attr['@attribute-id'];
    const xmlLang     = attr['@xml:lang'] || null;

    // Determine value type and raw value
    let valueType;
    let value;

    if (attr['value'] !== undefined) {
      // Nested <value> element
      valueType = 'nested';
      value     = String(attr['value']);
    } else {
      // Direct text content
      valueType = 'text';
      value     = attr['#'] !== undefined ? String(attr['#']) : null;
    }

    const entry = { attributeId, xmlLang, valueType, value };

    if (EDITABLE_CUSTOM_ATTR_IDS.has(attributeId)) {
      editableCustomAttributes.push(entry);
    } else {
      frozenCustomAttributes.push(entry);
    }
  });

  return { frozenCustomAttributes, editableCustomAttributes };
}

// ─── Name extraction ──────────────────────────────────────────────────────────

/**
 * Extract <name xml:lang="..."> elements into an ordered names array.
 *
 * Returns:
 *   nameLocales — frozen list of xml:lang values, preserving source order
 *   names       — editable list of { xmlLang, value } objects
 *
 * @param {object|Array} nameNode - the 'name' value from a promotion node
 * @returns {{ nameLocales: string[], names: Array<{xmlLang, value}> }}
 */
function extractNames(nameNode) {
  const rawNames = toArray(nameNode);

  if (rawNames.length === 0) {
    throw new Error('Promotion has no <name> elements');
  }

  const nameLocales = [];
  const names       = [];

  rawNames.forEach(n => {
    const xmlLang = n['@xml:lang'];
    const value   = n['#'] !== undefined ? String(n['#']) : '';
    nameLocales.push(xmlLang);
    names.push({ xmlLang, value });
  });

  return { nameLocales, names };
}

// ─── Global-promotion-settings validation ─────────────────────────────────────

/**
 * Validate that the <global-promotion-settings> in the parsed document
 * exactly matches the canonical frozen fingerprint.
 *
 * Throws if:
 *   - The element is absent
 *   - The element's structure deviates in any way from the fingerprint
 *
 * @param {object} promotionsNode - the root <promotions> parsed object
 */
function validateGlobalPromotionSettings(promotionsNode) {
  const gps = promotionsNode['global-promotion-settings'];

  if (gps === undefined) {
    throw new Error(
      'EXTRACTION HALTED: <global-promotion-settings> is absent from the export. ' +
      'This element is required and must match the canonical structure exactly. ' +
      'Manual review required.'
    );
  }

  if (!deepEqual(gps, FROZEN_GLOBAL_SETTINGS_FINGERPRINT)) {
    throw new Error(
      'EXTRACTION HALTED: <global-promotion-settings> does not match the canonical ' +
      'frozen fingerprint. The structure has changed and requires manual review before ' +
      'a new blueprint can be extracted.\n' +
      'Expected: ' + JSON.stringify(FROZEN_GLOBAL_SETTINGS_FINGERPRINT, null, 2) + '\n' +
      'Received: ' + JSON.stringify(gps, null, 2)
    );
  }
}

// ─── Campaign extraction ──────────────────────────────────────────────────────

/**
 * Extract the <campaign> element into a campaignSlot.
 *
 * @param {object} campaignNode
 * @returns {{ frozenStructure, editableFields }}
 */
function extractCampaignSlot(campaignNode) {
  const campaignId    = campaignNode['@campaign-id'];
  const enabledFlag   = parseBoolNode(campaignNode['enabled-flag'], 'enabled-flag');
  const scope         = campaignNode['campaign-scope'];
  const applicableOnline = scope !== undefined && scope['applicable-online'] !== undefined;

  return {
    frozenStructure: {
      enabledFlag,
      campaignScope: { applicableOnline },
    },
    editableFields: {
      campaignId,
    },
  };
}

// ─── Promotion slot extraction ────────────────────────────────────────────────

/**
 * Extract a single <promotion> element into a promotion slot.
 *
 * @param {object} promoNode - xmlbuilder2 object for one <promotion>
 * @param {number} slotIndex - zero-based position in source order
 * @returns {{ slotIndex, frozenStructure, editableFields }}
 */
function extractPromotionSlot(promoNode, slotIndex) {
  const promotionId = promoNode['@promotion-id'];

  // ── Flags (all frozen) ───────────────────────────────────────────────────
  const enabledFlag                    = parseBoolNode(promoNode['enabled-flag'],                     'enabled-flag');
  const archivedFlag                   = parseBoolNode(promoNode['archived-flag'],                    'archived-flag');
  const searchableFlag                 = parseBoolNode(promoNode['searchable-flag'],                  'searchable-flag');
  const refinableFlag                  = parseBoolNode(promoNode['refinable-flag'],                   'refinable-flag');
  const preventRequalifyingFlag        = parseBoolNode(promoNode['prevent-requalifying-flag'],        'prevent-requalifying-flag');
  const prorateAcrossEligibleItemsFlag = parseBoolNode(promoNode['prorate-across-eligible-items-flag'], 'prorate-across-eligible-items-flag');

  // ── Exclusivity (frozen) ─────────────────────────────────────────────────
  const exclusivity = promoNode['exclusivity'];
  if (!exclusivity) {
    throw new Error(`Promotion "${promotionId}": missing <exclusivity>`);
  }

  // ── Names ────────────────────────────────────────────────────────────────
  const { nameLocales, names } = extractNames(promoNode['name']);

  // ── Custom attributes ────────────────────────────────────────────────────
  const { frozenCustomAttributes, editableCustomAttributes } =
    promoNode['custom-attributes']
      ? extractCustomAttributes(promoNode['custom-attributes'])
      : { frozenCustomAttributes: [], editableCustomAttributes: [] };

  // ── Product-promotion-rule ───────────────────────────────────────────────
  const rule = promoNode['product-promotion-rule'];
  if (!rule) {
    throw new Error(
      `Promotion "${promotionId}": only product-promotion-rule is supported in SAS blueprints. ` +
      'order-promotion-rule and shipping-promotion-rule are out of scope.'
    );
  }

  // ── Discount family ──────────────────────────────────────────────────────
  const discountFamily = classifyDiscountFamily(rule);

  let simpleDiscountType  = null;
  let simpleDiscountValue = null;
  let discountEntryTemplates = null;
  let discountEntries        = null;

  if (discountFamily === 'simple') {
    const extracted = extractSimpleDiscountFields(rule);
    simpleDiscountType  = extracted.simpleDiscountType;
    simpleDiscountValue = extracted.simpleDiscountValue;
  } else {
    const extracted = extractProductAmountDiscountFields(rule);
    discountEntryTemplates = extracted.discountEntryTemplates;
    discountEntries        = extracted.discountEntries;
  }

  // ── Qualifying and discounted products ───────────────────────────────────
  const qualifyingProducts  = extractQualifyingProducts(rule);
  const discountedProducts  = extractDiscountedProducts(rule);

  // ── Optional frozen rule fields ──────────────────────────────────────────
  const disableGlobalExcludedProducts =
    rule['disable-global-excluded-products'] === 'true' ? true : null;

  const maxApplications =
    rule['max-applications'] !== undefined
      ? parseInt(rule['max-applications'], 10)
      : null;

  // ── Assemble slot ────────────────────────────────────────────────────────
  return {
    slotIndex,
    frozenStructure: {
      enabledFlag,
      archivedFlag,
      searchableFlag,
      refinableFlag,
      preventRequalifyingFlag,
      prorateAcrossEligibleItemsFlag,
      exclusivity,
      nameLocales,
      discountFamily,
      simpleDiscountType,
      discountEntryTemplates,
      qualifyingProducts,
      discountedProducts,
      disableGlobalExcludedProducts,
      maxApplications,
      frozenCustomAttributes,
    },
    editableFields: {
      promotionId,
      names,
      simpleDiscountValue,
      discountEntries,
      editableCustomAttributes,
    },
  };
}

// ─── Assignment slot extraction ───────────────────────────────────────────────

/**
 * Extract a single <promotion-campaign-assignment> element into an assignment slot.
 *
 * @param {object} assignNode - xmlbuilder2 object for one assignment
 * @param {number} slotIndex - zero-based position in source order
 * @returns {{ slotIndex, frozenStructure, editableFields }}
 */
function extractAssignmentSlot(assignNode, slotIndex) {
  const promotionId = assignNode['@promotion-id'];
  const campaignId  = assignNode['@campaign-id'];

  // ── Qualifiers (frozen structure) ────────────────────────────────────────
  const qual = assignNode['qualifiers'];
  if (!qual) {
    throw new Error(`Assignment for "${promotionId}": missing <qualifiers>`);
  }

  const qualifiers = {
    matchMode:         qual['@match-mode'],
    hasCustomerGroups: qual['customer-groups'] !== undefined,
    hasSourceCodes:    qual['source-codes']    !== undefined,
    hasCoupons:        qual['coupons']         !== undefined,
  };

  // ── Customer groups outside qualifiers (frozen: matchMode + groupIds) ────
  let customerGroups = null;
  if (assignNode['customer-groups'] !== undefined) {
    const cg = assignNode['customer-groups'];
    const rawGroups = toArray(cg['customer-group']);
    customerGroups = {
      matchMode: cg['@match-mode'],
      groupIds:  rawGroups.map(g => g['@group-id']),
    };
  }

  // ── Rank (frozen) ────────────────────────────────────────────────────────
  const rank = parseInt(assignNode['rank'], 10);

  // ── Coupons (editable: the coupon IDs) ───────────────────────────────────
  let couponIds = null;
  if (assignNode['coupons'] !== undefined) {
    const couponsNode = assignNode['coupons'];
    const rawCoupons  = toArray(couponsNode['coupon']);
    couponIds = rawCoupons.map(c => c['@coupon-id']);
  }

  // ── Schedule (frozen: presence flags; editable: date values) ─────────────
  const schedule    = assignNode['schedule'] || {};
  const hasStartDate = schedule['start-date'] !== undefined;
  const hasEndDate   = schedule['end-date']   !== undefined;
  const startDate    = hasStartDate ? schedule['start-date'] : null;
  const endDate      = hasEndDate   ? schedule['end-date']   : null;

  return {
    slotIndex,
    frozenStructure: {
      qualifiers,
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

// ─── Main extractor ───────────────────────────────────────────────────────────

/**
 * Deterministically extract a canonical SAS Blueprint record from a real
 * SFCC promotion XML export.
 *
 * Extraction is strictly mechanical:
 *   - If a node exists in the XML → it is captured.
 *   - If a node is absent         → its blueprint field is null / absent.
 *   - No defaults are added.
 *   - No structures are normalised or repaired.
 *   - Source order is always preserved.
 *
 * Throws if:
 *   - The XML cannot be parsed
 *   - <global-promotion-settings> is absent or does not match the frozen fingerprint
 *   - Any required structural element is missing (promotionId, flags, rule, etc.)
 *   - An unsupported discount family is encountered
 *   - An unrecognised condition type is encountered
 *
 * @param {string} xmlString - Raw XML content of the SFCC promotion export
 * @param {object} [options]
 * @param {string} [options.blueprintId]   - e.g. 'SAS-2025'
 * @param {string} [options.sourceExport]  - e.g. 'Summer_SAS.xml'
 * @param {string} [options.extractedAt]   - ISO-8601 override (defaults to now)
 * @returns {object} Canonical SAS blueprint record
 */
function extractSASBlueprint(xmlString, options = {}) {
  if (typeof xmlString !== 'string' || xmlString.trim() === '') {
    throw new Error('xmlString must be a non-empty string');
  }

  // ── Parse ────────────────────────────────────────────────────────────────
  let parsed;
  try {
    parsed = convert(xmlString, { format: 'object' });
  } catch (err) {
    throw new Error(`XML parse failure: ${err.message}`);
  }

  const promotionsNode = parsed['promotions'];
  if (!promotionsNode) {
    throw new Error('Root <promotions> element not found');
  }

  // ── Validate namespace ───────────────────────────────────────────────────
  const ns = promotionsNode['@xmlns'];
  if (ns && ns !== SFCC_NS) {
    throw new Error(
      `Unexpected XML namespace: ${JSON.stringify(ns)}. ` +
      `Expected: ${JSON.stringify(SFCC_NS)}`
    );
  }

  // ── Validate global-promotion-settings ───────────────────────────────────
  validateGlobalPromotionSettings(promotionsNode);

  // ── Extract campaign ─────────────────────────────────────────────────────
  const campaignNode = promotionsNode['campaign'];
  if (!campaignNode) {
    throw new Error('<campaign> element not found');
  }
  const campaignSlot = extractCampaignSlot(campaignNode);

  // ── Extract promotions (preserving source order) ─────────────────────────
  const rawPromotions = toArray(promotionsNode['promotion']);
  if (rawPromotions.length === 0) {
    throw new Error('No <promotion> elements found');
  }
  const promotionSlots = rawPromotions.map(
    (promo, i) => extractPromotionSlot(promo, i)
  );

  // ── Extract assignments (preserving source order) ─────────────────────────
  const rawAssignments = toArray(promotionsNode['promotion-campaign-assignment']);
  if (rawAssignments.length === 0) {
    throw new Error('No <promotion-campaign-assignment> elements found');
  }
  const assignmentSlots = rawAssignments.map(
    (assign, i) => extractAssignmentSlot(assign, i)
  );

  // ── Assemble blueprint record ─────────────────────────────────────────────
  return {
    blueprintId:  options.blueprintId  || `SAS-extracted-${Date.now()}`,
    sourceExport: options.sourceExport || 'unknown',
    extractedAt:  options.extractedAt  || new Date().toISOString(),
    campaignSlot,
    promotionSlots,
    assignmentSlots,
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  extractSASBlueprint,
  // Named exports for unit testing of internal helpers
  _internals: {
    toArray,
    parseBoolNode,
    deepEqual,
    extractConditionFromGroup,
    extractProductConditionBlock,
    extractQualifyingProducts,
    extractDiscountedProducts,
    classifyDiscountFamily,
    extractSimpleDiscountFields,
    extractProductAmountDiscountFields,
    extractCustomAttributes,
    extractNames,
    validateGlobalPromotionSettings,
    extractCampaignSlot,
    extractPromotionSlot,
    extractAssignmentSlot,
    FROZEN_GLOBAL_SETTINGS_FINGERPRINT,
    EDITABLE_CUSTOM_ATTR_IDS,
  },
};
