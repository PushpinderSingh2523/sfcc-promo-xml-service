# Deterministic Intent Classification

> **Phase 7 — Bug-fix and hardening reference**
>
> Documents the precedence rules, category-extraction grammar, qualifying-product
> construction, and fallback behaviour for `localParser.parseIntent()`.
>
> **Prohibition**: NO AI inference, NO fuzzy matching, NO NLP libraries, NO
> embeddings.  Every decision in this layer must be reproducible from the text
> alone using only deterministic regular expressions and ordered precedence rules.

---

## 1. Rule-type precedence

`resolveRuleType()` in `src/services/localParser.js` returns one of three values:
`'shipping'`, `'order'`, or `'product'`.  The decision follows a strict waterfall —
each level is only reached when the level above did not match.

| Priority | Condition | ruleType |
|----------|-----------|----------|
| 1 (highest) | `shippingResult.value.isShippingPromo === true` **or** `discountResult.value.ruleTypeHint === 'shipping'` | `shipping` |
| 2 | `discountResult.value.ruleTypeHint === 'order'` (explicit order signal from discountParser) | `order` |
| 3 | `categoryResult.value.qualifyingCategoryIds.length > 0` | `product` |
| 4 | `conditionResult.value.conditionType === 'minimum-amount'` | `order` |
| 5 (fallback) | _(none of the above)_ | `product` |

### Key invariant — Phase 7 fix

> **A basket-level spend threshold (`after spending $X`, `orders over $X`) does NOT
> classify a promotion as an order promotion when a product category is also
> present.**

Before Phase 7, priority 4 fired before priority 3, causing "20% off products in
the summer-sale category after spending $100" to be mis-classified as `order`.
The fix inserts the category check (priority 3) ahead of the threshold check
(priority 4).

### Threshold retention for product promotions

Even when `ruleType` resolves to `'product'` via priority 3, the basket minimum
is still captured in `discounts[0].threshold`.  `applyConditionToTiers()`
applies the `conditionValue` to the tier regardless of `ruleType`, so downstream
renderers and XML assemblers always have access to the value.

---

## 2. Category extraction grammar

Category extraction happens in two sequential phases inside
`src/services/parserStrategies/categoryParser.parse()`.

### Phase 1 — Static rules (`CATEGORY_RULES`)

Ten hand-curated entries map human product-type words to SFCC category IDs:

| categoryId | Example trigger words |
|------------|----------------------|
| `handbags` | handbag, bag, purse, tote |
| `watches` | watch, timepiece |
| `shoes` | shoe, sneakers, boots, sandals, footwear |
| `accessories` | accessory, jewelry, belt, scarf, sunglasses |
| `apparel` | apparel, clothing, jacket, shirt, jeans, denim |
| `sportswear` | sportswear, activewear, gym wear, leggings |
| `beauty` | beauty, skincare, fragrance, makeup |
| `home` | home goods, furniture, decor, bedding |
| `electronics` | electronics, laptop, phone, tablet |
| `gift-cards` | gift card, e-gift card |

Static rules are matched with word-boundary patterns (`\b…\b`) and cannot produce
false positives on sub-string matches (e.g. "beauty" does not match "beautiful").

### Phase 2 — Dynamic slug extraction (`DYNAMIC_SLUG_PATTERNS`)

Runs only after Phase 1.  Captures arbitrary category slugs that are **not** in
the static list — hyphenated IDs, uppercase codes, raw SFCC category paths, etc.

Four patterns are tried in order.  The first match per pattern is taken:

```
Pattern 1 — products? in (slug)
  /\bproducts?\s+in\s+(?:the\s+)?([\w][\w\-_]*)\b/i
  Examples: "products in summer-sale", "products in the RTW"

Pattern 2 — items? from (slug)
  /\bitems?\s+from\s+(?:the\s+)?([\w][\w\-_]*)\b/i
  Examples: "items from summer-sale", "items from the clearance-2026"

Pattern 3 — in (the?) (slug) category
  /\bin\s+(?:the\s+)?([\w][\w\-_]+)\s+category\b/i
  Examples: "in the summer-sale category", "in sale-new-arrivals category"

Pattern 4 — (slug) category
  /\b([\w][\w\-_]+)\s+category\b/i
  Examples: "Sale-viewAll category", "summer-sale category"
```

**Slug character set:** `[\w][\w\-_]*` — alphanumeric, underscore, or hyphen.
Must start with a word character (`[A-Za-z0-9_]`).

**Deduplication:** a normalized (lowercased) slug is added to `seen` after each
match.  Later patterns and Phase 1 static matches are skipped if the normalized
form is already present.

**Stop-word filter:** the following tokens are never emitted as category slugs,
even if they appear where a slug is expected:

