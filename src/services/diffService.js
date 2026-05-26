'use strict';

/**
 * diffService.js
 *
 * Compares two SFCC promotion XML strings or two PromotionDocumentV2 objects
 * and produces a structured diff for approvals and change review.
 *
 * Output:
 * {
 *   hasChanges: boolean,
 *   summary: string,           // human-readable change summary
 *   changes: {
 *     discounts:   DiffEntry[],
 *     schedule:    DiffEntry[],
 *     audience:    DiffEntry[],
 *     products:    DiffEntry[],
 *     exclusions:  DiffEntry[],
 *     shipping:    DiffEntry[],
 *     lifecycle:   DiffEntry[],
 *     coupons:     DiffEntry[],
 *   }
 * }
 *
 * DiffEntry: { field, oldValue, newValue, changeType: 'added'|'removed'|'changed' }
 */

// ─── XML extraction helpers ──────────────────────────────────────────────────

/**
 * Extract a simple scalar value from XML using a regex pattern.
 */
function _xmlExtract(xml, pattern) {
  const m = xml.match(pattern);
  return m ? m[1] : null;
}

/**
 * Extract all matches from XML using a global regex.
 */
function _xmlExtractAll(xml, pattern) {
  return [...xml.matchAll(pattern)].map(m => m[1]);
}

/**
 * Parse key fields from SFCC promotion XML into a comparable flat object.
 */
function parseXmlToFlat(xml) {
  if (!xml || typeof xml !== 'string') return {};

  return {
    promotionId:  _xmlExtract(xml, /promotion-id="([^"]+)"/),
    ruleType:     xml.includes('<product-promotion-rule')  ? 'product'
                : xml.includes('<order-promotion-rule')    ? 'order'
                : xml.includes('<shipping-promotion-rule') ? 'shipping'
                : 'unknown',
    discounts: _xmlExtractAll(xml, /<percentage>([^<]+)<\/percentage>|<amount>([^<]+)<\/amount>/g)
                 .concat(_xmlExtractAll(xml, /<free\/>/g).map(() => 'free')),
    thresholds:    _xmlExtractAll(xml, /<threshold>\s*<amount>([^<]+)<\/amount>/g),
    startDate:    _xmlExtract(xml, /<start-date>([^<]+)<\/start-date>/),
    endDate:      _xmlExtract(xml, /<end-date>([^<]+)<\/end-date>/),
    customerGroups: _xmlExtractAll(xml, /<customer-group-id>([^<]+)<\/customer-group-id>/g),
    coupons:       _xmlExtractAll(xml, /<coupon-id>([^<]+)<\/coupon-id>/g),
    categories:    _xmlExtractAll(xml, /<category-id>([^<]+)<\/category-id>/g),
    shippingMethods: _xmlExtractAll(xml, /<shipping-method-id>([^<]+)<\/shipping-method-id>/g),
    enabled:      _xmlExtract(xml, /<enabled>([^<]+)<\/enabled>/),
    archived:     _xmlExtract(xml, /<archived>([^<]+)<\/archived>/),
  };
}

/**
 * Flatten a PromotionDocumentV2 to the same comparable shape.
 */
function docToFlat(doc) {
  if (!doc || !doc.promotion) return {};
  const p = doc.promotion;
  const a = doc.assignment || {};
  const c = doc.campaign || {};

  return {
    promotionId:  p.id,
    ruleType:     p.ruleType,
    discounts:    (p.discounts || []).map(t =>
      t.discountType === 'percentage'    ? `${t.discountValue}%`
      : t.discountType === 'amount'      ? `$${t.discountValue}`
      : t.discountType === 'free-shipping' ? 'free'
      : `${t.discountType}:${t.discountValue}`
    ),
    thresholds:   (p.discounts || []).filter(t => t.threshold > 0).map(t => String(t.threshold)),
    startDate:    c.startDate || a.schedule?.startDate || null,
    endDate:      c.endDate   || a.schedule?.endDate   || null,
    customerGroups: c.customerGroups?.groupIds || [],
    coupons:      a.activationCoupons || [],
    categories:   (p.qualifyingProducts?.conditionGroups || []).flatMap(g => g.categoryCondition?.categoryIds || []),
    shippingMethods: p.shippingRuleOptions?.methodIds || [],
    enabled:      String(p.lifecycle?.enabled ?? true),
    archived:     String(p.lifecycle?.archived ?? false),
  };
}

