'use strict';

/**
 * Canonical promotion field registry.
 *
 * Controls:
 *   required      — whether the field must be present before XML can be generated
 *   clarification — exact question text returned to the caller when the field is absent
 *   allowedValues — (optional) enumerated legal values; absent means free-form
 *
 * Field groups
 * ────────────
 *   Identity     : promotionType, promotionId, name, description, campaignId,
 *                  enabledFlag, exclusivity
 *   Schedule     : startDate, endDate  (both required if either is present — enforced by renderer)
 *   Audience     : customerGroups[], coupons[]
 *   Qualifier    : categoryConditions[]  (product only), threshold, currency
 *   Discount     : discounts[]  (each entry: threshold, discountType, discountValue)
 *
 * Conditional renderer rules (not expressible here — enforced in xmlRendererService):
 *   • categoryConditions only valid when promotionType = 'product'
 *   • free-shipping discountType only valid when promotionType = 'shipping'
 *   • currency required when threshold or fixed-price discount is present
 *   • discounts[] is the canonical field; discountTiers is not accepted
 *   • each tier requires threshold (number), discountType, discountValue (number)
 *   • startDate and endDate must both be supplied or both absent
 */

module.exports = {

  // ── Identity ─────────────────────────────────────────────────────────────────

  promotionType: {
    required:      true,
    allowedValues: ['product', 'order', 'shipping'],
    clarification: 'What type of promotion is this? (product / order / shipping)',
  },

  promotionId: {
    required:      true,
    clarification: 'What should the unique promotion ID be? (e.g. spring-sale-2024)',
  },

  name: {
    required:      true,
    clarification: 'What is the promotion name?',
  },

  description: {
    required:      false,
    clarification: 'Should this promotion have a description? If so, what should it say?',
  },

  campaignId: {
    required:      true,
    clarification: 'Which campaign does this promotion belong to?',
  },

  enabledFlag: {
    required:      false,
    allowedValues: [true, false],
    clarification: 'Should this promotion be enabled when imported? (true / false)',
  },

  exclusivity: {
    required:      false,
    allowedValues: ['no', 'class', 'global'],
    clarification: 'Is this promotion exclusive? (no / class / global)',
  },

  // ── Schedule ──────────────────────────────────────────────────────────────────
  // Both startDate and endDate must be present or both must be absent.
  // Renderer enforces this — clarification service cannot because the constraint
  // is cross-field.

  startDate: {
    required:      false,
    clarification: 'What is the promotion start date? (YYYY-MM-DD)',
  },

  endDate: {
    required:      false,
    clarification: 'What is the promotion end date? (YYYY-MM-DD)',
  },

  // ── Audience ──────────────────────────────────────────────────────────────────
  // String or string[]. Coupons and customerGroups are always separate blocks.

  customerGroups: {
    required:      false,
    clarification: 'Which customer groups should qualify? (e.g. VIP, Employees)',
  },

  coupons: {
    required:      false,
    clarification: 'What coupon code(s) should activate this promotion?',
  },

  // ── Qualifier ─────────────────────────────────────────────────────────────────

  categoryConditions: {
    required:      false,
    clarification: 'Which product categories qualify? (product promotions only — e.g. shoes, handbags, Sale-viewAll)',
  },

  threshold: {
    required:      false,
    clarification: 'Is there a minimum order value required to qualify? (number)',
  },

  currency: {
    required:      false,
    clarification: 'Which currency applies? (e.g. USD, EUR, GBP)',
  },

  // ── Discount ──────────────────────────────────────────────────────────────────
  // Canonical field: discounts[]
  // Each entry: { threshold: number, discountType: string, discountValue: number }
  //
  // discounts[] shape:
  //   [{ threshold: number, discountType: 'percentage'|'amount'|'free-shipping', discountValue: number }, ...]
  //
  // discountType allowed values (per renderer family):
  //   'percentage'    — e.g. discountValue: 20  → 20% off
  //   'amount'        — e.g. discountValue: 50  → $50 off (product-amount discounts)
  //   'free-shipping' — no discountValue needed; shipping promotions only
  //
  // discountTiers is the old field name and is NOT accepted by any renderer.

  discountType: {
    required:      false,
    allowedValues: ['percentage', 'fixed-price', 'free-shipping'],
    clarification: 'What type of discount? (percentage / fixed-price / free-shipping)',
  },

  discountValue: {
    required:      false,
    clarification: 'What is the discount value? (number — e.g. 20 for 20% off or $20 off)',
  },

  discounts: {
    required:      false,
    clarification: 'Provide discounts — each needs a threshold and a discount (e.g. 20% over $250, 30% over $350)',
  },
};
