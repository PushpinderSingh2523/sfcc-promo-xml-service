# Product Promotion Renderer

**Source of truth: real SFCC XML exports only.**
No generalised SFCC schemas. No internet references. No invented structures.

---

## Governing Principle

The renderer is template-driven, not AI-driven.

Every XML node, attribute name, attribute value, element order, and nesting level in the
rendered output is taken directly from real SFCC promotion export files:

- `2018-April-VIP-Email-Promo-Bday.xml`
- `2018-THANKS-TEST.xml`

The renderer must:

- **NEVER** invent XML structures not present in the reference exports
- **NEVER** infer missing values from context
- **NEVER** produce dynamic node names
- **NEVER** use generalised SFCC documentation as a source of truth
- **ALWAYS** throw a validation error when required fields are absent

---

## Real Exported XML Structure

Both reference product promotion exports follow this exact document shape:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<promotions xmlns="http://www.demandware.com/xml/impex/promotion/2008-01-31">
    <global-promotion-settings>
        ...static boilerplate...
    </global-promotion-settings>

    <promotion promotion-id="...">
        <enabled-flag>true|false</enabled-flag>
        <archived-flag>true|false</archived-flag>
        <searchable-flag>true|false</searchable-flag>
        <refinable-flag>false</refinable-flag>
        <prevent-requalifying-flag>false</prevent-requalifying-flag>
        <prorate-across-eligible-items-flag>false</prorate-across-eligible-items-flag>
        <exclusivity>no|class|global</exclusivity>
        <name xml:lang="x-default">...</name>
        [<callout-msg xml:lang="x-default">...</callout-msg>]
        <custom-attributes>
            <custom-attribute attribute-id="gwp">false</custom-attribute>
            <custom-attribute attribute-id="isExcludeTranslate">false</custom-attribute>
        </custom-attributes>
        <product-promotion-rule>
            <qualifying-products>
                <included-products>
                    <condition-group>
                        <price-condition operator="greater than">
                            <price>0.01</price>
                        </price-condition>
                        |
                        <category-condition catalog-id="siteCatalog_ToryUS" operator="is equal">
                            <category-id>...</category-id>
                        </category-condition>
                    </condition-group>
                </included-products>
            </qualifying-products>
            <discounts condition-type="product-amount">
                <discount>
                    <threshold>...</threshold>
                    <percentage>...</percentage> | <amount>...</amount>
                </discount>
                [<discount>...</discount>]    <!-- additional tiers -->
            </discounts>
            [<max-applications>...</max-applications>]
        </product-promotion-rule>
    </promotion>

</promotions>
```

---

## Mandatory vs Optional Nodes

### Always rendered (mandatory)

| Node | Notes |
|---|---|
| `<?xml version="1.0" encoding="UTF-8"?>` | Fixed declaration |
| `<promotions xmlns="...">` | Fixed namespace |
| `<global-promotion-settings>` | Static boilerplate — see below |
| `<promotion promotion-id="...">` | Driven by `promotionId` field |
| `<enabled-flag>` | Driven by `enabledFlag` field; defaults to `true` |
| `<archived-flag>` | Driven by `archivedFlag` field; defaults to `false` |
| `<searchable-flag>` | Driven by `searchableFlag` field; defaults to `false` |
| `<refinable-flag>false</refinable-flag>` | Always `false` — constant |
| `<prevent-requalifying-flag>false</prevent-requalifying-flag>` | Always `false` — constant |
| `<prorate-across-eligible-items-flag>false</prorate-across-eligible-items-flag>` | Always `false` — constant |
| `<exclusivity>` | Driven by `exclusivity` field |
| `<name xml:lang="x-default">` | Driven by `name` field |
| `<custom-attributes>` | Always rendered with minimum set (gwp, isExcludeTranslate) |
| `<product-promotion-rule>` | Always the rule element for product promotions |
| `<qualifying-products>` | Driven by `qualifyingProducts` field |
| `<discounts condition-type="product-amount">` | Always this condition-type for product |

### Conditionally rendered (optional)

| Node | Condition |
|---|---|
| `<callout-msg xml:lang="x-default">` | Rendered only when `calloutMsg` is supplied |
| `<max-applications>` | Rendered only when `maxApplications` is supplied |

---

## Static Boilerplate Blocks

These blocks are hardcoded constants. Their content comes directly from the reference exports
and is identical across all exported product promotion files.

### `<global-promotion-settings>`

```xml
<global-promotion-settings>
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
</global-promotion-settings>
```

**This block must NEVER be parameterised.** It is a site constant derived from real exports.

### `<custom-attributes>` minimum set

```xml
<custom-attributes>
    <custom-attribute attribute-id="gwp">false</custom-attribute>
    <custom-attribute attribute-id="isExcludeTranslate">false</custom-attribute>
