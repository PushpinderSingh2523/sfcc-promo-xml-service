'use strict';

// ─── Normalization ────────────────────────────────────────────────────────────

/**
 * Apply allowed normalizations to a raw answer value.
 *
 * Allowed normalizations (exhaustive):
 *   - Trim outer whitespace on strings
 *   - Normalize line endings (\r\n → \n, \r → \n) on strings
 *   - Parse numeric strings to numbers for number fields
 *   - Parse JSON strings to arrays for array fields
 *   - Trim individual string items in string arrays
 *
 * NOT allowed:
 *   - Inferring missing values
 *   - Coercing structurally invalid values (e.g. "abc" for a number field)
 *   - Applying hidden defaults
 *   - Converting comma-separated strings to arrays (natural language)
 *
 * @param {*}      rawValue
 * @param {string} fieldType - Registry 'type' value
 * @returns {{ normalizedValue: *, normalizationApplied: boolean }}
 */
function normalizeAnswer(rawValue, fieldType) {
  if (rawValue === null || rawValue === undefined) {
    return { normalizedValue: null, normalizationApplied: false };
  }

  // ── String ──────────────────────────────────────────────────────────────
  if (fieldType === 'string' || fieldType === 'iso8601' || fieldType === 'enum') {
    if (typeof rawValue !== 'string') {
      // Accept numbers/booleans as string coercion
      const s = String(rawValue);
      const normalized = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
      return { normalizedValue: normalized, normalizationApplied: normalized !== rawValue };
    }
    const normalized = rawValue.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    return { normalizedValue: normalized, normalizationApplied: normalized !== rawValue };
  }

  // ── Number ──────────────────────────────────────────────────────────────
  if (fieldType === 'number') {
    if (typeof rawValue === 'number') {
      return { normalizedValue: rawValue, normalizationApplied: false };
    }
    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim();
      const parsed  = Number(trimmed);
      if (!Number.isNaN(parsed)) {
        return { normalizedValue: parsed, normalizationApplied: true };
      }
    }
    // Cannot normalize — return as-is; validation will reject
    return { normalizedValue: rawValue, normalizationApplied: false };
  }

  // ── Boolean ─────────────────────────────────────────────────────────────
  if (fieldType === 'boolean') {
    if (typeof rawValue === 'boolean') {
      return { normalizedValue: rawValue, normalizationApplied: false };
    }
    if (rawValue === 'true')  return { normalizedValue: true,  normalizationApplied: true };
    if (rawValue === 'false') return { normalizedValue: false, normalizationApplied: true };
    return { normalizedValue: rawValue, normalizationApplied: false };
  }

  // ── String array ─────────────────────────────────────────────────────────
  if (fieldType === 'stringArray') {
    let arr = rawValue;
    let applied = false;

    // Accept JSON string representation
    if (typeof rawValue === 'string') {
      try {
        arr = JSON.parse(rawValue);
        applied = true;
      } catch {
        return { normalizedValue: rawValue, normalizationApplied: false };
      }
    }

    if (!Array.isArray(arr)) {
      return { normalizedValue: rawValue, normalizationApplied: false };
    }

    // Trim individual string items
    const trimmed = arr.map(item =>
      typeof item === 'string' ? item.trim() : item
    );
    return { normalizedValue: trimmed, normalizationApplied: applied || JSON.stringify(trimmed) !== JSON.stringify(arr) };
  }

  // ── Discount entry array ──────────────────────────────────────────────────
  if (fieldType === 'discountEntryArray') {
    let arr = rawValue;
    let applied = false;

    if (typeof rawValue === 'string') {
      try {
        arr = JSON.parse(rawValue);
        applied = true;
      } catch {
        return { normalizedValue: rawValue, normalizationApplied: false };
      }
    }

    if (!Array.isArray(arr)) {
      return { normalizedValue: rawValue, normalizationApplied: false };
    }

    // Normalize numeric threshold/discountValue strings
    const normalized = arr.map(item => {
      if (!item || typeof item !== 'object') return item;
      return {
        threshold:     typeof item.threshold     === 'string' ? Number(item.threshold)     : item.threshold,
        discountValue: typeof item.discountValue === 'string' ? Number(item.discountValue) : item.discountValue,
      };
    });
    return { normalizedValue: normalized, normalizationApplied: applied };
  }

  // ── Fallback ─────────────────────────────────────────────────────────────
  return { normalizedValue: rawValue, normalizationApplied: false };
}

