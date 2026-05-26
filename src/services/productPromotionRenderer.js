'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const SFCC_NS    = 'http://www.demandware.com/xml/impex/promotion/2008-01-31';
const CATALOG_ID = 'siteCatalog_ToryUS';

const VALID_EXCLUSIVITY    = new Set(['no', 'class', 'global']);
const VALID_DISCOUNT_TYPES = new Set(['percentage', 'amount']);

// ─── Static boilerplate ───────────────────────────────────────────────────────
// Source of truth: real SFCC XML exports.
// This block is identical across all exported promotion files.
// It must NEVER be parameterised or dynamically generated.

const GLOBAL_PROMOTION_SETTINGS =
`    <global-promotion-settings>
        <global-excluded-products>
            <included-products>
                <condition-group>
                    <category-condition catalog-id="siteCatalog_ToryUS" operator="is equal">
                        <category-id>Exclusions-Always</category-id>
                    </category-condition>
                </condition-group>
                <condition-group>
                    <category-condition catalog-id="siteCatalog_ToryUS" operator="is equal">
                        <category-id>accessories-seedbox-foundation</category-id>
                    </category-condition>
                </condition-group>
                <condition-group>
                    <category-condition catalog-id="siteCatalog_ToryUS" operator="is equal">
                        <category-id>accessories-masks</category-id>
                    </category-condition>
                </condition-group>
            </included-products>
        </global-excluded-products>
        <global-excluded-product-options>
            <product-option-id>monogramming</product-option-id>
        </global-excluded-product-options>
    </global-promotion-settings>`;

// ─── XML escaping ─────────────────────────────────────────────────────────────