</custom-attributes>
```

Both attributes are present in all reference exports. Values are always `false`.

---

## Qualifying Products Structure

The `qualifyingProducts` field controls which condition is rendered inside the
`<included-products><condition-group>` wrapper. Two types are supported.

### Type: `price`

Renders a price gate. The price value `0.01` is a constant taken from both reference exports.
It represents "any product that has a price" and is never parameterised.

```xml
<qualifying-products>
    <included-products>
        <condition-group>
            <price-condition operator="greater than">
                <price>0.01</price>
            </price-condition>
        </condition-group>
    </included-products>
</qualifying-products>
```

Input schema:
```json
{ "type": "price" }
```

### Type: `category`

Renders a category filter. Multiple category IDs are rendered as sibling `<category-id>`
elements inside a **single** `<category-condition>` — not as separate condition groups.
This matches the structure observed in `VJTEMP2023DTM.xml` (order rule) and is applied
consistently to product rules.

```xml
<qualifying-products>
    <included-products>
        <condition-group>
            <category-condition catalog-id="siteCatalog_ToryUS" operator="is equal">
                <category-id>shoes</category-id>
                <category-id>handbags</category-id>
            </category-condition>
        </condition-group>
    </included-products>
</qualifying-products>
```

Input schema:
```json
{
  "type": "category",
  "catalogId": "siteCatalog_ToryUS",
  "categoryIds": ["shoes", "handbags"]
}
```

`catalogId` defaults to `siteCatalog_ToryUS` if not supplied. It must be supplied explicitly
to use a different catalog. The renderer does not infer it.

---

## Discounts Structure

### Condition type

The `condition-type` attribute on `<discounts>` is always `product-amount` for product
promotions. This is a constant, not a schema field.

### Threshold location

The `<threshold>` element lives **inside** each `<discount>` element — not in a separate
`<condition>` or `<subtotal-condition>` wrapper. This is the structure observed in both
reference exports.

### Single discount

```xml
<discounts condition-type="product-amount">
    <discount>
        <threshold>50</threshold>
        <percentage>30</percentage>
    </discount>
</discounts>
```

Input schema (single discount):
```json
{
  "threshold": 50,
  "discountType": "percentage",
  "discountValue": 30
}
```

### Discount value nodes

| `discountType` value | XML node rendered |
|---|---|
| `percentage` | `<percentage>{discountValue}</percentage>` |
| `amount` | `<amount>{discountValue}</amount>` |

`amount` renders as `<amount>`, **not** `<fixed-price>`. This matches the reference export
`2018-April-VIP-Email-Promo-Bday.xml`. The old renderer used `<fixed-price>` — that was
invented and is prohibited.

### Tiered discounts

Tiers are rendered as **multiple sibling `<discount>` elements** inside a single `<discounts>`
block. There is no `<tiered-discount>` or `<tier>` wrapper — those elements do not appear
in any reference export.

```xml
<discounts condition-type="product-amount">
    <discount>
        <threshold>100</threshold>
        <percentage>10</percentage>
    </discount>
    <discount>
        <threshold>200</threshold>
        <percentage>20</percentage>
    </discount>
