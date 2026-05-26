'use strict';

const { create } = require('xmlbuilder2');

const NS = 'http://www.demandware.com/xml/impex/promotion/2008-01-31';

/**
 * Builds a complete SFCC promotion XML document from a PromotionDocumentV2 object.
 *
 * Assembly order follows reusable-xml-blocks.md §Builder Assembly Order:
 *   1  [if campaign]   Block 2  — Campaign
 *   2                  Block 1  — GlobalPromotionSettings
 *   3                  <promotion>
 *   4                    Block 3  — LifecycleFlags
 *   5                    <exclusivity>
 *   6                    <name>
 *   7                    [opt] <callout-msg>
 *   8                    Block 13 — CustomAttributes
 *   9                    <[product|order|shipping]-promotion-rule>
 *  10–22               Rule-type-specific children (see _buildRule)
 *  23  [if assignment] Block 10 — Qualifiers
 *  24  [if assignment] Block 11 — ActivationCoupons [opt]
 *  25  [if assignment] <rank> [opt]
 *  26  [if assignment] Block 12 — AssignmentSchedule [opt]
 *
 * @param {object} doc — PromotionDocumentV2
 * @returns {string} UTF-8 XML string
 */
function buildDocument(doc) {
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('promotions', { xmlns: NS });

  if (doc.campaign) {
    _buildCampaign(root, doc.campaign);
  }

  _buildGlobalSettings(root, doc.globalSettings || {});
  _buildPromotion(root, doc.promotion);

  if (doc.assignment) {
    _buildAssignment(root, doc.assignment);
  }

  return root.end({ prettyPrint: true });
}

// ─── Block 2: Campaign ────────────────────────────────────────────────────────

function _buildCampaign(root, c) {
  const el = root.ele('campaign', { 'campaign-id': c.id });
  el.ele('enabled-flag').txt(String(c.enabled !== false));
  const scope = el.ele('campaign-scope');
  if (!c.scope || c.scope === 'online') scope.ele('applicable-online');
  if (c.startDate) el.ele('start-date').txt(c.startDate);
  if (c.endDate)   el.ele('end-date').txt(c.endDate);
  if (c.customerGroups && c.customerGroups.groupIds && c.customerGroups.groupIds.length) {
    const cg = el.ele('customer-groups', { 'match-mode': c.customerGroups.matchMode || 'any' });
    c.customerGroups.groupIds.forEach(id => cg.ele('customer-group', { 'group-id': id }));
  }
}

// ─── Block 1: GlobalPromotionSettings ────────────────────────────────────────

function _buildGlobalSettings(root, gs) {
  const settings = root.ele('global-promotion-settings');
  const excluded = settings.ele('global-excluded-products');
  const included = excluded.ele('included-products');

  const catIds = (gs.excludedCategoryIds && gs.excludedCategoryIds.length)
    ? gs.excludedCategoryIds
    : ['Exclusions-Always', 'accessories-seedbox-foundation', 'accessories-masks'];

  const catalogId = gs.catalogId || 'siteCatalog_ToryUS';

  catIds.forEach(catId => {
    const cg = included.ele('condition-group');
    const cc = cg.ele('category-condition', { 'catalog-id': catalogId, operator: 'is equal' });
    cc.ele('category-id').txt(catId);
  });

  const optionsEl = settings.ele('global-excluded-product-options');
  const optionIds = (gs.excludedProductOptionIds && gs.excludedProductOptionIds.length)
    ? gs.excludedProductOptionIds
    : ['monogramming'];
  optionIds.forEach(optId => optionsEl.ele('product-option-id').txt(optId));
}

// ─── Block 3: Lifecycle Flags + Promotion Shell ───────────────────────────────

function _buildPromotion(root, p) {
  const el = root.ele('promotion', { 'promotion-id': p.id });

  _buildLifecycleFlags(el, p.lifecycle || {});

  el.ele('exclusivity').txt(p.exclusivity || 'no');
  el.ele('name', { 'xml:lang': 'x-default' }).txt(p.name);

  if (p.calloutMsg) {
    el.ele('callout-msg', { 'xml:lang': 'x-default' }).txt(p.calloutMsg);
  }

  if (p.customAttributes && Object.keys(p.customAttributes).length) {
    _buildCustomAttributes(el, p.customAttributes);
  }

  _buildRule(el, p);
}