function escapeXml(value) {
  return String(value)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&apos;');
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validate(p) {
  if (p === null || Array.isArray(p) || typeof p !== 'object') {
    throw new Error('promotion must be a non-null object');
  }

  if (!p.promotionId || typeof p.promotionId !== 'string') {
    throw new Error('Required field "promotionId" must be a non-empty string');
  }
  if (!p.name || typeof p.name !== 'string') {
    throw new Error('Required field "name" must be a non-empty string');
  }
  if (!p.exclusivity || !VALID_EXCLUSIVITY.has(p.exclusivity)) {
    throw new Error('"exclusivity" must be one of: no, class, global');
  }

  // ── Qualifying products ───────────────────────────────────────────────────

  if (!p.qualifyingProducts || typeof p.qualifyingProducts !== 'object') {
    throw new Error('Required field "qualifyingProducts" is missing');
  }
  const qpType = p.qualifyingProducts.type;
  if (qpType === 'category') {
    const ids = p.qualifyingProducts.categoryIds;
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new Error('"qualifyingProducts.categoryIds" must be a non-empty array when type is "category"');
    }
  } else if (qpType !== 'price') {
    throw new Error('"qualifyingProducts.type" must be "price" or "category"');
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  if (!Array.isArray(p.discounts) || p.discounts.length === 0) {
    throw new Error('"discounts" must be a non-empty array');
  }
  p.discounts.forEach((discount, i) => {
    if (typeof discount.threshold !== 'number') {
      throw new Error(`discounts[${i}].threshold must be a number`);
    }
    if (!VALID_DISCOUNT_TYPES.has(discount.discountType)) {
      throw new Error(`discounts[${i}].discountType must be "percentage" or "amount"`);
    }
    if (typeof discount.discountValue !== 'number') {
      throw new Error(`discounts[${i}].discountValue must be a number`);
    }
  });

  // ── Optional fields ───────────────────────────────────────────────────────

  if (p.maxApplications !== undefined) {
    if (!Number.isInteger(p.maxApplications) || p.maxApplications < 1) {
      throw new Error('"maxApplications" must be a positive integer when supplied');
    }
  }
}

// ─── Qualifying-products block ────────────────────────────────────────────────

function renderQualifyingProducts(qp) {
  const lines = [];
  lines.push('            <qualifying-products>');
  lines.push('                <included-products>');
  lines.push('                    <condition-group>');

  if (qp.type === 'price') {
    lines.push('                        <price-condition operator="greater than">');
    lines.push('                            <price>0.01</price>');
    lines.push('                        </price-condition>');
  } else {
    const catalogId = qp.catalogId || CATALOG_ID;
    lines.push(`                        <category-condition catalog-id="${escapeXml(catalogId)}" operator="is equal">`);
    for (const catId of qp.categoryIds) {
      lines.push(`                            <category-id>${escapeXml(catId)}</category-id>`);
    }
    lines.push('                        </category-condition>');
  }

  lines.push('                    </condition-group>');
  lines.push('                </included-products>');
  lines.push('            </qualifying-products>');
  return lines.join('\n');
}

// ─── Discount value node ──────────────────────────────────────────────────────

function discountValueNode(discountType, discountValue) {
  if (discountType === 'percentage') return `<percentage>${discountValue}</percentage>`;
  return `<amount>${discountValue}</amount>`;
}

// ─── Discounts block ──────────────────────────────────────────────────────────

function renderDiscounts(p) {
  const lines = [];
  lines.push('            <discounts condition-type="product-amount">');

  for (const discount of p.discounts) {
    lines.push('                <discount>');
    lines.push(`                    <threshold>${discount.threshold}</threshold>`);
    lines.push(`                    ${discountValueNode(discount.discountType, discount.discountValue)}`);
    lines.push('                </discount>');
  }

  lines.push('            </discounts>');
  return lines.join('\n');
}

// ─── Main renderer ────────────────────────────────────────────────────────────

function renderProductPromotion(promotion) {
  validate(promotion);
  const p = promotion;
  const lines = [];

  // ── Document header ───────────────────────────────────────────────────────
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<promotions xmlns="${SFCC_NS}">`);

  // ── Global settings (static boilerplate) ─────────────────────────────────
  lines.push(GLOBAL_PROMOTION_SETTINGS);
  lines.push('');

  // ── Promotion block ───────────────────────────────────────────────────────
  lines.push(`    <promotion promotion-id="${escapeXml(p.promotionId)}">`);

  // Mandatory flags — node order matches real exports exactly
  lines.push(`        <enabled-flag>${p.enabledFlag === false ? 'false' : 'true'}</enabled-flag>`);
  lines.push(`        <archived-flag>${p.archivedFlag === true ? 'true' : 'false'}</archived-flag>`);
  lines.push(`        <searchable-flag>${p.searchableFlag === true ? 'true' : 'false'}</searchable-flag>`);
  lines.push('        <refinable-flag>false</refinable-flag>');
  lines.push('        <prevent-requalifying-flag>false</prevent-requalifying-flag>');
  lines.push('        <prorate-across-eligible-items-flag>false</prorate-across-eligible-items-flag>');
  lines.push(`        <exclusivity>${escapeXml(p.exclusivity)}</exclusivity>`);
  lines.push(`        <name xml:lang="x-default">${escapeXml(p.name)}</name>`);

  // Optional: callout message
  if (p.calloutMsg) {
    lines.push(`        <callout-msg xml:lang="x-default">${escapeXml(p.calloutMsg)}</callout-msg>`);
  }

  // Custom attributes — minimum required set observed in all exports
  lines.push('        <custom-attributes>');
  lines.push('            <custom-attribute attribute-id="gwp">false</custom-attribute>');
  lines.push('            <custom-attribute attribute-id="isExcludeTranslate">false</custom-attribute>');
  lines.push('        </custom-attributes>');

  // ── Product promotion rule ────────────────────────────────────────────────
  lines.push('        <product-promotion-rule>');
  lines.push(renderQualifyingProducts(p.qualifyingProducts));
  lines.push(renderDiscounts(p));

  // Optional: max-applications
  if (p.maxApplications !== undefined) {
    lines.push(`            <max-applications>${p.maxApplications}</max-applications>`);
  }

  lines.push('        </product-promotion-rule>');
  lines.push('    </promotion>');
  lines.push('');
  lines.push('</promotions>');

  return lines.join('\n');
}

module.exports = { renderProductPromotion };
