'use strict';

/**
 * xmlImportService.js
 *
 * Deterministic parser: SFCC Promotion XML → PromotionDocumentV2
 *
 * Enables editing, cloning, migration analysis, and reverse engineering of
 * existing promotions without AI involvement.
 *
 * IMPORTANT: This parser is 100% deterministic — no AI, no heuristics.
 * Every extracted value maps directly from a known XML element or attribute.
 */

// ─── XML extraction helpers ──────────────────────────────────────────────────

function _attr(xml, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]+)"`, 'i');
  const m = xml.match(re);
  return m ? m[1] : null;
}

function _text(xml, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function _allText(xml, tag) {
  const re = new RegExp(`<${tag}>([^<]+)<\\/${tag}>`, 'gi');
  return [...xml.matchAll(re)].map(m => m[1].trim());
}

function _bool(val) {
  if (val === null || val === undefined) return null;
  return String(val).toLowerCase() === 'true';
}

function _float(val) {
  if (val === null) return null;
  const n = parseFloat(val);
  return isNaN(n) ? null : n;
}

function _extractBlock(xml, tag) {
  const re = new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, 'i');
  const m = xml.match(re);
  return m ? m[0] : null;
}

// ─── Rule type detection ─────────────────────────────────────────────────────

function _detectRuleType(xml) {
  if (xml.includes('<product-promotion-rule'))  return 'product';
  if (xml.includes('<order-promotion-rule'))    return 'order';
  if (xml.includes('<shipping-promotion-rule')) return 'shipping';
  return 'product';
}

// ─── Discount tier extraction ────────────────────────────────────────────────

function _extractTiers(xml) {
  const tiers = [];

  // Free tiers (shipping) — maps to canonical discountType 'free-shipping'
  if (xml.includes('<free/>') || xml.includes('<free />')) {
    tiers.push({ threshold: 0, discountType: 'free-shipping', discountValue: 0 });
    return tiers;
  }

  // Tiered percentage
  const tieredPctBlock = _extractBlock(xml, 'tiered-discount');
  if (tieredPctBlock) {
    const tierBlocks = [...tieredPctBlock.matchAll(/<tier>([\s\S]*?)<\/tier>/gi)];
    for (const tb of tierBlocks) {
      const tBlock = tb[1];
      const thresh = _float(_text(tBlock, 'threshold') || _text(tBlock, 'amount'));
      const pct    = _float(_text(tBlock, 'percentage'));
      const amt    = _float(_text(tBlock, 'amount'));
      if (pct != null) tiers.push({ threshold: thresh || 0, discountType: 'percentage', discountValue: pct });
      else if (amt != null) tiers.push({ threshold: thresh || 0, discountType: 'amount', discountValue: amt });
    }
    return tiers;
  }

  // Single percentage
  const pct = _float(_text(xml, 'percentage'));
  if (pct != null) {
    const thresh = _float(_text(_extractBlock(xml, 'threshold') || '', 'amount'));
    tiers.push({ threshold: thresh || 0, discountType: 'percentage', discountValue: pct });
    return tiers;
  }

  // Single amount
  const amountBlock = _extractBlock(xml, 'amount-off');
  if (amountBlock) {
    const amt = _float(_text(amountBlock, 'amount'));
    if (amt != null) {
      tiers.push({ threshold: 0, discountType: 'amount', discountValue: amt });
      return tiers;
    }
  }

  // Fixed price
  const fixedBlock = _extractBlock(xml, 'fixed-price');
  if (fixedBlock) {
    const fp = _float(_text(fixedBlock, 'amount'));
    if (fp != null) {
      tiers.push({ threshold: 0, discountType: 'fixed-price', discountValue: fp });
      return tiers;
    }
  }

  return tiers;
}

// ─── Lifecycle extraction ────────────────────────────────────────────────────

function _extractLifecycle(promBlock) {
  return {
    enabled:                    _bool(_text(promBlock, 'enabled'))                     ?? true,
    archived:                   _bool(_text(promBlock, 'archived'))                    ?? false,
    searchable:                 _bool(_text(promBlock, 'searchable'))                  ?? true,
    refinable:                  _bool(_text(promBlock, 'refinable'))                   ?? true,
    preventRequalifying:        _bool(_text(promBlock, 'prevent-requalifying'))        ?? false,
    prorateAcrossEligibleItems: _bool(_text(promBlock, 'prorate-across-eligible-items')) ?? false,
  };
}

// ─── Category condition extraction ───────────────────────────────────────────

function _extractCategoryCondition(block, catalogId = 'siteCatalog_ToryUS') {
  if (!block) return null;
  const categoryIds = _allText(block, 'category-id');
  if (!categoryIds.length) return null;
  return { catalogId, operator: 'is equal', categoryIds };
}

function _buildConditionGroups(xml, sectionTag) {
  const sectionBlock = _extractBlock(xml, sectionTag);
  if (!sectionBlock) return null;
  const catCond = _extractCategoryCondition(sectionBlock);
  if (!catCond) return null;
  return { conditionGroups: [{ categoryCondition: catCond }] };
}

// ─── Shipping method extraction ───────────────────────────────────────────────

function _extractShippingOptions(xml) {
  const methodIds = _allText(xml, 'shipping-method-id');
  const disableGlobal = xml.includes('disable-global-excluded-products="true"');
  const upsellMatch = xml.match(/<upsell-threshold>[^<]*<amount>([^<]+)<\/amount>/i);
  const upsellThreshold = upsellMatch ? _float(upsellMatch[1]) : null;
  return { methodIds, disableGlobalExcludedProducts: disableGlobal, upsellThreshold };
}