function _buildLifecycleFlags(el, lc) {
  el.ele('enabled-flag').txt(String(lc.enabled !== false));
  el.ele('archived-flag').txt(String(lc.archived === true));
  el.ele('searchable-flag').txt(String(lc.searchable === true));
  el.ele('refinable-flag').txt(String(lc.refinable === true));
  el.ele('prevent-requalifying-flag').txt(String(lc.preventRequalifying === true));
  el.ele('prorate-across-eligible-items-flag').txt(String(lc.prorateAcrossEligibleItems === true));
}

// ─── Block 13: CustomAttributes ──────────────────────────────────────────────

function _buildCustomAttributes(el, attrs) {
  const ca = el.ele('custom-attributes');
  Object.entries(attrs).forEach(([key, val]) => {
    ca.ele('custom-attribute', { 'attribute-id': key }).txt(String(val));
  });
}

// ─── Rule Dispatch ────────────────────────────────────────────────────────────

function _buildRule(promotionEl, p) {
  switch (p.ruleType) {
    case 'product':  return _buildProductRule(promotionEl, p);
    case 'order':    return _buildOrderRule(promotionEl, p);
    case 'shipping': return _buildShippingRule(promotionEl, p);
    default:
      throw new Error(`Unknown ruleType: "${p.ruleType}". Must be product | order | shipping.`);
  }
}

// ─── Product Promotion Rule ───────────────────────────────────────────────────
// Assembly positions 10–12

function _buildProductRule(promotionEl, p) {
  const rule = promotionEl.ele('product-promotion-rule');

  if (p.qualifyingProducts) {
    _buildQualifyingProducts(rule, p.qualifyingProducts);
  }

  _buildDiscounts(rule, p.discountConditionType, p.discounts);

  const maxApp = p.productRuleOptions && p.productRuleOptions.maxApplications;
  if (maxApp != null) {
    rule.ele('max-applications').txt(String(maxApp));
  }
}

// ─── Order Promotion Rule ─────────────────────────────────────────────────────
// Assembly positions 13–17

function _buildOrderRule(promotionEl, p) {
  const rule = promotionEl.ele('order-promotion-rule');
  const opts = p.orderRuleOptions || {};

  if (p.excludedProducts) {
    _buildExcludedProducts(rule, p.excludedProducts);
  }

  if (p.qualifyingProducts) {
    _buildQualifyingProducts(rule, p.qualifyingProducts);
  }

  rule.ele('discount-only-qualifying-products')
    .txt(String(opts.discountOnlyQualifyingProducts === true));

  _buildDiscounts(rule, p.discountConditionType, p.discounts);

  rule.ele('exclude-discounted-products')
    .txt(String(opts.excludeDiscountedProducts === true));
}

// ─── Shipping Promotion Rule ──────────────────────────────────────────────────
// Assembly positions 18–22

function _buildShippingRule(promotionEl, p) {
  const rule = promotionEl.ele('shipping-promotion-rule');
  const opts = p.shippingRuleOptions || {};

  if (p.qualifyingProducts) {
    _buildQualifyingProducts(rule, p.qualifyingProducts);
  }

  if (opts.methodIds && opts.methodIds.length) {
    _buildShippingMethods(rule, opts.methodIds);
  }

  if (opts.disableGlobalExcludedProducts === true) {
    rule.ele('disable-global-excluded-products').txt('true');
  }

  _buildDiscounts(rule, p.discountConditionType, p.discounts);

  if (opts.upsellThreshold != null) {
    rule.ele('upsell-threshold').txt(String(opts.upsellThreshold));
  }
}

// ─── Block 4 / 5: QualifyingProducts ─────────────────────────────────────────

function _buildQualifyingProducts(ruleEl, qp) {
  const qpEl = ruleEl.ele('qualifying-products');
  _buildConditionGroups(qpEl.ele('included-products'), qp.conditionGroups || []);
}