// ─── Validation rules ─────────────────────────────────────────────────────────

const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/**
 * Run declarative validation rules against a normalized value.
 *
 * @param {*}      value      — Already normalized value
 * @param {object} spec       — Registry validation spec
 * @param {string} label      — Field label for error messages
 * @param {string} fieldType  — Registry type
 * @returns {object[]} Error objects: [{ rule, message }]
 */
function runValidationSpec(value, spec, label, fieldType) {
  const errors = [];

  if (!spec) return errors;

  // ── String ──────────────────────────────────────────────────────────────
  if (typeof value === 'string') {
    if (spec.minLength !== undefined && value.length < spec.minLength) {
      errors.push({ rule: 'minLength', message: `${label} must be at least ${spec.minLength} character${spec.minLength === 1 ? '' : 's'} long` });
    }
    if (spec.maxLength !== undefined && value.length > spec.maxLength) {
      errors.push({ rule: 'maxLength', message: `${label} must not exceed ${spec.maxLength} characters` });
    }
    if (spec.pattern !== undefined) {
      try {
        if (!new RegExp(spec.pattern).test(value)) {
          errors.push({ rule: 'pattern', message: `${label} contains invalid characters` });
        }
      } catch {
        // Malformed pattern in registry — skip silently
      }
    }
    if (spec.format === 'iso8601' && !ISO8601_RE.test(value)) {
      errors.push({ rule: 'iso8601', message: `${label} must be a valid ISO-8601 date/time string (e.g. "2026-06-15T04:00:00.000Z")` });
    }
    if (Array.isArray(spec.enum) && !spec.enum.includes(value)) {
      errors.push({ rule: 'enum', message: `${label} must be one of: ${spec.enum.join(', ')}` });
    }
  }

  // ── Number ──────────────────────────────────────────────────────────────
  if (typeof value === 'number') {
    if (spec.type === 'integer' && !Number.isInteger(value)) {
      errors.push({ rule: 'integer', message: `${label} must be a whole number` });
    }
    if (spec.min !== undefined && value < spec.min) {
      errors.push({ rule: 'min', message: `${label} must be at least ${spec.min}` });
    }
    if (spec.max !== undefined && value > spec.max) {
      errors.push({ rule: 'max', message: `${label} must not exceed ${spec.max}` });
    }
  }

  // ── Array ────────────────────────────────────────────────────────────────
  if (Array.isArray(value)) {
    if (spec.minItems !== undefined && value.length < spec.minItems) {
      errors.push({ rule: 'minItems', message: `${label} must contain at least ${spec.minItems} item${spec.minItems === 1 ? '' : 's'}` });
    }

    if (spec.items) {
      const itemSpec = spec.items;

      value.forEach((item, idx) => {
        // String array items
        if (itemSpec.type === 'string' || itemSpec.minLength !== undefined) {
          if (typeof item === 'string') {
            if (itemSpec.minLength !== undefined && item.length < itemSpec.minLength) {
              errors.push({ rule: 'itemMinLength', message: `Item ${idx + 1} in ${label} is too short` });
            }
            if (itemSpec.maxLength !== undefined && item.length > itemSpec.maxLength) {
              errors.push({ rule: 'itemMaxLength', message: `Item ${idx + 1} in ${label} is too long` });
            }
          }
        }

        // Discount entry items
        if (itemSpec.threshold !== undefined) {
          if (!item || typeof item !== 'object') {
            errors.push({ rule: 'itemShape', message: `Item ${idx + 1} in ${label} must be an object with threshold and discountValue` });
          } else {
            if (typeof item.threshold !== 'number' || Number.isNaN(item.threshold)) {
              errors.push({ rule: 'itemThresholdType', message: `Item ${idx + 1} in ${label}: threshold must be a number` });
            } else if (itemSpec.threshold.min !== undefined && item.threshold < itemSpec.threshold.min) {
              errors.push({ rule: 'itemThresholdMin', message: `Item ${idx + 1} in ${label}: threshold must be at least ${itemSpec.threshold.min}` });
            }
            if (typeof item.discountValue !== 'number' || Number.isNaN(item.discountValue)) {
              errors.push({ rule: 'itemDiscountValueType', message: `Item ${idx + 1} in ${label}: discountValue must be a number` });
            } else if (itemSpec.discountValue && itemSpec.discountValue.min !== undefined && item.discountValue < itemSpec.discountValue.min) {
              errors.push({ rule: 'itemDiscountValueMin', message: `Item ${idx + 1} in ${label}: discountValue must be at least ${itemSpec.discountValue.min}` });
            }
          }
        }
      });
    }
  }

  return errors;
}

