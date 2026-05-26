/**
 * Converts a string to a URL-safe kebab-case slug (max 50 chars).
 */
function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50);
}

/**
 * Ensures a date value is a valid ISO 8601 string.
 * Passes through already-valid strings; otherwise returns today.
 */
function toISODate(value) {
  if (!value) return new Date().toISOString();
  const d = new Date(value);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/**
 * Adds `days` days to a Date and returns an ISO string.
 */
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

module.exports = { slugify, toISODate, addDays };