// ─── Diff helpers ─────────────────────────────────────────────────────────────

function _diffScalar(field, oldVal, newVal, out) {
  if (oldVal === newVal) return;
  if (oldVal == null && newVal != null) {
    out.push({ field, oldValue: null, newValue: newVal, changeType: 'added' });
  } else if (oldVal != null && newVal == null) {
    out.push({ field, oldValue: oldVal, newValue: null, changeType: 'removed' });
  } else {
    out.push({ field, oldValue: oldVal, newValue: newVal, changeType: 'changed' });
  }
}

function _diffArray(field, oldArr, newArr, out) {
  const os = new Set(oldArr);
  const ns = new Set(newArr);
  const added   = newArr.filter(x => !os.has(x));
  const removed = oldArr.filter(x => !ns.has(x));
  if (added.length)   out.push({ field, oldValue: null,   newValue: added,   changeType: 'added' });
  if (removed.length) out.push({ field, oldValue: removed, newValue: null,   changeType: 'removed' });
}

// ─── Main diff function ───────────────────────────────────────────────────────

/**
 * Compare two promotions. Accepts either XML strings or PromotionDocumentV2 objects.
 *
 * @param {string|object} oldPromo — XML string or PromotionDocumentV2
 * @param {string|object} newPromo — XML string or PromotionDocumentV2
 * @returns {object} diff result
 */
function diff(oldPromo, newPromo) {
  const oldFlat = typeof oldPromo === 'string' ? parseXmlToFlat(oldPromo) : docToFlat(oldPromo);
  const newFlat = typeof newPromo === 'string' ? parseXmlToFlat(newPromo) : docToFlat(newPromo);

  const changes = {
    discounts:  [],
    schedule:   [],
    audience:   [],
    products:   [],
    exclusions: [],
    shipping:   [],
    lifecycle:  [],
    coupons:    [],
    identity:   [],
  };

  _diffScalar('promotionId', oldFlat.promotionId, newFlat.promotionId, changes.identity);
  _diffScalar('ruleType',    oldFlat.ruleType,    newFlat.ruleType,    changes.identity);
  _diffArray('discounts',    oldFlat.discounts    || [], newFlat.discounts    || [], changes.discounts);
  _diffArray('thresholds',   oldFlat.thresholds   || [], newFlat.thresholds   || [], changes.discounts);
  _diffScalar('startDate',   oldFlat.startDate,   newFlat.startDate,   changes.schedule);
  _diffScalar('endDate',     oldFlat.endDate,     newFlat.endDate,     changes.schedule);
  _diffArray('customerGroups', oldFlat.customerGroups || [], newFlat.customerGroups || [], changes.audience);
  _diffArray('coupons',      oldFlat.coupons      || [], newFlat.coupons      || [], changes.coupons);
  _diffArray('categories',   oldFlat.categories   || [], newFlat.categories   || [], changes.products);
  _diffArray('shippingMethods', oldFlat.shippingMethods || [], newFlat.shippingMethods || [], changes.shipping);
  _diffScalar('enabled',     oldFlat.enabled,     newFlat.enabled,     changes.lifecycle);
  _diffScalar('archived',    oldFlat.archived,    newFlat.archived,    changes.lifecycle);

  const allChanges = Object.values(changes).flat();
  const hasChanges = allChanges.length > 0;

  // Human-readable summary
  const summaryParts = [];
  if (changes.identity.length)  summaryParts.push(`identity (${changes.identity.map(c => c.field).join(', ')})`);
  if (changes.discounts.length)  summaryParts.push('discounts/thresholds');
  if (changes.schedule.length)   summaryParts.push('schedule dates');
  if (changes.audience.length)   summaryParts.push('customer audience');
  if (changes.products.length)   summaryParts.push('qualifying products');
  if (changes.exclusions.length) summaryParts.push('exclusions');
  if (changes.shipping.length)   summaryParts.push('shipping methods');
  if (changes.lifecycle.length)  summaryParts.push('lifecycle flags');
  if (changes.coupons.length)    summaryParts.push('coupon codes');

  const summary = hasChanges
    ? `${allChanges.length} change(s) detected in: ${summaryParts.join(', ')}.`
    : 'No changes detected between the two promotions.';

  return { hasChanges, summary, changes };
}

module.exports = { diff, parseXmlToFlat, docToFlat };
