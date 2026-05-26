'use strict';

const {
  compareXMLStructures,
  _internals: { compareNodes, summarise },
} = require('../../src/blueprints/utils/compareXMLStructures');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Wrap minimal XML around a snippet for parsing */
function wrap(inner) {
  return `<?xml version="1.0" encoding="UTF-8"?><root>${inner}</root>`;
}

function diffCount(diffs) { return diffs.length; }

// ─── Input validation ─────────────────────────────────────────────────────────

describe('compareXMLStructures — input validation', () => {
  test('throws when originalXml is not a string', () => {
    expect(() => compareXMLStructures(null, wrap('<a/>'))).toThrow('originalXml');
  });

  test('throws when originalXml is empty string', () => {
    expect(() => compareXMLStructures('', wrap('<a/>'))).toThrow('originalXml');
  });

  test('throws when originalXml is whitespace-only', () => {
    expect(() => compareXMLStructures('   ', wrap('<a/>'))).toThrow('originalXml');
  });

  test('throws when replayedXml is not a string', () => {
    expect(() => compareXMLStructures(wrap('<a/>'), null)).toThrow('replayedXml');
  });

  test('throws when replayedXml is empty string', () => {
    expect(() => compareXMLStructures(wrap('<a/>'), '')).toThrow('replayedXml');
  });

  test('throws when originalXml is not valid XML', () => {
    expect(() => compareXMLStructures('<unclosed', wrap('<a/>'))).toThrow();
  });

  test('throws when replayedXml is not valid XML', () => {
    expect(() => compareXMLStructures(wrap('<a/>'), '<unclosed')).toThrow();
  });
});

// ─── Identical documents ──────────────────────────────────────────────────────