</discounts>
```

Input schema (multiple discounts in discounts[]):
```json
{
  "discounts": [
    { "threshold": 100, "discountType": "percentage", "discountValue": 10 },
    { "threshold": 200, "discountType": "percentage", "discountValue": 20 }
  ]
}
```

`discounts[]` is the only accepted field. There is no single-discount shorthand — a
promotion with one discount level uses a single-entry array. `discountTiers` is the old
field name and is explicitly rejected by the renderer.

---

## Validation Rules

All validation runs before any XML is emitted. If any rule fails, an error is thrown and
no XML is produced.

### Required field rules

| Field | Rule |
|---|---|
| `promotionId` | Must be a non-empty string |
| `name` | Must be a non-empty string |
| `exclusivity` | Must be one of: `no`, `class`, `global` |
| `qualifyingProducts` | Must be a non-null object |
| `qualifyingProducts.type` | Must be `price` or `category` |
| `qualifyingProducts.categoryIds` | Required and non-empty when type is `category` |
| `discounts` | Must be a non-empty array |

### Per-entry validation rules (each object in discounts[])

| Field | Rule |
|---|---|
| `discounts[i].threshold` | Must be a number |
| `discounts[i].discountType` | Must be `percentage` or `amount` |
| `discounts[i].discountValue` | Must be a number |

### Optional field rules

| Field | Rule |
|---|---|
| `maxApplications` | Must be a positive integer when supplied |

---

## Prohibited Renderer Behaviors

The following are explicitly forbidden and must never appear in rendered output:

| Prohibited | Reason |
|---|---|
| `<product-rule>` | Incorrect element name — real exports use `<product-promotion-rule>` |
| `<rule>` | Does not exist in reference exports |
| `<promotion-class>` | Invented — absent from all real exports |
| `<campaign-id>` inside `<promotion>` | Not present in real export structure |
| `<schedule>` inside `<promotion>` | Schedule belongs in `<promotion-campaign-assignment>` (separate document section) |
| `<customer-groups>` inside `<promotion>` | Customer groups belong in campaign or assignment |
| `<coupons>` inside `<promotion>` | Coupons belong in `<promotion-campaign-assignment>` |
| `<fixed-price>` | Incorrect node name — real exports use `<amount>` |
| `<tiered-discount>` | Invented wrapper — absent from all real exports |
| `<tier>` | Invented element — absent from all real exports |
| `<free-shipping/>` | Shipping-only node — invalid in product promotions |
| `<subtotal-condition>` | Incorrect threshold location — threshold lives inside `<discount>` |
| Dynamic node names | All element names are constants, never string-interpolated |
| Inferred default values | Every rendered value must come from explicit schema input |
| `discountTiers` field | Old field name — rejected; canonical field is `discounts[]` |
| Single-discount shorthand | No top-level `threshold`/`discountType`/`discountValue`; always use `discounts[]` |

---

## Schema Field → XML Node Mapping Table

| Schema field | XML location | Notes |
|---|---|---|
| `promotionId` | `<promotion promotion-id="...">` | Attribute, XML-escaped |
| `name` | `<name xml:lang="x-default">` | Content, XML-escaped |
| `enabledFlag` | `<enabled-flag>` | `false` only if explicitly `false`; otherwise `true` |
| `archivedFlag` | `<archived-flag>` | `true` only if explicitly `true`; otherwise `false` |
| `searchableFlag` | `<searchable-flag>` | `true` only if explicitly `true`; otherwise `false` |
| `exclusivity` | `<exclusivity>` | Content, XML-escaped |
| `calloutMsg` | `<callout-msg xml:lang="x-default">` | Conditional — omitted when absent |
| `qualifyingProducts.type` | Selects `<price-condition>` or `<category-condition>` | `price` or `category` |
| `qualifyingProducts.categoryIds` | `<category-id>` elements | One per ID inside single `<category-condition>` |
| `qualifyingProducts.catalogId` | `catalog-id="..."` attribute | Defaults to `siteCatalog_ToryUS` |
| `discounts[i].threshold` | `<threshold>` inside `<discount>` | One `<discount>` element per array entry |
| `discounts[i].discountType` | Selects `<percentage>` or `<amount>` node | Per entry |
| `discounts[i].discountValue` | Content of `<percentage>` or `<amount>` | Per entry |
| `maxApplications` | `<max-applications>` | Conditional — omitted when absent |

---

## Example Input and Output

### Input: percentage discount with price gate

```json
{
  "promotionId":        "2018-THANKS-TEST",
  "name":               "THANKS TEST",
  "exclusivity":        "class",
  "qualifyingProducts": { "type": "price" },
  "discounts": [
    { "threshold": 0.01, "discountType": "percentage", "discountValue": 30 }
  ]
}
```

### Output

```xml
<?xml version="1.0" encoding="UTF-8"?>
<promotions xmlns="http://www.demandware.com/xml/impex/promotion/2008-01-31">
    <global-promotion-settings>
        ...static boilerplate...
    </global-promotion-settings>

    <promotion promotion-id="2018-THANKS-TEST">
        <enabled-flag>true</enabled-flag>
        <archived-flag>false</archived-flag>
        <searchable-flag>false</searchable-flag>
        <refinable-flag>false</refinable-flag>
        <prevent-requalifying-flag>false</prevent-requalifying-flag>
        <prorate-across-eligible-items-flag>false</prorate-across-eligible-items-flag>
        <exclusivity>class</exclusivity>
        <name xml:lang="x-default">THANKS TEST</name>
        <custom-attributes>
            <custom-attribute attribute-id="gwp">false</custom-attribute>
            <custom-attribute attribute-id="isExcludeTranslate">false</custom-attribute>
        </custom-attributes>
        <product-promotion-rule>
            <qualifying-products>
                <included-products>
                    <condition-group>
                        <price-condition operator="greater than">
                            <price>0.01</price>
                        </price-condition>
                    </condition-group>
                </included-products>
            </qualifying-products>
            <discounts condition-type="product-amount">
                <discount>
                    <threshold>0.01</threshold>
                    <percentage>30</percentage>
                </discount>
            </discounts>
        </product-promotion-rule>
    </promotion>

