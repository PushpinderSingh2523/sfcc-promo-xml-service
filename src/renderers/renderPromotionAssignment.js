'use strict';

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

function validate(assignmentSlot) {
  if (!assignmentSlot || typeof assignmentSlot !== 'object') {
    throw new Error('assignmentSlot must be a non-null object');
  }

  const fs = assignmentSlot.frozenStructure;
  const ef = assignmentSlot.editableFields;

  if (!fs || typeof fs !== 'object') {
    throw new Error('assignmentSlot.frozenStructure is required');
  }
  if (!ef || typeof ef !== 'object') {
    throw new Error('assignmentSlot.editableFields is required');
  }
  if (!ef.promotionId || typeof ef.promotionId !== 'string') {
    throw new Error('assignmentSlot.editableFields.promotionId must be a non-empty string');
  }
  if (!ef.campaignId || typeof ef.campaignId !== 'string') {
    throw new Error('assignmentSlot.editableFields.campaignId must be a non-empty string');
  }
  if (!fs.qualifiers || typeof fs.qualifiers !== 'object') {
    throw new Error('assignmentSlot.frozenStructure.qualifiers is required');
  }
  if (typeof fs.rank !== 'number') {
    throw new Error('assignmentSlot.frozenStructure.rank must be a number');
  }
  if (typeof fs.hasStartDate !== 'boolean') {
    throw new Error('assignmentSlot.frozenStructure.hasStartDate must be a boolean');
  }
  if (typeof fs.hasEndDate !== 'boolean') {
    throw new Error('assignmentSlot.frozenStructure.hasEndDate must be a boolean');
  }
  if (fs.hasStartDate && (ef.startDate === null || ef.startDate === undefined)) {
    throw new Error('assignmentSlot.editableFields.startDate is required when hasStartDate=true');
  }
  if (fs.hasEndDate && (ef.endDate === null || ef.endDate === undefined)) {
    throw new Error('assignmentSlot.editableFields.endDate is required when hasEndDate=true');
  }
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

/**
 * Render a <promotion-campaign-assignment> element from a blueprint assignmentSlot.
 *
 * Canonical element ordering (sourced from real SFCC BM exports):
 *   1. <qualifiers match-mode="...">
 *        Sub-elements in source order: customer-groups/, source-codes/, coupons/
 *        (each rendered only when its presence flag is true in frozenStructure)
 *   2. <coupons>                                — if editableFields.couponIds != null
 *        <coupon coupon-id="..."/>
 *   3. <customer-groups match-mode="...">       — if frozenStructure.customerGroups != null
 *        <customer-group group-id="..."/>
 *   4. <rank>...</rank>
 *   5. <schedule>                               — if hasStartDate or hasEndDate is true
 *        <start-date>...</start-date>           — only when hasStartDate=true
 *        <end-date>...</end-date>               — only when hasEndDate=true
 *
 * Presence/absence of each block is dictated entirely by the frozenStructure.
 * A null or absent value in editableFields means the corresponding XML element
 * is omitted — not replaced with an empty placeholder.
 *
 * @param {object} assignmentSlot - Blueprint assignmentSlot object
 * @returns {string} XML string for the <promotion-campaign-assignment> element
 */
function renderPromotionAssignment(assignmentSlot) {
  validate(assignmentSlot);

  const { frozenStructure: fs, editableFields: ef } = assignmentSlot;
  const qual = fs.qualifiers;
  const lines = [];

  // ── Opening tag ───────────────────────────────────────────────────────────
  lines.push(
    `    <promotion-campaign-assignment` +
    ` promotion-id="${escapeXml(ef.promotionId)}"` +
    ` campaign-id="${escapeXml(ef.campaignId)}">`
  );

  // ── <qualifiers> ──────────────────────────────────────────────────────────
  lines.push(`        <qualifiers match-mode="${escapeXml(qual.matchMode)}">`);
  if (qual.hasCustomerGroups) lines.push(`            <customer-groups/>`);
  if (qual.hasSourceCodes)    lines.push(`            <source-codes/>`);
  if (qual.hasCoupons)        lines.push(`            <coupons/>`);
  lines.push(`        </qualifiers>`);

  // ── <coupons> outer block ─────────────────────────────────────────────────
  // Present when the assignment has actual coupon codes (not just the qualifier presence flag).
  if (ef.couponIds !== null && ef.couponIds !== undefined) {
    lines.push(`        <coupons>`);
    ef.couponIds.forEach(couponId => {
      lines.push(`            <coupon coupon-id="${escapeXml(couponId)}"/>`);
    });
    lines.push(`        </coupons>`);
  }

  // ── <customer-groups> outer block ─────────────────────────────────────────
  // Present only when the frozen structure recorded a customer-groups block
  // outside of the qualifiers element.
  if (fs.customerGroups !== null && fs.customerGroups !== undefined) {
    const cg = fs.customerGroups;
    lines.push(`        <customer-groups match-mode="${escapeXml(cg.matchMode)}">`);
    cg.groupIds.forEach(groupId => {
      lines.push(`            <customer-group group-id="${escapeXml(groupId)}"/>`);
    });
    lines.push(`        </customer-groups>`);
  }

  // ── <rank> ────────────────────────────────────────────────────────────────
  lines.push(`        <rank>${fs.rank}</rank>`);

  // ── <schedule> ────────────────────────────────────────────────────────────
  // Rendered only when at least one date was present in the source export.
  if (fs.hasStartDate || fs.hasEndDate) {
    lines.push(`        <schedule>`);
    if (fs.hasStartDate) {
      lines.push(`            <start-date>${escapeXml(ef.startDate)}</start-date>`);
    }
    if (fs.hasEndDate) {
      lines.push(`            <end-date>${escapeXml(ef.endDate)}</end-date>`);
    }
    lines.push(`        </schedule>`);
  }

  lines.push(`    </promotion-campaign-assignment>`);

  return lines.join('\n');
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { renderPromotionAssignment };