describe('compareXMLStructures — identical documents', () => {
  test('identical simple documents return equal:true', () => {
    const xml = wrap('<child>hello</child>');
    const result = compareXMLStructures(xml, xml);
    expect(result.equal).toBe(true);
    expect(result.differences).toHaveLength(0);
  });

  test('identical complex documents return equal:true', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<promotions xmlns="http://www.demandware.com/xml/impex/promotion/2008-01-31">
    <campaign campaign-id="TEST">
        <enabled-flag>true</enabled-flag>
        <campaign-scope>
            <applicable-online/>
        </campaign-scope>
    </campaign>
</promotions>`;
    const result = compareXMLStructures(xml, xml);
    expect(result.equal).toBe(true);
    expect(result.differences).toHaveLength(0);
  });

  test('self-closing vs explicit-empty element are structurally equivalent', () => {
    const orig     = wrap('<foo/>');
    const replayed = wrap('<foo></foo>');
    const result = compareXMLStructures(orig, replayed);
    expect(result.equal).toBe(true);
    expect(result.differences).toHaveLength(0);
  });

  test('whitespace-only differences are not flagged', () => {
    const orig     = wrap('<foo>  </foo>');
    const replayed = wrap('<foo/>');
    // xmlbuilder2 drops whitespace-only text nodes, both become {}
    const result = compareXMLStructures(orig, replayed);
    expect(result.equal).toBe(true);
  });
});

// ─── Missing elements ─────────────────────────────────────────────────────────

describe('compareXMLStructures — missing elements', () => {
  test('element present in original but missing in replayed is flagged', () => {
    const orig     = wrap('<a/><b/>');
    const replayed = wrap('<a/>');
    const result = compareXMLStructures(orig, replayed);
    expect(result.equal).toBe(false);
    const hasBDiff = result.differences.some(d => d.path.includes('b'));
    expect(hasBDiff).toBe(true);
  });

  test('element added in replayed but absent from original is flagged', () => {
    const orig     = wrap('<a/>');
    const replayed = wrap('<a/><b/>');
    const result = compareXMLStructures(orig, replayed);
    expect(result.equal).toBe(false);
    const hasBDiff = result.differences.some(d => d.path.includes('b'));
    expect(hasBDiff).toBe(true);
  });

  test('missing element diff has null on the absent side', () => {
    const orig     = wrap('<a/><b/>');
    const replayed = wrap('<a/>');
    const result = compareXMLStructures(orig, replayed);
    const bDiff = result.differences.find(d => d.path.includes('b'));
    expect(bDiff).toBeDefined();
    // 'b' is in original but absent in replayed → replayed side is null
    expect(bDiff.replayed).toBeNull();
  });

  test('added element diff has null on original side', () => {
    const orig     = wrap('<a/>');
    const replayed = wrap('<a/><b/>');
    const result = compareXMLStructures(orig, replayed);
    const bDiff = result.differences.find(d => d.path.includes('b'));
    expect(bDiff).toBeDefined();
    expect(bDiff.original).toBeNull();
  });
});

// ─── Text content changes ─────────────────────────────────────────────────────

describe('compareXMLStructures — text content changes', () => {
  test('changed text content is flagged as a difference', () => {
    const orig     = wrap('<flag>true</flag>');
    const replayed = wrap('<flag>false</flag>');
    const result = compareXMLStructures(orig, replayed);
    expect(result.equal).toBe(false);
    expect(result.differences.length).toBeGreaterThan(0);
  });

  test('diff entry contains original and replayed text values', () => {
    const orig     = wrap('<flag>true</flag>');
    const replayed = wrap('<flag>false</flag>');
    const result = compareXMLStructures(orig, replayed);
    const textDiff = result.differences.find(
      d => d.original === 'true' && d.replayed === 'false'
    );
    expect(textDiff).toBeDefined();
  });

  test('unchanged text content is not flagged', () => {
    const orig = wrap('<flag>true</flag>');
    const result = compareXMLStructures(orig, orig);
    expect(result.equal).toBe(true);
  });
});

// ─── Attribute changes ────────────────────────────────────────────────────────

describe('compareXMLStructures — attribute changes', () => {
  test('changed attribute value is flagged', () => {
    const orig     = wrap('<el id="old"/>');
    const replayed = wrap('<el id="new"/>');
    const result = compareXMLStructures(orig, replayed);
    expect(result.equal).toBe(false);
  });

  test('diff path contains attribute name', () => {
    const orig     = wrap('<el id="old"/>');
    const replayed = wrap('<el id="new"/>');
    const result = compareXMLStructures(orig, replayed);
    const attrDiff = result.differences.find(d => d.path.includes('@id') || d.path.includes('id'));
    expect(attrDiff).toBeDefined();
  });

  test('missing attribute in replayed is flagged', () => {
    const orig     = wrap('<el id="foo" class="bar"/>');
    const replayed = wrap('<el id="foo"/>');
    const result = compareXMLStructures(orig, replayed);
    expect(result.equal).toBe(false);
    const missingAttr = result.differences.find(d => d.replayed === null);
    expect(missingAttr).toBeDefined();
  });

  test('extra attribute in replayed is flagged', () => {
    const orig     = wrap('<el id="foo"/>');
    const replayed = wrap('<el id="foo" class="bar"/>');
    const result = compareXMLStructures(orig, replayed);
    expect(result.equal).toBe(false);
    const extraAttr = result.differences.find(d => d.original === null);
    expect(extraAttr).toBeDefined();
  });
});

// ─── Attribute ordering (XML semantics) ──────────────────────────────────────

describe('compareXMLStructures — attribute ordering is NOT significant', () => {
  test('same attributes in different order are NOT flagged as different', () => {
    // XML semantics: attribute order within an element is meaningless
    const orig     = wrap('<el a="1" b="2"/>');
    const replayed = wrap('<el b="2" a="1"/>');
    const result = compareXMLStructures(orig, replayed);
    expect(result.equal).toBe(true);
    expect(result.differences).toHaveLength(0);
  });

  test('attribute reordering with same values is structural equivalence', () => {
    const orig     = wrap('<promotion promotion-id="P" campaign-id="C"/>');
    const replayed = wrap('<promotion campaign-id="C" promotion-id="P"/>');
    const result = compareXMLStructures(orig, replayed);
    expect(result.equal).toBe(true);
  });
});

// ─── Element ordering (significant) ──────────────────────────────────────────

describe('compareXMLStructures — element ordering IS significant', () => {
  test('same elements in different order are flagged', () => {
    const orig     = wrap('<a/><b/>');
    const replayed = wrap('<b/><a/>');
    const result = compareXMLStructures(orig, replayed);
    expect(result.equal).toBe(false);
  });

  test('reordering diff mentions element-order', () => {
    const orig     = wrap('<a/><b/>');
    const replayed = wrap('<b/><a/>');
    const result = compareXMLStructures(orig, replayed);
    const orderDiff = result.differences.find(d => d.path.includes('element-order'));
    expect(orderDiff).toBeDefined();
  });

  test('identical elements in same order are not flagged', () => {
    const xml = wrap('<a/><b/><c/>');
    const result = compareXMLStructures(xml, xml);
    expect(result.equal).toBe(true);
  });
});

// ─── Array (repeated sibling elements) ───────────────────────────────────────

describe('compareXMLStructures — repeated sibling elements (arrays)', () => {
  test('arrays of different lengths are flagged', () => {
    const orig     = `<?xml version="1.0"?><root><item>a</item><item>b</item></root>`;
    const replayed = `<?xml version="1.0"?><root><item>a</item></root>`;
    const result = compareXMLStructures(orig, replayed);
    expect(result.equal).toBe(false);
    const arrayDiff = result.differences.find(
      d => String(d.original).includes('array') || String(d.replayed).includes('array')
    );
    expect(arrayDiff).toBeDefined();
  });

  test('arrays with same items in same order are equal', () => {
    const xml = `<?xml version="1.0"?><root><item>a</item><item>b</item></root>`;
    const result = compareXMLStructures(xml, xml);
    expect(result.equal).toBe(true);
  });

  test('array element value change is detected', () => {
    const orig     = `<?xml version="1.0"?><root><item>a</item><item>b</item></root>`;
    const replayed = `<?xml version="1.0"?><root><item>a</item><item>CHANGED</item></root>`;
    const result = compareXMLStructures(orig, replayed);
    expect(result.equal).toBe(false);
  });
});

// ─── Nested structures ────────────────────────────────────────────────────────

describe('compareXMLStructures — nested structures', () => {
  test('deeply nested text change is detected', () => {
    const orig     = wrap('<a><b><c>original</c></b></a>');
    const replayed = wrap('<a><b><c>changed</c></b></a>');
    const result = compareXMLStructures(orig, replayed);
    expect(result.equal).toBe(false);
    const textDiff = result.differences.find(d => d.original === 'original');
    expect(textDiff).toBeDefined();
  });

  test('path reflects full hierarchy', () => {
    const orig     = wrap('<a><b><c>x</c></b></a>');
    const replayed = wrap('<a><b><c>y</c></b></a>');
    const result = compareXMLStructures(orig, replayed);
    // Path should contain all ancestors
    const diff = result.differences.find(d => d.original === 'x');
    expect(diff).toBeDefined();
    expect(diff.path).toContain('a');
    expect(diff.path).toContain('b');
    expect(diff.path).toContain('c');
  });

  test('identical nested structures are equal', () => {
    const xml = wrap('<parent><child attr="v"><grandchild>text</grandchild></child></parent>');
    const result = compareXMLStructures(xml, xml);
    expect(result.equal).toBe(true);
  });
});

// ─── Return shape ─────────────────────────────────────────────────────────────

describe('compareXMLStructures — return shape', () => {
  test('returns object with equal and differences keys', () => {
    const xml = wrap('<a/>');
    const result = compareXMLStructures(xml, xml);
    expect(result).toHaveProperty('equal');
    expect(result).toHaveProperty('differences');
  });

  test('equal is boolean', () => {
    const xml = wrap('<a/>');
    const result = compareXMLStructures(xml, xml);
    expect(typeof result.equal).toBe('boolean');
  });

  test('differences is an array', () => {
    const xml = wrap('<a/>');
    const result = compareXMLStructures(xml, xml);
    expect(Array.isArray(result.differences)).toBe(true);
  });

  test('each difference has path, original, replayed keys', () => {
    const orig     = wrap('<a>old</a>');
    const replayed = wrap('<a>new</a>');
    const result = compareXMLStructures(orig, replayed);
    expect(result.differences.length).toBeGreaterThan(0);
    result.differences.forEach(d => {
      expect(d).toHaveProperty('path');
      expect(d).toHaveProperty('original');
      expect(d).toHaveProperty('replayed');
    });
  });

  test('equal:false when differences array is non-empty', () => {
    const orig     = wrap('<a>x</a>');
    const replayed = wrap('<a>y</a>');
    const result = compareXMLStructures(orig, replayed);
    expect(result.equal).toBe(false);
    expect(result.differences.length).toBeGreaterThan(0);
  });
});

// ─── _internals.summarise ─────────────────────────────────────────────────────

describe('_internals.summarise', () => {
  test('returns "null" for null', () => {
    expect(summarise(null)).toBe('null');
  });

  test('returns "null" for undefined', () => {
    expect(summarise(undefined)).toBe('null');
  });

  test('returns JSON-quoted string for string input', () => {
    expect(summarise('hello')).toBe('"hello"');
  });

  test('returns array summary for arrays', () => {
    expect(summarise([1, 2, 3])).toBe('array(3)');
  });

  test('returns {} for empty object', () => {
    expect(summarise({})).toBe('{}');
  });

  test('returns key summary for non-empty object', () => {
    const s = summarise({ a: 1, b: 2 });
    expect(s).toContain('a');
    expect(s).toContain('b');
  });

  test('truncates object keys beyond 3', () => {
    const s = summarise({ a: 1, b: 2, c: 3, d: 4 });
    expect(s).toContain('...');
  });

  test('does not truncate when 3 or fewer keys', () => {
    const s = summarise({ a: 1, b: 2, c: 3 });
    expect(s).not.toContain('...');
  });
});

// ─── _internals.compareNodes (unit) ──────────────────────────────────────────

describe('_internals.compareNodes', () => {
  test('both undefined → no diff', () => {
    const diffs = [];
    compareNodes(undefined, undefined, '/test', diffs);
    expect(diffs).toHaveLength(0);
  });

  test('original undefined, replayed present → diff with null original', () => {
    const diffs = [];
    compareNodes(undefined, 'value', '/test', diffs);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].original).toBeNull();
  });

  test('replayed undefined, original present → diff with null replayed', () => {
    const diffs = [];
    compareNodes('value', undefined, '/test', diffs);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].replayed).toBeNull();
  });

  test('equal strings → no diff', () => {
    const diffs = [];
    compareNodes('same', 'same', '/test', diffs);
    expect(diffs).toHaveLength(0);
  });

  test('different strings → one diff', () => {
    const diffs = [];
    compareNodes('original', 'replayed', '/test', diffs);
    expect(diffs).toHaveLength(1);
    expect(diffs[0].original).toBe('original');
    expect(diffs[0].replayed).toBe('replayed');
  });

  test('equal arrays of strings → no diff', () => {
    const diffs = [];
    compareNodes(['a', 'b'], ['a', 'b'], '/test', diffs);
    expect(diffs).toHaveLength(0);
  });

  test('arrays of different length → diff reported', () => {
    const diffs = [];
    compareNodes(['a', 'b'], ['a'], '/test', diffs);
    expect(diffs.length).toBeGreaterThan(0);
  });

  test('array vs non-array → type mismatch diff', () => {
    const diffs = [];
    compareNodes(['a'], 'a', '/test', diffs);
    expect(diffs.length).toBeGreaterThan(0);
  });

  test('equal empty objects → no diff', () => {
    const diffs = [];
    compareNodes({}, {}, '/test', diffs);
    expect(diffs).toHaveLength(0);
  });

  test('objects with same keys and values → no diff', () => {
    const diffs = [];
    compareNodes({ '@id': 'x', '#': 'text' }, { '@id': 'x', '#': 'text' }, '/test', diffs);
    expect(diffs).toHaveLength(0);
  });

  test('objects with different attribute values → diff reported', () => {
    const diffs = [];
    compareNodes({ '@id': 'original' }, { '@id': 'changed' }, '/test', diffs);
    expect(diffs.length).toBeGreaterThan(0);
  });

  test('attribute unordered: different key insertion order → no diff', () => {
    const diffs = [];
    const o1 = { '@a': '1', '@b': '2' };
    const o2 = { '@b': '2', '@a': '1' };
    compareNodes(o1, o2, '/test', diffs);
    expect(diffs).toHaveLength(0);
  });

  test('element key ordering: different order → diff flagged', () => {
    const diffs = [];
    const o1 = { child1: {}, child2: {} };
    const o2 = { child2: {}, child1: {} };
    compareNodes(o1, o2, '/test', diffs);
    const orderDiff = diffs.find(d => d.path.includes('element-order'));
    expect(orderDiff).toBeDefined();
  });
});

// ─── SFCC-specific namespace handling ─────────────────────────────────────────

describe('compareXMLStructures — SFCC namespace', () => {
  const NS = 'http://www.demandware.com/xml/impex/promotion/2008-01-31';

  test('two documents with same namespace are equal', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><promotions xmlns="${NS}"><campaign campaign-id="X"><enabled-flag>true</enabled-flag></campaign></promotions>`;
    const result = compareXMLStructures(xml, xml);
    expect(result.equal).toBe(true);
  });

  test('namespace difference is flagged', () => {
    const xml1 = `<?xml version="1.0"?><root xmlns="${NS}"/>`;
    const xml2 = `<?xml version="1.0"?><root xmlns="http://other.namespace/"/>`;
    const result = compareXMLStructures(xml1, xml2);
    expect(result.equal).toBe(false);
  });
});
