'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATALOG_ID = 'siteCatalog_ToryUS';

// ─── XML escaping ─────────────────────────────────────────────────────────────

function escapeXml(value) {
  return String(value)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;');
}

// ─── Number formatting ────────────────────────────────────────────────────────

/**
 * Format a numeric value to match SFCC BM export conventions.
 *
 * SFCC always outputs at least one decimal place:
 *   25   → "25.0"
 *   250  → "250.0"
 *   0.01 → "0.01"  (already has decimals)
 *
 * @param {number} n
 * @returns {string}
 */
function formatNumber(n) {
  const s = String(n);
  return s.includes('.') ? s : s + '.0';
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validate(promotionSlot) {
  if (!promotionSlot || typeof promotionSlot !== 'object') {
    throw new Error('promotionSlot must be a non-null object');
  }

  const fs = promotionSlot.frozenStructure;
  const ef = promotionSlot.editableFields;

  if (!fs || typeof fs !== 'object') {
    throw new Error('promotionSlot.frozenStructure is required');
  }
  if (!ef || typeof ef !== 'object') {
    throw new Error('promotionSlot.editableFields is required');
  }
  if (!ef.promotionId || typeof ef.promotionId !== 'string') {
    throw new Error('promotionSlot.editableFields.promotionId must be a non-empty string');
  }
  if (!Array.isArray(ef.names) || ef.names.length === 0) {
    throw new Error('promotionSlot.editableFields.names must be a non-empty array');
  }
  if (!fs.discountFamily || !['simple', 'product-amount'].includes(fs.discountFamily)) {
    throw new Error('promotionSlot.frozenStructure.discountFamily must be "simple" or "product-amount"');
  }
  if (fs.discountFamily === 'simple' && ef.simpleDiscountValue === null) {
    throw new Error('simpleDiscountValue is required when discountFamily is "simple"');
  }
  if (fs.discountFamily === 'product-amount' &&
      (!Array.isArray(ef.discountEntries) || ef.discountEntries.length === 0)) {
    throw new Error('discountEntries must be a non-empty array when discountFamily is "product-amount"');
  }
}

// ─── Condition rendering ──────────────────────────────────────────────────────

/**
 * Render a single condition (category or price) inside a condition-group.
 *
 * @param {object} condition - from productConditionBlock.conditionGroups[i].condition
 * @param {string} baseIndent - spaces for the opening tag
 * @returns {string[]} lines
 */
function renderCondition(condition, baseIndent) {
  const lines = [];
  const inner = baseIndent + '    ';

  if (condition.type === 'category') {
    const catalogId = condition.catalogId || CATALOG_ID;
    lines.push(
      `${baseIndent}<category-condition catalog-id="${escapeXml(catalogId)}" operator="${escapeXml(condition.operator)}">`
    );
    condition.categoryIds.forEach(id => {
      lines.push(`${inner}<category-id>${escapeXml(id)}</category-id>`);
    });
    lines.push(`${baseIndent}</category-condition>`);
  } else {
    // price
    lines.push(`${baseIndent}<price-condition operator="${escapeXml(condition.operator)}">`);
    lines.push(`${inner}<price>${formatNumber(condition.price)}</price>`);
    lines.push(`${baseIndent}</price-condition>`);
  }

  return lines;
}

/**
 * Render a products block (<included-products> or <excluded-products>)
 * with its wrapping tag.
 *
 * @param {object} block     - ProductConditionBlock
 * @param {string} tagName   - 'included-products' or 'excluded-products'
 * @param {string} baseIndent - spaces for the wrapping tag
 * @returns {string[]} lines
 */
function renderProductConditionBlock(block, tagName, baseIndent) {
  const lines = [];
  const cgIndent   = baseIndent + '    ';
  const condIndent = cgIndent   + '    ';

  lines.push(`${baseIndent}<${tagName}>`);

  block.conditionGroups.forEach(cg => {
    lines.push(`${cgIndent}<condition-group>`);
    const condLines = renderCondition(cg.condition, condIndent);
    condLines.forEach(l => lines.push(l));
    lines.push(`${cgIndent}</condition-group>`);
  });

  lines.push(`${baseIndent}</${tagName}>`);
  return lines;
}

/**
 * Render a qualifying-products or discounted-products wrapper element.
 *
 * @param {object} productsBlock - { includedProducts, excludedProducts }
 * @param {string} wrapperTag    - 'qualifying-products' or 'discounted-products'
 * @param {string} baseIndent    - spaces for the wrapper tag
 * @returns {string[]} lines
 */
function renderProductsWrapper(productsBlock, wrapperTag, baseIndent) {
  const lines = [];
  const innerIndent = baseIndent + '    ';

  lines.push(`${baseIndent}<${wrapperTag}>`);

  const includedLines = renderProductConditionBlock(
    productsBlock.includedProducts, 'included-products', innerIndent
  );
  includedLines.forEach(l => lines.push(l));

  if (productsBlock.excludedProducts !== null && productsBlock.excludedProducts !== undefined) {
    const excludedLines = renderProductConditionBlock(
      productsBlock.excludedProducts, 'excluded-products', innerIndent
    );
    excludedLines.forEach(l => lines.push(l));
  }

  lines.push(`${baseIndent}</${wrapperTag}>`);
  return lines;
}

// ─── Custom-attribute rendering ───────────────────────────────────────────────

/**
 * Render the <custom-attributes> block.
 *
 * Frozen and editable attributes are merged and sorted alphabetically by
 * attributeId, reconstructing the original SFCC BM alphabetical ordering.
 *
 * @param {object[]} frozenAttrs   - frozenCustomAttributes array
 * @param {object[]} editableAttrs - editableCustomAttributes array
 * @param {string}   baseIndent    - spaces for the <custom-attributes> tag
 * @returns {string[]} lines
 */
function renderCustomAttributes(frozenAttrs, editableAttrs, baseIndent) {
  const lines     = [];
  const attrIndent = baseIndent + '    ';

  // Merge and restore original alphabetical source order
  const allAttrs = [...frozenAttrs, ...editableAttrs]
    .sort((a, b) => a.attributeId.localeCompare(b.attributeId));

  lines.push(`${baseIndent}<custom-attributes>`);

  allAttrs.forEach(attr => {
    const idAttr = ` attribute-id="${escapeXml(attr.attributeId)}"`;
    const langAttr = attr.xmlLang ? ` xml:lang="${escapeXml(attr.xmlLang)}"` : '';

    if (attr.valueType === 'nested') {
      // <custom-attribute attribute-id="...">
      //     <value>N</value>
      // </custom-attribute>
      lines.push(`${attrIndent}<custom-attribute${idAttr}>`);
      lines.push(`${attrIndent}    <value>${escapeXml(attr.value)}</value>`);
      lines.push(`${attrIndent}</custom-attribute>`);
    } else {
      // <custom-attribute attribute-id="..." [xml:lang="..."]>VALUE</custom-attribute>
      const content = attr.value !== null && attr.value !== undefined
        ? escapeXml(attr.value)
        : '';
      lines.push(`${attrIndent}<custom-attribute${idAttr}${langAttr}>${content}</custom-attribute>`);
    }
  });

  lines.push(`${baseIndent}</custom-attributes>`);
  return lines;
}

// ─── Discount rendering ───────────────────────────────────────────────────────

/**
 * Render a <simple-discount> block.
 *
 * @param {string} discountType  - 'percentage' or 'amount'
 * @param {number} discountValue
 * @param {string} baseIndent
 * @returns {string[]} lines
 */
function renderSimpleDiscount(discountType, discountValue, baseIndent) {
  const lines = [];
  const inner = baseIndent + '    ';
  lines.push(`${baseIndent}<simple-discount>`);
  lines.push(`${inner}<${discountType}>${formatNumber(discountValue)}</${discountType}>`);
  lines.push(`${baseIndent}</simple-discount>`);
  return lines;
}

/**
 * Render a <discounts condition-type="product-amount"> block.
 *
 * @param {object[]} templates - frozenStructure.discountEntryTemplates
 * @param {object[]} entries   - editableFields.discountEntries (paired 1:1 with templates)
 * @param {string}   baseIndent
 * @returns {string[]} lines
 */
function renderProductAmountDiscounts(templates, entries, baseIndent) {
  const lines = [];
  const discountIndent = baseIndent + '    ';
  const fieldIndent    = discountIndent + '    ';

  lines.push(`${baseIndent}<discounts condition-type="product-amount">`);

  templates.forEach((tmpl, i) => {
    const entry = entries[i];
    lines.push(`${discountIndent}<discount>`);
    lines.push(`${fieldIndent}<threshold>${formatNumber(entry.threshold)}</threshold>`);
    lines.push(`${fieldIndent}<${tmpl.discountType}>${formatNumber(entry.discountValue)}</${tmpl.discountType}>`);
    lines.push(`${discountIndent}</discount>`);
  });

  lines.push(`${baseIndent}</discounts>`);
  return lines;
}

// ─── Main renderer ────────────────────────────────────────────────────────────

/**
 * Render a <promotion> element from a blueprint promotionSlot.
 *
 * This renderer handles all SAS promotion patterns observed in real exports:
 *   - simple family:        <discounted-products> + <simple-discount>
 *   - product-amount family: <qualifying-products> + <discounted-products> + <discounts>
 *   - product-amount without discounted-products (WebApp pattern)
 *
 * Element ordering inside <product-promotion-rule> follows the canonical
 * SFCC BM export order:
 *   1. <qualifying-products>            — if present
 *   2. <discounted-products>            — if present
 *   3. <disable-global-excluded-products> — if true
 *   4. <discounts ...> OR <simple-discount> — discount family element
 *   5. <max-applications>               — if present
 *
 * Custom attributes are merged (frozen + editable) and sorted alphabetically
 * by attribute-id to reproduce SFCC BM's alphabetical ordering convention.
 *
 * The rendered string begins with a 4-space indent (top-level element position
 * inside <promotions>).
 *
 * @param {object} promotionSlot - Blueprint promotionSlot object
 * @returns {string} XML string for the <promotion> element
 */
function renderBlueprintPromotion(promotionSlot) {
  validate(promotionSlot);

  const { frozenStructure: fs, editableFields: ef } = promotionSlot;
  const lines = [];

  const promoIndent = '    ';           // 4
  const childIndent = '        ';       // 8
  const ruleIndent  = '            ';   // 12

  // ── Opening tag ───────────────────────────────────────────────────────────
  lines.push(`${promoIndent}<promotion promotion-id="${escapeXml(ef.promotionId)}">`);

  // ── Flags (frozen, in canonical element order) ────────────────────────────
  lines.push(`${childIndent}<enabled-flag>${fs.enabledFlag ? 'true' : 'false'}</enabled-flag>`);
  lines.push(`${childIndent}<archived-flag>${fs.archivedFlag ? 'true' : 'false'}</archived-flag>`);
  lines.push(`${childIndent}<searchable-flag>${fs.searchableFlag ? 'true' : 'false'}</searchable-flag>`);
  lines.push(`${childIndent}<refinable-flag>${fs.refinableFlag ? 'true' : 'false'}</refinable-flag>`);
  lines.push(`${childIndent}<prevent-requalifying-flag>${fs.preventRequalifyingFlag ? 'true' : 'false'}</prevent-requalifying-flag>`);
  lines.push(`${childIndent}<prorate-across-eligible-items-flag>${fs.prorateAcrossEligibleItemsFlag ? 'true' : 'false'}</prorate-across-eligible-items-flag>`);

  // ── Exclusivity (frozen) ──────────────────────────────────────────────────
  lines.push(`${childIndent}<exclusivity>${escapeXml(fs.exclusivity)}</exclusivity>`);

  // ── Names (editable) ─────────────────────────────────────────────────────
  ef.names.forEach(name => {
    lines.push(`${childIndent}<name xml:lang="${escapeXml(name.xmlLang)}">${escapeXml(name.value)}</name>`);
  });

  // ── Custom attributes ─────────────────────────────────────────────────────
  const caLines = renderCustomAttributes(
    fs.frozenCustomAttributes  || [],
    ef.editableCustomAttributes || [],
    childIndent
  );
  caLines.forEach(l => lines.push(l));

  // ── Product-promotion-rule ────────────────────────────────────────────────
  lines.push(`${childIndent}<product-promotion-rule>`);

  // 1. qualifying-products (if present)
  if (fs.qualifyingProducts !== null && fs.qualifyingProducts !== undefined) {
    const qpLines = renderProductsWrapper(fs.qualifyingProducts, 'qualifying-products', ruleIndent);
    qpLines.forEach(l => lines.push(l));
  }

  // 2. discounted-products (if present)
  if (fs.discountedProducts !== null && fs.discountedProducts !== undefined) {
    const dpLines = renderProductsWrapper(fs.discountedProducts, 'discounted-products', ruleIndent);
    dpLines.forEach(l => lines.push(l));
  }

  // 3. disable-global-excluded-products (if true)
  if (fs.disableGlobalExcludedProducts === true) {
    lines.push(`${ruleIndent}<disable-global-excluded-products>true</disable-global-excluded-products>`);
  }

  // 4a. <discounts> block — product-amount family
  if (fs.discountFamily === 'product-amount') {
    const discountLines = renderProductAmountDiscounts(
      fs.discountEntryTemplates,
      ef.discountEntries,
      ruleIndent
    );
    discountLines.forEach(l => lines.push(l));
  }

  // 4b. <simple-discount> block — simple family
  if (fs.discountFamily === 'simple') {
    const sdLines = renderSimpleDiscount(
      fs.simpleDiscountType,
      ef.simpleDiscountValue,
      ruleIndent
    );
    sdLines.forEach(l => lines.push(l));
  }

  // 5. max-applications (if present)
  if (fs.maxApplications !== null && fs.maxApplications !== undefined) {
    lines.push(`${ruleIndent}<max-applications>${fs.maxApplications}</max-applications>`);
  }

  lines.push(`${childIndent}</product-promotion-rule>`);
  lines.push(`${promoIndent}</promotion>`);

  return lines.join('\n');
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  renderBlueprintPromotion,
  // Internal helpers exported for unit testing
  _internals: {
    escapeXml,
    formatNumber,
    renderCondition,
    renderProductConditionBlock,
    renderProductsWrapper,
    renderCustomAttributes,
    renderSimpleDiscount,
    renderProductAmountDiscounts,
  },
};
