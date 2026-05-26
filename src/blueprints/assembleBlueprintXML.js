'use strict';

// ─── Dependencies ─────────────────────────────────────────────────────────────

const { renderCampaign }             = require('../renderers/renderCampaign');
const { renderBlueprintPromotion }   = require('../renderers/renderBlueprintPromotion');
const { renderPromotionAssignment }  = require('../renderers/renderPromotionAssignment');

// ─── Constants ────────────────────────────────────────────────────────────────

const SFCC_NS = 'http://www.demandware.com/xml/impex/promotion/2008-01-31';

/**
 * Static <global-promotion-settings> block.
 *
 * This is identical across all real SFCC SAS exports and is reproduced
 * verbatim by the assembler.  It must never be parameterised.
 *
 * Source of truth: Summer_SAS.xml (2025 enterprise export).
 */
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

// ─── Validation ───────────────────────────────────────────────────────────────

function validate(blueprint) {
  if (!blueprint || typeof blueprint !== 'object') {
    throw new Error('blueprint must be a non-null object');
  }
  if (!blueprint.campaignSlot) {
    throw new Error('blueprint.campaignSlot is required');
  }
  if (!Array.isArray(blueprint.promotionSlots) || blueprint.promotionSlots.length === 0) {
    throw new Error('blueprint.promotionSlots must be a non-empty array');
  }
  if (!Array.isArray(blueprint.assignmentSlots) || blueprint.assignmentSlots.length === 0) {
    throw new Error('blueprint.assignmentSlots must be a non-empty array');
  }
}

// ─── Assembler ────────────────────────────────────────────────────────────────

/**
 * Assemble a complete SFCC promotion XML document from a blueprint record.
 *
 * Assembly order matches the SFCC BM canonical export structure:
 *   1. XML declaration
 *   2. <promotions xmlns="...">
 *   3. <campaign>
 *   4. <global-promotion-settings>   (static boilerplate — never parameterised)
 *   5. <promotion>  × N              (in promotionSlots source order)
 *   6. <promotion-campaign-assignment> × N (in assignmentSlots source order)
 *   7. </promotions>
 *
 * The assembler is a mechanical concatenator only.  It:
 *   - Does NOT mutate renderer outputs
 *   - Does NOT inject additional nodes
 *   - Does NOT reorder outputs
 *   - Does NOT modify whitespace inside renderer outputs
 *   - Does NOT call any renderer more than once per slot
 *
 * @param {object} blueprint - Canonical SAS blueprint record
 * @returns {string} Complete XML document string
 */
function assembleBlueprintXML(blueprint) {
  validate(blueprint);

  const sections = [];

  // 1. XML declaration
  sections.push('<?xml version="1.0" encoding="UTF-8"?>');

  // 2. Root element
  sections.push(`<promotions xmlns="${SFCC_NS}">`);

  // 3. Campaign
  sections.push(renderCampaign(blueprint.campaignSlot));

  // 4. Global promotion settings (static)
  sections.push(GLOBAL_PROMOTION_SETTINGS);

  // 5. Promotions in source order
  blueprint.promotionSlots.forEach(slot => {
    sections.push(renderBlueprintPromotion(slot));
  });

  // 6. Assignments in source order
  blueprint.assignmentSlots.forEach(slot => {
    sections.push(renderPromotionAssignment(slot));
  });

  // 7. Close root
  sections.push('</promotions>');

  return sections.join('\n\n') + '\n';
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { assembleBlueprintXML, GLOBAL_PROMOTION_SETTINGS };
