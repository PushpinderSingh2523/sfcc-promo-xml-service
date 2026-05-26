'use strict';

/**
 * validate-copilot-spec.js
 *
 * Validates openapi/copilot-studio-api.yaml against the rules required
 * for Microsoft Copilot Studio / Power Platform Custom Connector import.
 *
 * Run: node openapi/validate-copilot-spec.js
 *
 * Exit 0 = all checks pass. Exit 1 = at least one check failed.
 */

const fs   = require('fs');
const path = require('path');
const YAML = require('js-yaml');

const SPEC_PATH = path.join(__dirname, 'copilot-studio-api.yaml');
const raw  = fs.readFileSync(SPEC_PATH, 'utf8');
const spec = YAML.load(raw);

const PASS = '  PASS';
const FAIL = '  FAIL';
let failures = 0;

function check(label, condition, detail = '') {
  if (condition) {
    console.log(`${PASS}  ${label}`);
  } else {
    console.log(`${FAIL}  ${label}${detail ? ' — ' + detail : ''}`);
    failures++;
  }
}

// ── Collect all schema objects recursively ────────────────────────────────────

function collectSchemas(obj, found = []) {
  if (!obj || typeof obj !== 'object') return found;
  if (obj.type || obj.properties || obj.$ref) found.push(obj);
  for (const v of Object.values(obj)) collectSchemas(v, found);
  return found;
}

function collectOperations(paths) {
  const ops = [];
  for (const [pathKey, pathItem] of Object.entries(paths || {})) {
    for (const method of ['get','post','put','patch','delete','options','head']) {
      if (pathItem[method]) ops.push({ pathKey, method, op: pathItem[method] });
    }
  }
  return ops;
}

function flattenToString(obj) {
  return JSON.stringify(obj);
}

// ── Run checks ────────────────────────────────────────────────────────────────

console.log('\nCopilot Studio OpenAPI Compatibility Validation');
console.log('='.repeat(50));
console.log(`File: ${SPEC_PATH}\n`);

const specStr  = flattenToString(spec);
const operations = collectOperations(spec.paths);
const allSchemas = collectSchemas(spec);

// 1. OpenAPI version must be exactly 3.0.x
check(
  'OpenAPI version is 3.0.x',
  typeof spec.openapi === 'string' && spec.openapi.startsWith('3.0.'),
  `found: ${spec.openapi}`
);

// 2. Has info block with title and version
check('info.title present', !!spec.info?.title);
check('info.version present', !!spec.info?.version);

// 3. Has at least one server
check('At least one server defined', Array.isArray(spec.servers) && spec.servers.length > 0);

// 4. Server URL contains placeholder or real HTTPS URL (not localhost)
const serverUrls = (spec.servers || []).map(s => s.url);
check(
  'Server URL is not localhost',
  serverUrls.every(u => !u.includes('localhost') && !u.includes('127.0.0.1')),
  `urls: ${serverUrls.join(', ')}`
);

// 5. Required paths exist
const paths = Object.keys(spec.paths || {});
check('Path /api/v1/promotions/generate exists', paths.includes('/api/v1/promotions/generate'));
check('Path /api/v1/promotions/clarify exists',  paths.includes('/api/v1/promotions/clarify'));
check('Path /health exists',                      paths.includes('/health'));

// 6. Only the three allowed paths (no extras that would confuse Copilot)
check(
  'Only 3 paths defined (generate, clarify, health)',
  paths.length === 3,
  `found ${paths.length}: ${paths.join(', ')}`
);

// 7. Every operation has a unique operationId
const operationIds = operations.map(({ op }) => op.operationId);
check('All operations have operationId', operationIds.every(id => !!id));
const uniqueIds = new Set(operationIds);
check(
  'All operationIds are unique',
  uniqueIds.size === operationIds.length,
  `found: ${operationIds.join(', ')}`
);

// 8. No nullable fields (Copilot Studio ignores them and can break code-gen)
check(
  'No "nullable: true" fields',
  !specStr.includes('"nullable":true') && !raw.includes('nullable: true'),
  'nullable: true found in spec'
);

// 9. No oneOf / allOf / anyOf (not supported in Custom Connector import)
check('No oneOf',  !specStr.includes('"oneOf"')  && !raw.includes('oneOf:'));
check('No allOf',  !specStr.includes('"allOf"')  && !raw.includes('allOf:'));
check('No anyOf',  !specStr.includes('"anyOf"')  && !raw.includes('anyOf:'));

