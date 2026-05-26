'use strict';

/**
 * promotionSummaryService.js
 *
 * Generates human-readable summaries of PromotionDocumentV2 objects.
 *
 * Outputs:
 *   - oneLiner:     "VIP customers receive 20% off handbags when spending over $500..."
 *   - bullets:      Array of plain-English bullet strings
 *   - headline:     Short bold-friendly title (for Teams adaptive cards)
 *   - businessNote: Operational note for approvers
 */

// ─── Formatters ───────────────────────────────────────────────────────────────

function _fmtDiscount(tiers) {
  if (!tiers || !tiers.length) return 'a discount';
  if (tiers.length === 1) return _fmtTier(tiers[0]);
  return tiers.map((t, i) => `${_fmtTier(t)} on orders over $${t.threshold}`).join('; then ');
}

function _fmtTier(tier) {
  if (!tier) return 'a discount';
  if (tier.discountType === 'free-shipping') return 'free shipping';
  if (tier.discountType === 'percentage')    return `${tier.discountValue}% off`;
  if (tier.discountType === 'amount')        return `$${tier.discountValue} off`;
  if (tier.discountType === 'fixed-price')   return `a fixed price of $${tier.discountValue}`;
  return 'a discount';
}

function _fmtAudience(doc) {
  const groups = doc.campaign?.customerGroups?.groupIds || [];
  if (!groups.length) return 'all customers';
  if (groups.includes('Everyone')) return 'all customers';
  if (groups.length === 1) return `${groups[0]} customers`;
  return `${groups.slice(0, -1).join(', ')} and ${groups[groups.length - 1]} customers`;
}

function _fmtCategories(promotion) {
  const groups = promotion.qualifyingProducts?.conditionGroups || [];
  const catIds = groups.flatMap(g => g.categoryCondition?.categoryIds || []);
  if (!catIds.length) return null;
  if (catIds.length === 1) return catIds[0];
  return `${catIds.slice(0, -1).join(', ')} and ${catIds[catIds.length - 1]}`;
}

function _fmtThreshold(promotion) {
  const tiers = promotion.discounts || [];
  const first = tiers[0];
  if (!first || !first.threshold || first.threshold <= 0) return null;
  return `$${first.threshold}`;
}

function _fmtSchedule(doc) {
  const c = doc.campaign;
  const a = doc.assignment;
  const src = c || a;
  if (!src) return null;
  const start = src.startDate || src.schedule?.startDate;
  const end   = src.endDate   || src.schedule?.endDate;
  if (start && end) {
    return `from ${_fmtDate(start)} to ${_fmtDate(end)}`;
  }
  if (start) return `starting ${_fmtDate(start)}`;
  return null;
}

function _fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function _fmtCoupons(doc) {
  const coupons = doc.assignment?.activationCoupons || [];
  if (!coupons.length) return null;
  return coupons.join(', ');
}

function _fmtShippingMethods(promotion) {
  const methods = promotion.shippingRuleOptions?.methodIds || [];
  if (!methods.length) return null;
  const nameMap = {
    standard: 'standard', twoday: 'two-day', overnight: 'overnight',
    express: 'express', surepost: 'SurePost', 'standard-hazmat': 'hazmat', economy: 'economy',
  };
  return methods.map(m => nameMap[m] || m).join(', ');
}

function _fmtExclusions(promotion) {
  const groups = promotion.excludedProducts?.conditionGroups || [];
  const catIds = groups.flatMap(g => g.categoryCondition?.categoryIds || []);
  if (!catIds.length) return null;
  return catIds.join(', ');
}

// ─── Main generators ──────────────────────────────────────────────────────────

/**
 * Generate all summary forms for a PromotionDocumentV2.
 *
 * @param {object} doc — PromotionDocumentV2
 * @returns {{ oneLiner, headline, bullets, businessNote }}
 */
function generateSummary(doc) {
  if (!doc || !doc.promotion) {
    return { oneLiner: 'No promotion data available.', headline: 'Promotion', bullets: [], businessNote: '' };
  }

  const p        = doc.promotion;
  const audience = _fmtAudience(doc);
  const discount = _fmtDiscount(p.discounts);
  const cats     = _fmtCategories(p);
  const threshold = _fmtThreshold(p);
  const schedule = _fmtSchedule(doc);
  const coupons  = _fmtCoupons(doc);
  const methods  = _fmtShippingMethods(p);
  const exclusions = _fmtExclusions(p);

  // One-liner
  let parts = [];
  if (audience !== 'all customers') parts.push(`${audience}`);
  else parts.push('All customers');
  parts.push(`receive ${discount}`);
  if (cats && p.ruleType !== 'shipping') parts.push(`on ${cats}`);
  if (methods && p.ruleType === 'shipping') parts.push(`(${methods} shipping)`);
  if (threshold) parts.push(`when spending over ${threshold}`);
  if (schedule) parts.push(schedule);
  if (coupons) parts.push(`using coupon ${coupons}`);
  if (exclusions) parts.push(`(excludes: ${exclusions})`);

  const oneLiner = parts.join(' ') + '.';

  // Headline (short, card-friendly)
  const discountShort = p.discounts?.[0]
    ? (p.discounts[0].discountType === 'percentage'    ? `${p.discounts[0].discountValue}% Off`
      : p.discounts[0].discountType === 'amount'       ? `$${p.discounts[0].discountValue} Off`
      : p.discounts[0].discountType === 'free-shipping' ? 'Free Shipping'
      : 'Discount')
    : 'Promotion';
  const headline = cats
    ? `${discountShort} on ${cats.split(' and ')[0]}`
    : discountShort;

  // Bullets
  const bullets = [];
  bullets.push(`Discount: ${discount}`);
  bullets.push(`Audience: ${audience}`);
  if (cats) bullets.push(`Products: ${cats}`);
  if (methods) bullets.push(`Shipping methods: ${methods}`);
  if (threshold) bullets.push(`Minimum order: ${threshold}`);
  if (schedule) bullets.push(`Schedule: ${schedule}`);
  if (coupons) bullets.push(`Coupon code(s): ${coupons}`);
  if (exclusions) bullets.push(`Excluded: ${exclusions}`);
  bullets.push(`Rule type: ${p.ruleType}`);
  if (p.lifecycle?.preventRequalifying) bullets.push('One-time use per customer');
  if (p.exclusivity === 'class') bullets.push('Exclusively for specified customer group');

  // Business note (approver-facing)
  const tieredNote = (p.discounts?.length || 0) > 1
    ? ` This is a tiered promotion with ${p.discounts.length} discount levels.`
    : '';
  const couponNote = coupons ? ` Activated by coupon code "${coupons}".` : '';
  const businessNote = `This is a ${p.ruleType}-level promotion offering ${discount} to ${audience}.${tieredNote}${couponNote}`;

  return { oneLiner, headline, bullets, businessNote };
}

/**
 * Generate a validation explanation in plain English.
 *
 * @param {object} validationResult — from validationService.validateDocument()
 * @returns {string}
 */
function explainValidation(validationResult) {
  if (validationResult.valid) {
    return 'The promotion document is valid and ready to generate XML.';
  }
  const errors = validationResult.errors || [];
  if (!errors.length) return 'The promotion document is invalid for unknown reasons.';
  const lines = errors.map(e => `• ${e.field ? `"${e.field}": ` : ''}${e.message}`);
  return `The promotion document has ${errors.length} validation issue(s):\n${lines.join('\n')}`;
}

module.exports = { generateSummary, explainValidation };
