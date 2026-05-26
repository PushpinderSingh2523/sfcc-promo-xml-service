'use strict';

// ─── Canonical Group Ordering ─────────────────────────────────────────────────

/**
 * Canonical group ordering for clarification question generation.
 *
 * This ordering defines the sequence in which question groups are surfaced to
 * a business user.  Campaign identity questions come first so that every
 * downstream field reference (promotionId → campaignId, etc.) is established
 * before discount or messaging details are requested.
 *
 * Index 0 = first group presented.
 *
 * @type {string[]}
 */
const GROUP_ORDER = [
  'Campaign',
  'Identity',
  'Scheduling',
  'Discounting',
  'Coupons',
  'Eligibility',
  'Categories',
  'Merchandising',
  'Storefront',
  'Messaging',
  'Operational',
  'Localization',
];

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * The SAS Editable Field Registry.
 *
 * This is the canonical source of truth for every business-relevant field in a
 * SAS blueprint record.  It covers BOTH editable fields (season-over-season
 * changes required) and non-editable frozen fields that are replay-critical
 * (frozen values whose unexpected mutation would break replay parity or require
 * escalated architectural review).
 *
 * Each entry shape:
 *
 *   fieldId        {string}  — Unique field identifier.  For custom attributes,
 *                              matches the SFCC attribute-id exactly.
 *                              For slot fields, matches the blueprint key name.
 *
 *   editable       {boolean} — true  = this field must be clarified every season.
 *                              false = frozen; tracked for replay-critical awareness
 *                              only; not surfaced as a clarification question.
 *
 *   required       {boolean} — When editable, true means absence is a hard error.
 *
 *   group          {string}  — One of the GROUP_ORDER values.
 *
 *   type           {string}  — Data type: string | number | boolean | iso8601 |
 *                              enum | stringArray | discountEntryArray
 *
 *   label          {string}  — Human-readable display label for UI / logs.
 *
 *   description    {string}  — Detailed description of field purpose and rules.
 *
 *   question       {string|null} — Deterministic clarification question text.
 *                              null for non-editable fields.
 *
 *   validation     {object|null} — Declarative validation rules.  See
 *                              buildValidationMetadata for shape.
 *
 *   multiValue     {boolean} — true if the field holds an ordered array.
 *
 *   localized      {boolean} — true if the field carries an xml:lang attribute.
 *
 *   rendererOwner  {string}  — Which renderer module writes this field to XML.
 *
 *   replayCritical {boolean} — true if changing this field would break replay
 *                              parity or require escalated architectural review.
 *
 * @type {object[]}
 */
