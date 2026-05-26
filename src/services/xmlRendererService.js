'use strict';

const SFCC_NS = 'http://www.demandware.com/xml/impex/promotion/2008-01-31';
const VALID_PROMO_TYPES    = new Set(['product', 'order', 'shipping']);
const VALID_DISCOUNT_TYPES = new Set(['percentage', 'fixed-price', 'free-shipping']);
const VALID_EXCLUSIVITY    = new Set(['no', 'class', 'global']);

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toArray(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value.filter(v => v != null && v !== '');
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function validate(p) {
  if (p === null || Array.isArray(p) || typeof p !== 'object') {
    throw new Error('promotion must be a non-null object');
  }

  if (!p.promotionId)   throw new Error('Required field "promotionId" is missing');
  if (!p.name)          throw new Error('Required field "name" is missing');
  if (!p.promotionType) throw new Error('Required field "promotionType" is missing');
  if (!p.campaignId)    throw new Error('Required field "campaignId" is missing');

  if (!VALID_PROMO_TYPES.has(p.promotionType)) {
    throw new Error(`Invalid promotionType "${p.promotionType}". Must be one of: product, order, shipping`);
  }

  if (p.exclusivity != null && !VALID_EXCLUSIVITY.has(p.exclusivity)) {
    throw new Error(`Invalid exclusivity "${p.exclusivity}". Must be one of: no, class, global`);
  }

  const hasTiers = Array.isArray(p.discounts) && p.discounts.length > 0;

  if (hasTiers) {
    for (let i = 0; i < p.discounts.length; i++) {
      const tier = p.discounts[i];
      if (typeof tier.threshold !== 'number') {
        throw new Error(`discounts[${i}].threshold must be a number`);
      }
      if (!VALID_DISCOUNT_TYPES.has(tier.discountType)) {
        throw new Error(`discounts[${i}].discountType "${tier.discountType}" is invalid`);
      }
    }
    if (!p.currency) {
      throw new Error('currency is required when discounts are used');
    }
  } else {
    if (!p.discountType) {
      throw new Error('No discount information supplied — provide discountType/discountValue or discounts');
    }
    if (!VALID_DISCOUNT_TYPES.has(p.discountType)) {
      throw new Error(`Invalid discountType "${p.discountType}". Must be one of: percentage, fixed-price, free-shipping`);
    }
    if (p.discountType !== 'free-shipping' && typeof p.discountValue !== 'number') {
      throw new Error('discountValue must be a number');
    }
    if (p.discountType === 'fixed-price' && !p.currency) {
      throw new Error('currency is required when discountType is fixed-price');
    }
    if (p.discountType === 'free-shipping' && p.promotionType !== 'shipping') {
      throw new Error('free-shipping discountType is only valid for shipping promotions');
    }
  }

  if (p.threshold != null && !p.currency) {
    throw new Error('currency is required when threshold is specified');
  }

  const categories = toArray(p.categoryConditions);
  if (categories.length > 0 && p.promotionType !== 'product') {
    throw new Error('categoryConditions are only valid for product promotions');
  }

  const hasStart = p.startDate != null && p.startDate !== '';
  const hasEnd   = p.endDate   != null && p.endDate   !== '';
  if (hasStart !== hasEnd) {
    throw new Error('startDate and endDate must both be supplied or both absent');
  }
}

function renderDiscountNode(lines, discountType, discountValue, currency, indent) {
  if (discountType === 'percentage') {
    lines.push(`${indent}<percentage>${discountValue}</percentage>`);
  } else if (discountType === 'fixed-price') {
    lines.push(`${indent}<fixed-price currency="${escapeXml(currency)}">${discountValue}</fixed-price>`);
  } else if (discountType === 'free-shipping') {
    lines.push(`${indent}<free-shipping/>`);
  }
}

function renderSingleDiscount(lines, p, indent) {
  lines.push(`${indent}<discount>`);
  renderDiscountNode(lines, p.discountType, p.discountValue, p.currency, `${indent}  `);
  lines.push(`${indent}</discount>`);
}

function renderTieredDiscount(lines, p, indent) {
  lines.push(`${indent}<discount>`);
  lines.push(`${indent}  <tiered-discount>`);
  for (const tier of p.discounts) {
    lines.push(`${indent}    <tier>`);
    lines.push(`${indent}      <condition>`);
    lines.push(`${indent}        <subtotal-condition operator="greater-than-or-equal">`);
    lines.push(`${indent}          <amount currency="${escapeXml(p.currency)}">${tier.threshold}</amount>`);
    lines.push(`${indent}        </subtotal-condition>`);
    lines.push(`${indent}      </condition>`);
    lines.push(`${indent}      <discount>`);
    renderDiscountNode(lines, tier.discountType, tier.discountValue, p.currency, `${indent}        `);
    lines.push(`${indent}      </discount>`);
    lines.push(`${indent}    </tier>`);
  }
  lines.push(`${indent}  </tiered-discount>`);
  lines.push(`${indent}</discount>`);
}

function renderDiscount(lines, p, indent) {
  const hasTiers = Array.isArray(p.discounts) && p.discounts.length > 0;
  if (hasTiers) renderTieredDiscount(lines, p, indent);
  else renderSingleDiscount(lines, p, indent);
}

function renderThresholdCondition(lines, p, indent) {
  if (p.threshold != null && p.currency) {
    lines.push(`${indent}<condition>`);
    lines.push(`${indent}  <subtotal-condition operator="greater-than-or-equal">`);
    lines.push(`${indent}    <amount currency="${escapeXml(p.currency)}">${p.threshold}</amount>`);
    lines.push(`${indent}  </subtotal-condition>`);
    lines.push(`${indent}</condition>`);
  }
}

function renderOrderRule(lines, p) {
  const hasTiers = Array.isArray(p.discounts) && p.discounts.length > 0;
  lines.push('      <order-rule>');
  if (!hasTiers) renderThresholdCondition(lines, p, '        ');
  renderDiscount(lines, p, '        ');
  lines.push('      </order-rule>');
}

function renderProductRule(lines, p) {
  lines.push('      <product-rule>');
  const categories = toArray(p.categoryConditions);
  if (categories.length > 0) {
    lines.push('        <qualifying-products>');
    lines.push('          <category-ids>');
    for (const cat of categories) {
      lines.push(`            <category-id>${escapeXml(cat)}</category-id>`);
    }
    lines.push('          </category-ids>');
    lines.push('        </qualifying-products>');
  }
  renderThresholdCondition(lines, p, '        ');
  renderDiscount(lines, p, '        ');
  lines.push('      </product-rule>');
}

function renderShippingRule(lines, p) {
  lines.push('      <shipping-rule>');
  renderThresholdCondition(lines, p, '        ');
  renderDiscount(lines, p, '        ');
  lines.push('      </shipping-rule>');
}

function renderPromotionXML(promotion) {
  validate(promotion);
  const p = promotion;
  const lines = [];

  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<promotions xmlns="${SFCC_NS}">`);
  lines.push(`  <promotion promotion-id="${escapeXml(p.promotionId)}">`);
  lines.push(`    <name xml:lang="x-default">${escapeXml(p.name)}</name>`);

  if (p.description) {
    lines.push(`    <description xml:lang="x-default">${escapeXml(p.description)}</description>`);
  }

  lines.push(`    <promotion-class>${escapeXml(p.promotionType)}</promotion-class>`);
  lines.push(`    <enabled-flag>${p.enabledFlag === false ? 'false' : 'true'}</enabled-flag>`);

  if (p.exclusivity) {
    lines.push(`    <exclusivity>${escapeXml(p.exclusivity)}</exclusivity>`);
  }

  lines.push(`    <campaign-id>${escapeXml(p.campaignId)}</campaign-id>`);

  if (p.startDate && p.endDate) {
    lines.push('    <schedule>');
    lines.push(`      <start-date>${escapeXml(p.startDate)}</start-date>`);
    lines.push(`      <end-date>${escapeXml(p.endDate)}</end-date>`);
    lines.push('    </schedule>');
  }

  const groups = toArray(p.customerGroups);
  if (groups.length > 0) {
    lines.push('    <customer-groups operator="is-member-of">');
    for (const group of groups) {
      lines.push(`      <customer-group group-id="${escapeXml(group)}"/>`);
    }
    lines.push('    </customer-groups>');
  }

  const couponList = toArray(p.coupons);
  if (couponList.length > 0) {
    lines.push('    <coupons>');
    for (const coupon of couponList) {
      lines.push(`      <coupon coupon-id="${escapeXml(coupon)}"/>`);
    }
    lines.push('    </coupons>');
  }

  lines.push('    <rule>');

  if (p.promotionType === 'order') {
    renderOrderRule(lines, p);
  } else if (p.promotionType === 'product') {
    renderProductRule(lines, p);
  } else if (p.promotionType === 'shipping') {
    renderShippingRule(lines, p);
  }

  lines.push('    </rule>');

  lines.push('  </promotion>');
  lines.push('</promotions>');

  return lines.join('\n');
}

module.exports = { renderPromotionXML };

// ─── Temporary manual test runner ────────────────────────────────────────────
// Run with:
// node src/services/xmlRendererService.js
if (require.main === module) {
  const payload = {
    promotionType: 'product',
    promotionId: 'fesite-tier-sale',
    name: 'FE Site Tier Sale',
    description: 'Tiered order promotion for sale items',
    campaignId: 'spring-sale-2026',

    customerGroups: ['FESITETEST'],
    coupons: ['PushpindersAgent'],

    categoryConditions: ['Sale-viewAll'],

    discounts: [
      {
        threshold: 250,
        discountType: 'percentage',
        discountValue: 20
      },
      {
        threshold: 350,
        discountType: 'percentage',
        discountValue: 30
      }
    ],

    currency: 'USD',

    startDate: '2026-05-09T00:00:00Z',
    endDate: '2026-05-11T23:59:59Z',

    enabledFlag: true,
    exclusivity: 'no'
  };

  try {
    const xml = renderPromotionXML(payload);
    console.log(xml);
  } catch (error) {
    console.error('\nERROR:\n');
    console.error(error.message);
  }
}
