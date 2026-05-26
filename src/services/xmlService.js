const { create } = require('xmlbuilder2');

/**
 * Deterministically builds SFCC-compliant promotion XML from a validated intent object.
 * No AI involved — pure data transformation.
 */
function buildXml(data) {
  const root = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('promotions', {
      xmlns: 'http://www.demandware.com/xml/impex/promotion/2008-01-31',
    });

  const promo = root.ele('promotion', {
    'campaign-id': data.campaignId,
    'enabled': String(data.enabled !== false),
    'exclusivity': data.exclusivity || 'no',
    'id': data.id,
  });

  promo.ele('name').txt(data.name);

  if (data.description) {
    promo.ele('description').txt(data.description);
  }

  // Discount block
  const discount = promo.ele('discount');
  _buildDiscount(discount, data);

  // Eligibility / conditions
  const eligibility = promo.ele('eligibility');
  _buildEligibility(eligibility, data);

  // Qualifying products
  if (data.qualifyingProductIds && data.qualifyingProductIds.length > 0) {
    const qp = promo.ele('qualifying-products');
    data.qualifyingProductIds.forEach(pid => qp.ele('product-id').txt(pid));
  }

  // Target products
  if (data.targetProductIds && data.targetProductIds.length > 0) {
    const tp = promo.ele('discounted-products');
    data.targetProductIds.forEach(pid => tp.ele('product-id').txt(pid));
  }

  promo.ele('start-date').txt(data.startDate);
  promo.ele('end-date').txt(data.endDate);

  return root.end({ prettyPrint: true });
}

function _buildDiscount(node, data) {
  switch (data.discountType) {
    case 'percentage':
      node.ele('order-discount').ele('discount').ele('percentage').txt(String(data.discountValue));
      break;
    case 'amount-off':
      node.ele('order-discount').ele('discount').ele('amount').txt(String(data.discountValue));
      break;
    case 'fixed-price':
      node.ele('product-discount').ele('discount').ele('fixed-price').txt(String(data.discountValue));
      break;
    case 'free-shipping':
      node.ele('shipping-discount').ele('discount').ele('fixed-price').txt('0');
      break;
    case 'bonus-product':
      node.ele('product-discount').ele('discount').ele('bonus-choice-count').txt('1');
      break;
    default:
      node.ele('order-discount').ele('discount').ele('percentage').txt(String(data.discountValue || 0));
  }
}

function _buildEligibility(node, data) {
  if (data.conditionType === 'none' || !data.conditionType) {
    node.ele('order-condition');
    return;
  }

  if (data.conditionType === 'coupon') {
    node.ele('coupon-condition').ele('coupon-code').txt(data.couponCode || '');
    return;
  }

  const orderCond = node.ele('order-condition');
  if (data.conditionType === 'minimum-amount') {
    orderCond.ele('subtotal-condition')
      .ele('subtotal').att('operator', 'greater-than-or-equal').txt(String(data.conditionValue));
  } else if (data.conditionType === 'minimum-quantity') {
    orderCond.ele('quantity-condition')
      .ele('quantity').att('operator', 'greater-than-or-equal').txt(String(data.conditionValue));
  }
}

module.exports = { buildXml };