function _buildExcludedProducts(ruleEl, ep) {
  const epEl = ruleEl.ele('excluded-products');
  _buildConditionGroups(epEl.ele('included-products'), ep.conditionGroups || []);
}

function _buildConditionGroups(parentEl, conditionGroups) {
  conditionGroups.forEach(cg => {
    const cgEl = parentEl.ele('condition-group');

    if (cg.priceCondition) {
      const pc = cg.priceCondition;
      const pcEl = cgEl.ele('price-condition', { operator: pc.operator || 'greater than' });
      pcEl.ele('price').txt(String(pc.price));
    }

    if (cg.categoryCondition) {
      const cc = cg.categoryCondition;
      const ccEl = cgEl.ele('category-condition', {
        'catalog-id': cc.catalogId || 'siteCatalog_ToryUS',
        operator: cc.operator || 'is equal',
      });
      (cc.categoryIds || []).forEach(catId => ccEl.ele('category-id').txt(catId));
    }
  });
}

// ─── Block 7 / 8: Discounts ───────────────────────────────────────────────────

function _buildDiscounts(ruleEl, conditionType, tiers) {
  if (!tiers || !tiers.length) return;
  const discountsEl = ruleEl.ele('discounts', { 'condition-type': conditionType });
  tiers.forEach(tier => _buildDiscountTier(discountsEl, tier));
}

function _buildDiscountTier(discountsEl, tier) {
  const d = discountsEl.ele('discount');
  d.ele('threshold').txt(String(tier.threshold));
  switch (tier.discountType) {
    case 'free-shipping':
      // Renders as <free/> in SFCC SAS XML (legacy element name preserved for byte-identical output)
      d.ele('free');
      break;
    case 'percentage':
      d.ele('percentage').txt(String(tier.discountValue));
      break;
    case 'amount':
      d.ele('amount').txt(String(tier.discountValue));
      break;
    case 'fixed-price':
      d.ele('fixed-price').txt(String(tier.discountValue));
      break;
    default:
      throw new Error(`Unknown discount discountType: "${tier.discountType}". Must be free-shipping | percentage | amount | fixed-price.`);
  }
}

// ─── Block 9: ShippingMethods ─────────────────────────────────────────────────

function _buildShippingMethods(ruleEl, methodIds) {
  const sm = ruleEl.ele('shipping-methods');
  methodIds.forEach(id => sm.ele('method-id').txt(id));
}

// ─── Block 10 / 11 / 12: Assignment ──────────────────────────────────────────

function _buildAssignment(root, a) {
  const el = root.ele('promotion-campaign-assignment', {
    'promotion-id': a.promotionId,
    'campaign-id':  a.campaignId,
  });

  const q = a.qualifiers || {};
  const qualEl = el.ele('qualifiers', { 'match-mode': q.matchMode || 'any' });

  if (q.customerGroupIds && q.customerGroupIds.length) {
    const cg = qualEl.ele('customer-groups');
    q.customerGroupIds.forEach(id => cg.ele('customer-group', { 'group-id': id }));
  } else {
    qualEl.ele('customer-groups');
  }

  if (q.sourceCodes && q.sourceCodes.length) {
    const sc = qualEl.ele('source-codes');
    q.sourceCodes.forEach(id => sc.ele('source-code', { id }));
  } else {
    qualEl.ele('source-codes');
  }

  if (q.qualifierCouponIds && q.qualifierCouponIds.length) {
    const qc = qualEl.ele('coupons');
    q.qualifierCouponIds.forEach(id => qc.ele('coupon', { 'coupon-id': id }));
  } else {
    qualEl.ele('coupons');
  }

  if (a.activationCoupons && a.activationCoupons.length) {
    const coupons = el.ele('coupons');
    a.activationCoupons.forEach(id => coupons.ele('coupon', { 'coupon-id': id }));
  }

  if (a.rank != null) {
    el.ele('rank').txt(String(a.rank));
  }

  if (a.schedule) {
    const sched = el.ele('schedule');
    if (a.schedule.startDate) sched.ele('start-date').txt(a.schedule.startDate);
    if (a.schedule.endDate)   sched.ele('end-date').txt(a.schedule.endDate);
  }
}

module.exports = { buildDocument };