```
the, a, an, all, any, our, their, your, my, its, every, each, some, most,
many, other, another, product, products, item, items, order, orders,
customer, customers, member, members, this, that, these, those,
new, old, more, less, top, best, good, full, online, store, site
```

**Casing:** original casing from the source text is preserved in
`qualifyingCategoryIds`.  "RTW" is stored as `"RTW"`, not `"rtw"`.
"Sale-viewAll" is stored as `"Sale-viewAll"`, not `"sale-viewall"`.

**Static category ID guard:** if the normalized slug equals an existing static
`categoryId` (e.g. `"handbags"`), the dynamic path skips it — the static Phase 1
match already handled it.

---

## 3. Qualifying-product construction

`buildQualifyingProducts()` in `src/services/localParser.js`:

```
if qualifyingCategoryIds.length > 0:
    conditionGroups = [{ categoryCondition: { catalogId, operator: "is equal", categoryIds } }]
else:
    conditionGroups = [{ priceCondition: { operator: "greater than", price: 0.01 } }]
```

**Rule:** when a category was successfully extracted, the XML must use
`categoryCondition` — never `priceCondition` — to scope qualifying products.
`priceCondition` is the open-scope fallback for promotions with no product filter
at all.

This construction is already correct in code; the Phase 7 fix ensures the
`categoryResult` is populated before `buildQualifyingProducts()` is called.

---

## 4. Warning logic

`categoryParser.parse()` emits a warning **only when no categories are found**:

```
warnings = [] if qualifyingCategoryIds.length > 0 else
           ['No product category detected — qualifying products will not be scoped to a category.']
```

`detectAmbiguities()` in `localParser.js` adds a clarification question only when
`cat.confidence < 0.30` and the text does not explicitly mention "all products" or
"entire site".  Because dynamic extraction sets `confidence = 0.80` when any slug
is found, a successfully extracted dynamic slug produces no warning and no
clarification question.

---

## 5. Fallback behaviour

When neither static nor dynamic extraction finds a category:

- `qualifyingCategoryIds = []`
- `confidence = 0.10`
- Warning emitted: `"No product category detected…"`
- `ruleType` falls through to priority 4 (threshold check) or priority 5 (product fallback)
- `qualifyingProducts` uses `priceCondition` (open scope)

This is intentional — an unconstrained product scope is valid XML and should not
block generation.  The operator is expected to review the review card before
confirming generation.

---

## 6. Examples table

| Input text | ruleType | categoryIds | threshold | Notes |
|------------|----------|-------------|-----------|-------|
| `"20% off products in summer-sale category after spending $100"` | `product` | `["summer-sale"]` | `100` | Phase 7 primary fix |
| `"30% off items from handbags over $250"` | `product` | `["handbags"]` | `250` | Static + threshold |
| `"Free shipping over $100"` | `shipping` | _n/a_ | _n/a_ | Shipping takes priority 1 |
| `"20% off orders over $100"` | `order` | `[]` | `100` | No category → threshold wins |
| `"50% off Sale-viewAll category"` | `product` | `["Sale-viewAll"]` | `0` | Dynamic slug pattern 4 |
| `"products in accessories-masks"` | `product` | `["accessories-masks"]` | `0` | Dynamic slug pattern 1 |
| `"products in RTW"` | `product` | `["RTW"]` | `0` | Uppercase preserved |
| `"15% off accessories on orders over $100"` | `product` | `["accessories"]` | `100` | Category overrides threshold |
| `"20% off everything"` | `product` | `[]` | `0` | No category, no threshold |

---

## 7. Prohibited inference

The following are explicitly **not allowed** in the classification layer:

- Cosine similarity or vector embeddings to "guess" a category from product words
- Stemming, lemmatisation, or synonym expansion beyond the static `rawWords` lists
- Any call to an external API or LLM to resolve ambiguous category references
- Probability weighting between competing categories
- Inferring category from brand names, price points, or target audience
- Re-ordering or merging categories based on co-occurrence in training data

If a slug cannot be resolved deterministically from the patterns above, it is
passed through verbatim to `qualifyingCategoryIds`.  The XML assembler writes it
as-is and the operator is responsible for ensuring the SFCC catalog contains a
matching category ID.

---

## 8. Test coverage

All scenarios in this document are covered by
`tests/unit/intentClassification.test.js` (45 tests, Phase 7) and
`tests/unit/parserStrategies/categoryParser.test.js`.

The two pre-Phase-7 tests that encoded the incorrect "category + threshold = order"
behaviour were updated in:
- `tests/unit/localParser.test.js` — "VIP shoes 20% off above $100"
- `tests/unit/parserScenarios.test.js` — "15% off on accessories on orders over $100"

Both now assert `ruleType: 'product'` and carry an inline comment explaining the
precedence rule change.