const REGISTRY = [

  // ── Campaign ────────────────────────────────────────────────────────────────

  {
    fieldId:        'campaignId',
    editable:       true,
    required:       true,
    group:          'Campaign',
    type:           'string',
    label:          'Campaign ID',
    description:    'Unique identifier for the SAS campaign. Written as the campaign-id attribute on the <campaign> element and referenced by every <promotion-campaign-assignment>. Must be unique across all active SFCC campaigns.',
    question:       'What is the campaign ID for this season? (e.g. "2026_SUMMER_SAS")',
    validation:     { minLength: 1, maxLength: 256, pattern: '^[A-Za-z0-9_\\-]+$' },
    multiValue:     false,
    localized:      false,
    rendererOwner:  'renderCampaign',
    replayCritical: true,
  },

  // ── Identity ──────────────────────────────────────────────────────────────────

  {
    fieldId:        'promotionId',
    editable:       true,
    required:       true,
    group:          'Identity',
    type:           'string',
    label:          'Promotion ID',
    description:    'Unique identifier for the promotion. Written as the promotion-id attribute on the <promotion> element and on all <promotion-campaign-assignment> elements that reference it. Must be unique across all active SFCC promotions.',
    question:       'What is the promotion ID for this season?',
    validation:     { minLength: 1, maxLength: 256, pattern: '^[A-Za-z0-9_\\-]+$' },
    multiValue:     false,
    localized:      false,
    rendererOwner:  'renderBlueprintPromotion',
    replayCritical: true,
  },

  {
    fieldId:        'name',
    editable:       true,
    required:       true,
    group:          'Identity',
    type:           'string',
    label:          'Promotion Display Name',
    description:    'Human-readable promotion name rendered as one or more <name xml:lang="..."> elements. Displayed in SFCC Business Manager and consumed by some storefront integrations.',
    question:       'What is the display name for this promotion? (e.g. "Extra 25% Off")',
    validation:     { minLength: 1, maxLength: 4000 },
    multiValue:     false,
    localized:      true,
    rendererOwner:  'renderBlueprintPromotion',
    replayCritical: false,
  },

  // ── Scheduling ───────────────────────────────────────────────────────────────

  {
    fieldId:        'startDate',
    editable:       true,
    required:       false,
    group:          'Scheduling',
    type:           'iso8601',
    label:          'Promotion Start Date',
    description:    'ISO-8601 timestamp when the promotion becomes active. Rendered inside <schedule><start-date>. Only present when frozenStructure.hasStartDate is true.',
    question:       'What is the start date and time for this promotion? (ISO-8601, e.g. "2026-06-15T04:00:00.000Z")',
    validation:     { format: 'iso8601', required: false },
    multiValue:     false,
    localized:      false,
    rendererOwner:  'renderPromotionAssignment',
    replayCritical: false,
  },

  {
    fieldId:        'endDate',
    editable:       true,
    required:       false,
    group:          'Scheduling',
    type:           'iso8601',
    label:          'Promotion End Date',
    description:    'ISO-8601 timestamp when the promotion deactivates. Rendered inside <schedule><end-date>. Only present when frozenStructure.hasEndDate is true.',
    question:       'What is the end date and time for this promotion? (ISO-8601, e.g. "2026-07-15T04:00:00.000Z")',
    validation:     { format: 'iso8601', required: false },
    multiValue:     false,
    localized:      false,
    rendererOwner:  'renderPromotionAssignment',
    replayCritical: false,
  },

  // ── Discounting ──────────────────────────────────────────────────────────────

  {
    fieldId:        'simpleDiscountValue',
    editable:       true,
    required:       false,
    group:          'Discounting',
    type:           'number',
    label:          'Simple Discount Value',
    description:    'The percentage or fixed-amount discount applied to qualifying items. Used only when discountFamily is "simple". Rendered as <simple-discount><percentage> or <simple-discount><amount>.',
    question:       'What is the discount value for this promotion? (e.g. 25 for 25% off, or 50 for $50 off)',
    validation:     { type: 'number', min: 0.01, max: 999999 },
    multiValue:     false,
    localized:      false,
    rendererOwner:  'renderBlueprintPromotion',
    replayCritical: false,
  },

  {
    fieldId:        'discountEntries',
    editable:       true,
    required:       false,
    group:          'Discounting',
    type:           'discountEntryArray',
    label:          'Tiered Discount Entries',
    description:    'Ordered list of spend threshold + discount value pairs for product-amount discount promotions. Each tier pairs a minimum spend threshold with a discount value (percentage or fixed amount). Rendered as <discounts condition-type="product-amount"><discount><threshold>...</threshold>...',
    question:       'What are the spend threshold and discount value pairs for each tier? (e.g. spend $250 → $50 off)',
    validation:     { type: 'array', minItems: 1, items: { threshold: { type: 'number', min: 0.01 }, discountValue: { type: 'number', min: 0.01 } } },
    multiValue:     true,
    localized:      false,
    rendererOwner:  'renderBlueprintPromotion',
    replayCritical: false,
  },

  {
    fieldId:        'thresholdPercentage',
    editable:       false,
    required:       false,
    group:          'Discounting',
    type:           'number',
    label:          'Threshold Percentage (Custom Attribute)',
    description:    'Frozen nested custom attribute (<custom-attribute attribute-id="thresholdPercentage"><value>N</value>) carrying the qualifying threshold percentage configuration for WebApp promotions. Value is structural — not clarified season-over-season.',
    question:       null,
    validation:     null,
    multiValue:     false,
    localized:      false,
    rendererOwner:  'renderBlueprintPromotion',
    replayCritical: true,
  },

  {
    fieldId:        'thresholdValues',
    editable:       false,
    required:       false,
    group:          'Discounting',
    type:           'number',
    label:          'Threshold Values (Custom Attribute)',
    description:    'Frozen nested custom attribute (<custom-attribute attribute-id="thresholdValues"><value>N</value>) carrying the minimum qualifying spend configuration for WebApp promotions. Value is structural — not clarified season-over-season.',
    question:       null,
    validation:     null,
    multiValue:     false,
    localized:      false,
    rendererOwner:  'renderBlueprintPromotion',
    replayCritical: true,
  },

  // ── Coupons ──────────────────────────────────────────────────────────────────

  {
    fieldId:        'couponIds',
    editable:       true,
    required:       false,
    group:          'Coupons',
    type:           'stringArray',
    label:          'Coupon Code IDs',
    description:    'Ordered list of coupon code identifiers attached to this promotion assignment. Each entry is rendered as <coupon coupon-id="..."/> inside the outer <coupons> block of a <promotion-campaign-assignment>.',
    question:       'What are the coupon code IDs for this promotion? (e.g. "2026_Summer_SAS_Code")',
    validation:     { type: 'array', minItems: 1, items: { type: 'string', minLength: 1, maxLength: 256 } },
    multiValue:     true,
    localized:      false,
    rendererOwner:  'renderPromotionAssignment',
    replayCritical: false,
  },

  // ── Eligibility ──────────────────────────────────────────────────────────────

  {
    fieldId:        'qualifiersMatchMode',
    editable:       false,
    required:       true,
    group:          'Eligibility',
    type:           'enum',
    label:          'Qualifiers Match Mode',
    description:    'Frozen value controlling whether ALL qualifier conditions must be met ("all") or ANY single condition is sufficient ("any") for the assignment to be active. Changing this fundamentally alters who qualifies — requires architectural review.',
    question:       null,
    validation:     { enum: ['any', 'all'] },
    multiValue:     false,
    localized:      false,
    rendererOwner:  'renderPromotionAssignment',
    replayCritical: true,
  },

  {
    fieldId:        'hasCustomerGroups',
    editable:       false,
    required:       false,
    group:          'Eligibility',
    type:           'boolean',
    label:          'Qualifiers: Customer Groups Presence Flag',
    description:    'Frozen flag indicating whether <customer-groups/> appears inside <qualifiers>. Determines if customer group qualifier logic is structurally present in the assignment.',
    question:       null,
    validation:     null,
    multiValue:     false,
    localized:      false,
    rendererOwner:  'renderPromotionAssignment',
    replayCritical: true,
  },

  {
    fieldId:        'hasSourceCodes',
    editable:       false,
    required:       false,
    group:          'Eligibility',
    type:           'boolean',
    label:          'Qualifiers: Source Codes Presence Flag',
    description:    'Frozen flag indicating whether <source-codes/> appears inside <qualifiers>. Determines if source code qualifier logic is structurally present in the assignment.',
    question:       null,
    validation:     null,
    multiValue:     false,
    localized:      false,
    rendererOwner:  'renderPromotionAssignment',
    replayCritical: true,
  },

  {
    fieldId:        'hasCoupons',
    editable:       false,
    required:       false,
    group:          'Eligibility',
    type:           'boolean',
    label:          'Qualifiers: Coupons Presence Flag',
    description:    'Frozen flag indicating whether <coupons/> appears inside <qualifiers>. Determines if coupon qualifier logic is structurally present in the assignment.',
    question:       null,
    validation:     null,
    multiValue:     false,
    localized:      false,
    rendererOwner:  'renderPromotionAssignment',
    replayCritical: true,
  },

  {
    fieldId:        'customerGroupIds',
    editable:       false,
    required:       false,
    group:          'Eligibility',
    type:           'stringArray',
    label:          'Customer Group IDs',
    description:    'Frozen list of customer group identifiers that must be present on a customer session for the outer customer-groups block to match. Rendered as <customer-group group-id="..."/> elements.',
    question:       null,
    validation:     null,
    multiValue:     true,
    localized:      false,
    rendererOwner:  'renderPromotionAssignment',
    replayCritical: true,
  },

  // ── Categories ───────────────────────────────────────────────────────────────

  {
    fieldId:        'includedCategoryIds',
    editable:       false,
    required:       false,
    group:          'Categories',
    type:           'stringArray',
    label:          'Included Category IDs',
    description:    'Frozen list of SFCC catalog category IDs (siteCatalog_ToryUS) whose products are eligible for the promotion. Captured from <included-products> condition groups inside qualifying-products or discounted-products.',
    question:       null,
    validation:     null,
    multiValue:     true,
    localized:      false,
    rendererOwner:  'renderBlueprintPromotion',
    replayCritical: true,
  },

  {
    fieldId:        'excludedCategoryIds',
    editable:       false,
    required:       false,
    group:          'Categories',
    type:           'stringArray',
    label:          'Excluded Category IDs',
    description:    'Frozen list of SFCC catalog category IDs (siteCatalog_ToryUS) whose products are excluded from the promotion. Captured from <excluded-products> condition groups.',
    question:       null,
    validation:     null,
    multiValue:     true,
    localized:      false,
    rendererOwner:  'renderBlueprintPromotion',
    replayCritical: true,
  },

  // ── Merchandising ─────────────────────────────────────────────────────────────

  {
    fieldId:        'includedBadge',
    editable:       true,
    required:       false,
    group:          'Merchandising',
    type:           'string',
    label:          'Included Badge (PLP)',
    description:    'Storefront badge copy shown on product listing pages (PLP) for products included in the promotion. Supports {price} token substitution. Written as <custom-attribute attribute-id="includedBadge" xml:lang="...">.',
    question:       'What badge text should appear on product listing pages for included products? (e.g. "{price} after extra 25% off")',
    validation:     { minLength: 1, maxLength: 4000 },
    multiValue:     false,
    localized:      true,
    rendererOwner:  'renderBlueprintPromotion',
    replayCritical: false,
  },

  {
    fieldId:        'includedBadgeSPP',
    editable:       true,
    required:       false,
    group:          'Merchandising',
    type:           'string',
    label:          'Included Badge (SPP)',
    description:    'Storefront badge copy shown on single product pages (SPP) for products included in the promotion. Supports {price} token substitution. Written as <custom-attribute attribute-id="includedBadgeSPP" xml:lang="...">.',
    question:       'What badge text should appear on single product pages for included products? (e.g. "{price} after extra 25% off")',
    validation:     { minLength: 1, maxLength: 4000 },
    multiValue:     false,
    localized:      true,
    rendererOwner:  'renderBlueprintPromotion',
    replayCritical: false,
  },

  // ── Storefront ───────────────────────────────────────────────────────────────

  {
    fieldId:        'storefront_msg_cart_inclusion',
    editable:       true,
    required:       false,
    group:          'Storefront',
    type:           'string',
    label:          'Cart Inclusion Message',
    description:    'Copy displayed in the shopping cart when the promotion discount has been successfully applied to qualifying items. Written as <custom-attribute attribute-id="storefront_msg_cart_inclusion" xml:lang="...">.',
    question:       'What message should be shown in the cart when the promotion is applied? (e.g. "Extra 25% Off Discount Applied")',
    validation:     { minLength: 1, maxLength: 4000 },
    multiValue:     false,
    localized:      true,
    rendererOwner:  'renderBlueprintPromotion',
    replayCritical: false,
  },

  {
    fieldId:        'storefront_msg_cart_exclusion',
    editable:       true,
    required:       false,
    group:          'Storefront',
    type:           'string',
    label:          'Cart Exclusion Message',
    description:    'Copy displayed in the shopping cart when a line item is excluded from the promotion. Written as <custom-attribute attribute-id="storefront_msg_cart_exclusion" xml:lang="...">.',
    question:       'What message should be shown for excluded items in the cart? (e.g. "Excluded from Semi-Annual Sale")',
    validation:     { minLength: 1, maxLength: 4000 },
    multiValue:     false,
    localized:      true,
    rendererOwner:  'renderBlueprintPromotion',
    replayCritical: false,
  },

  // ── Messaging ────────────────────────────────────────────────────────────────

  {
    fieldId:        'couponErrorMsgNoActivePromotion',
    editable:       true,
    required:       false,
    group:          'Messaging',
    type:           'string',
    label:          'Coupon Error: No Active Promotion',
    description:    'Error message displayed when a customer applies a coupon code that maps to a promotion that is currently inactive or expired. Written as <custom-attribute attribute-id="couponErrorMsgNoActivePromotion" xml:lang="...">.',
    question:       'What error message should appear when the coupon code is applied but the promotion is not active? (e.g. "This promo code has expired")',
    validation:     { minLength: 1, maxLength: 4000 },
    multiValue:     false,
    localized:      true,
    rendererOwner:  'renderBlueprintPromotion',
    replayCritical: false,
  },

  {
    fieldId:        'couponErrorMsgRedemptionLimitExeeded',
    editable:       true,
    required:       false,
    group:          'Messaging',
    type:           'string',
    label:          'Coupon Error: Redemption Limit Exceeded',
    description:    'Error message displayed when the coupon code has already been redeemed the maximum allowed number of times. NOTE: The attribute-id contains a deliberate typo ("Exeeded") that matches the SFCC platform field name — do not correct. Written as <custom-attribute attribute-id="couponErrorMsgRedemptionLimitExeeded" xml:lang="...">.',
    question:       'What error message should appear when the coupon code has already been used? (e.g. "This promo code has already been used")',
    validation:     { minLength: 1, maxLength: 4000 },
    multiValue:     false,
    localized:      true,
    rendererOwner:  'renderBlueprintPromotion',
    replayCritical: false,
  },

  {
    fieldId:        'couponErrorMsgNoApplicablePromotion',
    editable:       true,
    required:       false,
    group:          'Messaging',
    type:           'string',
    label:          'Coupon Error: No Applicable Promotion',
    description:    'Error message displayed when the coupon code is valid but the current cart contents do not satisfy the promotion conditions (e.g. minimum spend threshold not met). Written as <custom-attribute attribute-id="couponErrorMsgNoApplicablePromotion" xml:lang="...">.',
    question:       'What error message should appear when the cart does not qualify for the promotion? (e.g. "Promotion requires minimum spend of $250 on included products.")',
    validation:     { minLength: 1, maxLength: 4000 },
    multiValue:     false,
    localized:      true,
    rendererOwner:  'renderBlueprintPromotion',
    replayCritical: false,
  },

  {
    fieldId:        'couponErrorMsgNoApplicablePromo',
    editable:       true,
    required:       false,
    group:          'Messaging',
    type:           'string',
    label:          'Coupon Error: No Applicable Promo (Alias)',
    description:    'Alternate attribute-id for the "no applicable promotion" coupon error message used in some SFCC org configurations. Present in certain SAS exports alongside or instead of couponErrorMsgNoApplicablePromotion. Written as <custom-attribute attribute-id="couponErrorMsgNoApplicablePromo" xml:lang="...">.',
    question:       'What error message should appear when no applicable promotion is found? (alias attribute field)',
    validation:     { minLength: 1, maxLength: 4000 },
    multiValue:     false,
    localized:      true,
    rendererOwner:  'renderBlueprintPromotion',
    replayCritical: false,
  },

  // ── Operational ──────────────────────────────────────────────────────────────

  {
    fieldId:        'rank',
    editable:       false,
    required:       true,
    group:          'Operational',
    type:           'number',
    label:          'Assignment Rank',
    description:    'Frozen integer controlling SFCC promotion stack evaluation order. Lower values are evaluated first. Affects which promotion wins when multiple promotions compete for the same qualifying items. Rendered as <rank> in each assignment.',
    question:       null,
    validation:     { type: 'integer', min: 0 },
    multiValue:     false,
    localized:      false,
    rendererOwner:  'renderPromotionAssignment',
    replayCritical: true,
  },

  {
    fieldId:        'exclusivity',
    editable:       false,
    required:       true,
    group:          'Operational',
    type:           'enum',
    label:          'Promotion Exclusivity',
    description:    'Frozen flag controlling whether this promotion can be stacked with other active promotions. "class" = exclusive within its exclusivity class; "no-exclusivity" = fully stackable; "global" = globally exclusive. Changing this requires promotion architecture review.',
    question:       null,
    validation:     { enum: ['no-exclusivity', 'class', 'global'] },
    multiValue:     false,
    localized:      false,
    rendererOwner:  'renderBlueprintPromotion',
    replayCritical: true,
  },

  {
    fieldId:        'maxApplications',
    editable:       false,
    required:       false,
    group:          'Operational',
    type:           'number',
    label:          'Max Applications Per Order',
    description:    'Frozen integer limiting how many times the promotion can be applied within a single order. Present only in product-amount promotions with per-order application limits. Rendered as <max-applications>.',
    question:       null,
    validation:     { type: 'integer', min: 1 },
    multiValue:     false,
    localized:      false,
    rendererOwner:  'renderBlueprintPromotion',
    replayCritical: true,
  },

  {
    fieldId:        'disableGlobalExcludedProducts',
    editable:       false,
    required:       false,
    group:          'Operational',
    type:           'boolean',
    label:          'Disable Global Excluded Products',
    description:    'Frozen flag that, when true, causes the promotion to bypass the global product exclusion rules defined in <global-promotion-settings>. Only present in promotions that explicitly override global exclusions (e.g. bounceback promotions). Rendered as <disable-global-excluded-products>true</disable-global-excluded-products>.',
    question:       null,
    validation:     null,
    multiValue:     false,
    localized:      false,
    rendererOwner:  'renderBlueprintPromotion',
    replayCritical: true,
  },

  // ── Localization ──────────────────────────────────────────────────────────────

  {
    fieldId:        'nameLocales',
    editable:       false,
    required:       true,
    group:          'Localization',
    type:           'stringArray',
    label:          'Name Locale Variants',
    description:    'Frozen ordered list of xml:lang values for which <name> elements must be provided. Defines the expected locale set for all localized editable fields (name, storefront messages, badges, coupon error messages). Source order is preserved.',
    question:       null,
    validation:     { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
    multiValue:     true,
    localized:      false,
    rendererOwner:  'renderBlueprintPromotion',
    replayCritical: false,
  },

];

// ─── Registry Index ───────────────────────────────────────────────────────────

/**
 * Registry entries indexed by fieldId for O(1) lookup.
 * Built once at module load time.
 *
 * @type {Map<string, object>}
 */
const REGISTRY_MAP = new Map(REGISTRY.map(entry => [entry.fieldId, entry]));

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Retrieve a single registry entry by fieldId.
 *
 * @param {string} fieldId
 * @returns {object|undefined}
 */
function getField(fieldId) {
  return REGISTRY_MAP.get(fieldId);
}

/**
 * Retrieve all registry entries belonging to a specific group.
 *
 * @param {string} groupName - One of the GROUP_ORDER values
 * @returns {object[]}
 */
function getGroup(groupName) {
  return REGISTRY.filter(entry => entry.group === groupName);
}

/**
 * Retrieve all registry entries where editable is true.
 *
 * @returns {object[]}
 */
function getEditableFields() {
  return REGISTRY.filter(entry => entry.editable === true);
}

/**
 * Retrieve all registry entries where replayCritical is true.
 *
 * @returns {object[]}
 */
function getReplayCriticalFields() {
  return REGISTRY.filter(entry => entry.replayCritical === true);
}

/**
 * Retrieve all fieldIds present in the registry.
 *
 * @returns {string[]}
 */
function getAllFieldIds() {
  return REGISTRY.map(entry => entry.fieldId);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  REGISTRY,
  REGISTRY_MAP,
  GROUP_ORDER,
  getField,
  getGroup,
  getEditableFields,
  getReplayCriticalFields,
  getAllFieldIds,
};
