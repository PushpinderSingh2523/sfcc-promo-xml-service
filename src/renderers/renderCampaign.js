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

function validate(campaignSlot) {
  if (!campaignSlot || typeof campaignSlot !== 'object') {
    throw new Error('campaignSlot must be a non-null object');
  }
  if (!campaignSlot.frozenStructure || typeof campaignSlot.frozenStructure !== 'object') {
    throw new Error('campaignSlot.frozenStructure is required');
  }
  if (!campaignSlot.editableFields || typeof campaignSlot.editableFields !== 'object') {
    throw new Error('campaignSlot.editableFields is required');
  }
  if (!campaignSlot.editableFields.campaignId ||
      typeof campaignSlot.editableFields.campaignId !== 'string') {
    throw new Error('campaignSlot.editableFields.campaignId must be a non-empty string');
  }
  if (typeof campaignSlot.frozenStructure.enabledFlag !== 'boolean') {
    throw new Error('campaignSlot.frozenStructure.enabledFlag must be a boolean');
  }
  if (!campaignSlot.frozenStructure.campaignScope ||
      typeof campaignSlot.frozenStructure.campaignScope !== 'object') {
    throw new Error('campaignSlot.frozenStructure.campaignScope is required');
  }
}

// ─── Renderer ─────────────────────────────────────────────────────────────────

/**
 * Render a <campaign> element from a blueprint campaignSlot.
 *
 * Output element ordering matches the SFCC BM export canonical order:
 *   <campaign campaign-id="...">
 *     <enabled-flag>...</enabled-flag>
 *     <campaign-scope>
 *       <applicable-online/>
 *     </campaign-scope>
 *   </campaign>
 *
 * The rendered string begins with a 4-space indent (top-level element
 * position inside <promotions>) and uses 4-space increments throughout.
 *
 * @param {object} campaignSlot - Blueprint campaignSlot object
 * @returns {string} XML string for the <campaign> element (no trailing newline)
 */
function renderCampaign(campaignSlot) {
  validate(campaignSlot);

  const { frozenStructure: fs, editableFields: ef } = campaignSlot;
  const lines = [];

  lines.push(`    <campaign campaign-id="${escapeXml(ef.campaignId)}">`);
  lines.push(`        <enabled-flag>${fs.enabledFlag ? 'true' : 'false'}</enabled-flag>`);
  lines.push(`        <campaign-scope>`);

  if (fs.campaignScope.applicableOnline) {
    lines.push(`            <applicable-online/>`);
  }

  lines.push(`        </campaign-scope>`);
  lines.push(`    </campaign>`);

  return lines.join('\n');
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { renderCampaign };
