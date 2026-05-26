'use strict';

// ─── Dependencies ─────────────────────────────────────────────────────────────

const {
  REGISTRY,
  getField,
  getEditableFields,
} = require('../fieldRegistry/sasEditableFieldRegistry');

// ─── Rule builders ────────────────────────────────────────────────────────────

/**
 * @typedef {object} ValidationRule
 * @property {string} rule     — Rule identifier (required, minLength, maxLength, ...)
 * @property {*}      [value]  — Rule parameter (e.g. 1 for minLength: 1)
 * @property {string} message  — Human-readable error message for this rule
 */

/**
 * @typedef {object} FieldValidationMetadata
 * @property {string}           fieldId  — Registry field identifier
 * @property {boolean}          required — Whether the field must be non-empty
 * @property {string}           type     — Field type from registry
 * @property {ValidationRule[]} rules    — Ordered list of declarative validation rules
 */

// ─── Individual rule derivers ─────────────────────────────────────────────────

/**
 * Derive a ValidationRule[] from a registry validation spec object.
 *
 * Supported spec keys:
 *   required    — always added when registry entry.required === true
 *   minLength   — minimum string length
 *   maxLength   — maximum string length
 *   pattern     — regex pattern string
 *   min         — minimum numeric value
 *   max         — maximum numeric value
 *   type        — 'integer' enforces integer-only check
 *   format      — 'iso8601' enforces ISO-8601 datetime format
 *   enum        — array of allowed string values
 *   minItems    — minimum array length
 *   items       — object describing per-item constraints (creates nested item rules)
 *
 * @param {object}  entry     — Full registry entry
 * @param {object}  spec      — entry.validation object
 * @param {string}  prefix    — Label prefix for error messages (defaults to entry.label)
 * @returns {ValidationRule[]}
 */
function deriveRules(entry, spec, prefix) {
  const label = prefix || entry.label;
  const rules = [];

  if (entry.required) {
    rules.push({
      rule:    'required',
      message: `${label} is required`,
    });
  }

  if (spec === null || spec === undefined) return rules;

  if (spec.minLength !== undefined) {
    rules.push({
      rule:    'minLength',
      value:   spec.minLength,
      message: `${label} must be at least ${spec.minLength} character${spec.minLength === 1 ? '' : 's'} long`,
    });
  }

  if (spec.maxLength !== undefined) {
    rules.push({
      rule:    'maxLength',
      value:   spec.maxLength,
      message: `${label} must not exceed ${spec.maxLength} characters`,
    });
  }

  if (spec.pattern !== undefined) {
    rules.push({
      rule:    'pattern',
      value:   spec.pattern,
      message: `${label} contains invalid characters`,
    });
  }

  if (spec.type === 'integer') {
    rules.push({
      rule:    'integer',
      message: `${label} must be a whole number`,
    });
  }

  if (spec.min !== undefined) {
    rules.push({
      rule:    'min',
      value:   spec.min,
      message: `${label} must be at least ${spec.min}`,
    });
  }

  if (spec.max !== undefined) {
    rules.push({
      rule:    'max',
      value:   spec.max,
      message: `${label} must not exceed ${spec.max}`,
    });
  }

  if (spec.format === 'iso8601') {
    rules.push({
      rule:    'iso8601',
      message: `${label} must be a valid ISO-8601 date/time string (e.g. "2026-06-15T04:00:00.000Z")`,
    });
  }

  if (Array.isArray(spec.enum)) {
    rules.push({
      rule:    'enum',
      value:   spec.enum,
      message: `${label} must be one of: ${spec.enum.join(', ')}`,
    });
  }

  if (spec.type === 'array' || spec.minItems !== undefined) {
    if (spec.minItems !== undefined) {
      rules.push({
        rule:    'minItems',
        value:   spec.minItems,
        message: `${label} must contain at least ${spec.minItems} item${spec.minItems === 1 ? '' : 's'}`,
      });
    }

    // Per-item constraints
    if (spec.items !== undefined) {
      const itemSpec = spec.items;
      if (itemSpec.type === 'string' || itemSpec.minLength !== undefined) {
        if (itemSpec.minLength !== undefined) {
          rules.push({
            rule:    'itemMinLength',
            value:   itemSpec.minLength,
            message: `Each item in ${label} must be at least ${itemSpec.minLength} character${itemSpec.minLength === 1 ? '' : 's'} long`,
          });
        }
        if (itemSpec.maxLength !== undefined) {
          rules.push({
            rule:    'itemMaxLength',
            value:   itemSpec.maxLength,
            message: `Each item in ${label} must not exceed ${itemSpec.maxLength} characters`,
          });
        }
      }

      // discountEntryArray items: { threshold: {...}, discountValue: {...} }
      if (itemSpec.threshold !== undefined) {
        rules.push({
          rule:    'itemThresholdMin',
          value:   itemSpec.threshold.min,
          message: `Each threshold in ${label} must be at least ${itemSpec.threshold.min}`,
        });
      }
      if (itemSpec.discountValue !== undefined) {
        rules.push({
          rule:    'itemDiscountValueMin',
          value:   itemSpec.discountValue.min,
          message: `Each discount value in ${label} must be at least ${itemSpec.discountValue.min}`,
        });
      }
    }
  }

  return rules;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build validation metadata for a single field by its fieldId.
 *
 * @param {string} fieldId
 * @returns {FieldValidationMetadata|null} null if fieldId not found in registry
 */
function buildFieldValidationMetadata(fieldId) {
  const entry = getField(fieldId);
  if (!entry) return null;

  return {
    fieldId:  entry.fieldId,
    required: entry.required,
    type:     entry.type,
    rules:    deriveRules(entry, entry.validation),
  };
}

/**
 * Build validation metadata for every editable field in the registry.
 *
 * Returns an ordered array (following GROUP_ORDER within registry definition
 * order) of FieldValidationMetadata objects for all fields where editable=true
 * and validation is non-null.
 *
 * This is declarative only — no runtime validation logic is executed.
 *
 * @returns {FieldValidationMetadata[]}
 */
function buildAllValidationMetadata() {
  return getEditableFields()
    .filter(entry => entry.validation !== null)
    .map(entry => ({
      fieldId:  entry.fieldId,
      required: entry.required,
      type:     entry.type,
      rules:    deriveRules(entry, entry.validation),
    }));
}

/**
 * Build validation metadata for a set of ClassifiedFields produced by
 * classifyEditableFields.  Only editable fields with non-null validation specs
 * are included.
 *
 * @param {object[]} classifiedFields — output of classifyEditableFields.orderedQuestions
 * @returns {FieldValidationMetadata[]}
 */
function buildValidationMetadataFromClassified(classifiedFields) {
  if (!Array.isArray(classifiedFields)) {
    throw new Error('classifiedFields must be an array');
  }

  return classifiedFields
    .filter(cf => cf.registryEntry.editable && cf.registryEntry.validation !== null)
    .map(cf => ({
      fieldId:  cf.fieldId,
      path:     cf.path,
      required: cf.registryEntry.required,
      type:     cf.registryEntry.type,
      rules:    deriveRules(cf.registryEntry, cf.registryEntry.validation),
    }));
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  buildFieldValidationMetadata,
  buildAllValidationMetadata,
  buildValidationMetadataFromClassified,
  // Internal helper exported for unit testing
  _internals: { deriveRules },
};