// ─── Type mismatch check ──────────────────────────────────────────────────────

/**
 * Verify that the normalized value type matches the expected field type.
 * Returns an error array if there is a fundamental type mismatch.
 */
function checkTypeMismatch(value, fieldType, label) {
  if (value === null || value === undefined) return [];

  switch (fieldType) {
    case 'number':
      if (typeof value !== 'number' || Number.isNaN(value)) {
        return [{ rule: 'type', message: `${label} must be a number` }];
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') {
        return [{ rule: 'type', message: `${label} must be true or false` }];
      }
      break;
    case 'stringArray':
    case 'discountEntryArray':
      if (!Array.isArray(value)) {
        return [{ rule: 'type', message: `${label} must be an array` }];
      }
      break;
    default:
      break;
  }
  return [];
}

// ─── isEmpty helper ───────────────────────────────────────────────────────────

function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.length === 0) return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validate a single answer against its queue item's validation spec.
 *
 * Steps:
 *   1. Normalize the raw value (trim, line endings, numeric strings, JSON arrays)
 *   2. Check required constraint
 *   3. If empty and not required: return valid with null normalizedValue
 *   4. Check type compatibility
 *   5. Run declarative validation rules from the registry spec
 *
 * @param {import('./buildQuestionQueue').QueueItem} queueItem
 * @param {*} rawAnswer — Raw value from the answering entity
 * @returns {{ valid: boolean, errors: object[], normalizedValue: * }}
 */
function validateSessionAnswer(queueItem, rawAnswer) {
  if (!queueItem || typeof queueItem !== 'object') {
    throw new Error('queueItem must be a non-null object');
  }

  const { fieldId, label, required, validation } = queueItem;
  const fieldType = queueItem.registryType || (queueItem.validation && queueItem.validation.type) || 'string';

  // Determine type from registry (we look at validation spec or use the type stored on queueItem)
  // QueueItem doesn't store 'type' from registry — infer from validation spec
  const inferredType = inferFieldType(queueItem);

  // ── Step 1: Normalize ──────────────────────────────────────────────────
  const { normalizedValue } = normalizeAnswer(rawAnswer, inferredType);

  // ── Step 2: Required check ─────────────────────────────────────────────
  if (required && isEmpty(normalizedValue)) {
    return {
      valid:          false,
      errors:         [{ rule: 'required', message: `${label} is required` }],
      normalizedValue: null,
    };
  }

  // ── Step 3: Optional + empty → valid ──────────────────────────────────
  if (!required && isEmpty(normalizedValue)) {
    return { valid: true, errors: [], normalizedValue: null };
  }

  // ── Step 4: Type mismatch ─────────────────────────────────────────────
  const typeErrors = checkTypeMismatch(normalizedValue, inferredType, label);
  if (typeErrors.length > 0) {
    return { valid: false, errors: typeErrors, normalizedValue };
  }

  // ── Step 5: Declarative validation rules ──────────────────────────────
  const ruleErrors = runValidationSpec(normalizedValue, validation, label, inferredType);

  return {
    valid:          ruleErrors.length === 0,
    errors:         ruleErrors,
    normalizedValue,
  };
}

/**
 * Infer the field type from queue item metadata.
 * QueueItem stores `validation` from the registry but not `type` directly.
 * We use a heuristic based on validation spec shape and known fieldId patterns.
 */
function inferFieldType(queueItem) {
  const { fieldId, validation } = queueItem;

  // Known array types
  if (fieldId === 'couponIds') return 'stringArray';
  if (fieldId === 'discountEntries') return 'discountEntryArray';

  // ISO-8601 format
  if (validation && validation.format === 'iso8601') return 'iso8601';

  // Enum
  if (validation && Array.isArray(validation.enum)) return 'enum';

  // Array by spec
  if (validation && validation.type === 'array') return 'stringArray';

  // Number
  if (fieldId === 'simpleDiscountValue') return 'number';

  // Default: string
  return 'string';
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  validateSessionAnswer,
  // Internal helpers exported for unit testing
  _internals: {
    normalizeAnswer,
    runValidationSpec,
    checkTypeMismatch,
    inferFieldType,
    isEmpty,
  },
};