// ─── Campaign / Assignment extraction ────────────────────────────────────────

function _extractCampaign(xml) {
  const block = _extractBlock(xml, 'campaign');
  if (!block) return null;
  const id      = _attr(block, 'campaign', 'campaign-id');
  const enabled = _bool(_text(block, 'enabled')) ?? true;
  const scope   = _text(block, 'scope') || 'online';
  const startDate = _text(block, 'start-date');
  const endDate   = _text(block, 'end-date');
  const groupIds  = _allText(block, 'customer-group-id');

  const campaign = { id, enabled, scope };
  if (startDate) campaign.startDate = startDate;
  if (endDate)   campaign.endDate   = endDate;
  if (groupIds.length) campaign.customerGroups = { groupIds };
  return campaign;
}

function _extractAssignment(xml) {
  const block = _extractBlock(xml, 'promotion-campaign-assignment') || _extractBlock(xml, 'assignment');
  if (!block) return null;
  const coupons = _allText(block, 'coupon-id');
  const startDate = _text(block, 'start-date');
  const endDate   = _text(block, 'end-date');

  const assignment = {};
  if (coupons.length) assignment.activationCoupons = coupons;
  if (startDate || endDate) {
    assignment.schedule = {};
    if (startDate) assignment.schedule.startDate = startDate;
    if (endDate)   assignment.schedule.endDate   = endDate;
  }
  return Object.keys(assignment).length ? assignment : null;
}

// ─── Exclusivity extraction ──────────────────────────────────────────────────

function _extractExclusivity(xml) {
  const ex = _attr(xml, 'promotion', 'exclusivity');
  if (ex === 'class')  return 'class';
  if (ex === 'global') return 'global';
  return 'no';
}

// ─── Discount condition type ─────────────────────────────────────────────────

function _discountConditionType(ruleType) {
  if (ruleType === 'order')    return 'order-total';
  if (ruleType === 'shipping') return 'shipment-total';
  return 'product-amount';
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Parse an SFCC promotion XML string into a PromotionDocumentV2 object.
 *
 * @param {string} xml — raw SFCC promotion XML
 * @returns {{
 *   document: PromotionDocumentV2,
 *   warnings: string[],
 *   fieldMap: object    — maps each extracted field to its XML source element
 * }}
 */
function importXml(xml) {
  if (!xml || typeof xml !== 'string') {
    throw new Error('importXml requires a non-empty XML string');
  }

  const warnings = [];
  const fieldMap = {};

  const promBlock = _extractBlock(xml, 'promotion') || xml;
  const ruleType  = _detectRuleType(xml);

  fieldMap.ruleType = `<${ruleType}-promotion-rule>`;

  const promotionId = _attr(xml, 'promotion', 'promotion-id') || 'imported-promotion';
  fieldMap.promotionId = 'promotion@promotion-id';

  const name = _text(xml, 'name') || promotionId;
  fieldMap.name = '<name>';

  const lifecycle  = _extractLifecycle(promBlock);
  const exclusivity = _extractExclusivity(xml);
  const tiers      = _extractTiers(xml);
  if (!tiers.length) {
    tiers.push({ threshold: 0, discountType: 'percentage', discountValue: 0 });
    warnings.push('Could not extract discount value from XML — defaulted to 0% off.');
  }
  fieldMap.discounts = 'discount rule elements';

  const qualifyingProducts = _buildConditionGroups(xml, 'qualifying-products');
  const excludedProducts   = _buildConditionGroups(xml, 'excluded-products');
  const shippingOptions    = ruleType === 'shipping' ? _extractShippingOptions(xml) : null;
  const campaign   = _extractCampaign(xml);
  const assignment = _extractAssignment(xml);

  // Global settings (extract from global-promotions-settings if present)
  const globalBlock  = _extractBlock(xml, 'global-promotion-excluded-products') || '';
  const excludedCats = _allText(globalBlock, 'category-id');

  const globalSettings = {
    catalogId: _attr(xml, 'qualifier', 'catalog-id') || 'siteCatalog_ToryUS',
    excludedCategoryIds: excludedCats.length ? excludedCats : ['Exclusions-Always'],
    excludedProductOptionIds: _allText(xml, 'product-option-id'),
  };

  const promotion = {
    id: promotionId,
    name,
    lifecycle,
    exclusivity,
    ruleType,
    discountConditionType: _discountConditionType(ruleType),
    discounts: tiers,
    qualifyingProducts: qualifyingProducts || {
      conditionGroups: [{
        categoryCondition: {
          catalogId: globalSettings.catalogId,
          operator: 'is equal',
          categoryIds: ['all-products'],
        },
      }],
    },
    customAttributes: { gwp: false, isExcludeTranslate: false },
  };

  if (excludedProducts) promotion.excludedProducts = excludedProducts;
  // Only attach shippingRuleOptions with real values (omit null upsellThreshold)
  if (shippingOptions) {
    const opts = { methodIds: shippingOptions.methodIds, disableGlobalExcludedProducts: shippingOptions.disableGlobalExcludedProducts };
    if (shippingOptions.upsellThreshold != null) opts.upsellThreshold = shippingOptions.upsellThreshold;
    promotion.shippingRuleOptions = opts;
  }

  const doc = { globalSettings, promotion };
  if (campaign)   doc.campaign   = campaign;
  if (assignment) doc.assignment = assignment;

  return { document: doc, warnings, fieldMap };
}

module.exports = { importXml };