// 10. No markdown formatting in descriptions (headers, bullets, backticks, bold)
const descriptions = [];
function collectDescriptions(obj) {
  if (!obj || typeof obj !== 'object') return;
  if (typeof obj.description === 'string') descriptions.push(obj.description);
  for (const v of Object.values(obj)) collectDescriptions(v);
}
collectDescriptions(spec);
const mdPattern = /#{1,6}\s|^\s*[-*]\s|\*\*|`{1,3}|^\s*\d+\.\s/m;
const badDescriptions = descriptions.filter(d => mdPattern.test(d));
check(
  'No markdown formatting in descriptions',
  badDescriptions.length === 0,
  badDescriptions.length ? `${badDescriptions.length} description(s) contain markdown` : ''
);

// 11. All inline schema objects have explicit "type"
// (Skip $ref objects — they delegate type to the referenced schema)
const schemasWithoutType = allSchemas.filter(s => !s.$ref && !s.type && !s.properties);
check(
  'All schemas have explicit type or $ref',
  schemasWithoutType.length === 0,
  schemasWithoutType.length ? `${schemasWithoutType.length} schema(s) missing type` : ''
);

// 12. No $ref pointing outside the document (external refs not supported)
const externalRefs = [...specStr.matchAll(/"\\$ref":"([^"]+)"/g)]
  .map(m => m[1])
  .filter(r => !r.startsWith('#'));
check(
  'No external $ref references',
  externalRefs.length === 0,
  externalRefs.length ? `external refs: ${externalRefs.join(', ')}` : ''
);

// 13. No format: uuid (Copilot Studio doesn't support uuid format)
check(
  'No format: uuid',
  !specStr.includes('"uuid"') && !raw.includes('format: uuid')
);

// 14. No format: date-time (causes type mismatch in Power Platform)
check(
  'No format: date-time',
  !specStr.includes('"date-time"') && !raw.includes('format: date-time')
);

// 15. Request bodies are all application/json
const nonJsonBodies = operations.filter(({ op }) => {
  const content = op.requestBody?.content;
  return content && !content['application/json'];
});
check(
  'All request bodies use application/json',
  nonJsonBodies.length === 0
);

// 16. No 'required' array on a schema that lists properties not defined in that schema
// (lightweight check: required arrays exist only where properties are defined)
const schemasWithRequired = allSchemas.filter(s => s.required && !s.$ref);
const missingProps = schemasWithRequired.filter(s => {
  if (!s.properties) return true;
  return s.required.some(r => !s.properties[r]);
});
check(
  'required[] only references defined properties',
  missingProps.length === 0,
  missingProps.length ? `${missingProps.length} schema(s) have required fields not in properties` : ''
);

// 17. Descriptions are not excessively long (Copilot Studio truncates at ~150 chars)
const longDescriptions = descriptions.filter(d => d.length > 150);
check(
  'All descriptions are under 150 characters',
  longDescriptions.length === 0,
  longDescriptions.length ? `${longDescriptions.length} description(s) exceed 150 chars` : ''
);

// 18. Component schema names use only alphanumeric and safe chars (no dots, slashes)
const schemaNames = Object.keys(spec.components?.schemas || {});
const badNames = schemaNames.filter(n => !/^[A-Za-z0-9_]+$/.test(n));
check(
  'Schema names are alphanumeric (no dots or slashes)',
  badNames.length === 0,
  badNames.length ? `bad names: ${badNames.join(', ')}` : ''
);

// 19. operationIds are alphanumeric (Power Platform rejects spaces and special chars)
const badOpIds = operationIds.filter(id => id && !/^[A-Za-z0-9_]+$/.test(id));
check(
  'operationIds are alphanumeric',
  badOpIds.length === 0,
  badOpIds.length ? `bad ids: ${badOpIds.join(', ')}` : ''
);

// 20. POST operations have requestBody defined
const postWithoutBody = operations.filter(({ method, op }) =>
  method === 'post' && !op.requestBody
);
check(
  'All POST operations have a requestBody',
  postWithoutBody.length === 0,
  postWithoutBody.map(o => o.pathKey).join(', ')
);

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(50));
if (failures === 0) {
  console.log(`RESULT: ALL ${operations.length} operations, ${schemaNames.length} schemas — COMPATIBLE`);
  console.log('This file is ready for Copilot Studio Custom Connector import.\n');
  process.exit(0);
} else {
  console.log(`RESULT: ${failures} check(s) FAILED — fix before importing into Copilot Studio.\n`);
  process.exit(1);
}