</promotions>
```

---

## Renderer Flow

```
renderProductPromotion(input)
  │
  ├─ validate(input)                     ← throws on any constraint violation
  │     required fields
  │     qualifyingProducts type
  │     discounts[] non-empty array
  │     per-entry: threshold, discountType, discountValue
  │     optional field constraints
  │
  ├─ emit XML declaration
  ├─ emit <promotions> with namespace
  ├─ emit GLOBAL_PROMOTION_SETTINGS      ← static constant, never parameterised
  ├─ emit <promotion promotion-id="...">
  │     ├─ emit mandatory flags (fixed order)
  │     ├─ emit <exclusivity>
  │     ├─ emit <name>
  │     ├─ [emit <callout-msg>]          ← only if calloutMsg supplied
  │     ├─ emit <custom-attributes>      ← always gwp + isExcludeTranslate
  │     └─ emit <product-promotion-rule>
  │           ├─ renderQualifyingProducts(qualifyingProducts)
  │           │     price    → <price-condition> block
  │           │     category → <category-condition> block
  │           ├─ renderDiscounts(input)
  │           │     iterate discounts[] → one sibling <discount> per entry
  │           └─ [emit <max-applications>]  ← only if maxApplications supplied
  │
  └─ return lines.join('\n')
```

---

## What This Renderer Does Not Cover

The following are out of scope for this renderer. They are handled by separate
renderer modules (not yet built):

- `<campaign>` block
- `<promotion-campaign-assignment>` block
- `<qualifiers>` inside assignment
- Coupon linking
- Schedule (dates belong in assignment, not promotion)
- Customer group linking (belongs in campaign or assignment)
- `<order-promotion-rule>` (order promotion family)
- `<shipping-promotion-rule>` (shipping promotion family)
