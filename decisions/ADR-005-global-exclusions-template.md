# ADR-005 — Global Exclusions as Site-Level Template

**Status:** Accepted
**Date:** 2026-05-07
**Author:** SFCC Engineering
**Related:** ADR-004, reference/xml-structure-analysis.md

---

## Context

All 6 real SFCC XML exports contain an identical `<global-promotion-settings>` block:

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

This block is byte-for-byte identical across all 6 files. It represents site-level
business rules managed in SFCC Business Manager and exported with every promotion.

---

## Decision

Store global exclusion settings as a **site configuration template** in the service,
populated from environment variables or a config file, not per-promotion intent.

```env
SFCC_CATALOG_ID=siteCatalog_ToryUS
SFCC_GLOBAL_EXCLUDED_CATEGORIES=Exclusions-Always,accessories-seedbox-foundation,accessories-masks
SFCC_GLOBAL_EXCLUDED_PRODUCT_OPTIONS=monogramming
```

The XML builder automatically prepends this block to every generated document.
Individual promotions can override with `disableGlobalExcludedProducts=true` (see Welcome shipping promo).

---

## Why Not Per-Promotion

Every promotion file must contain this block for SFCC to process it correctly during import.
Making it a site-level constant:
- Eliminates repetition in intent input
- Ensures it is always correct and up-to-date
- Prevents accidental omission
- Allows site-wide changes by updating one config value

---

## Override Mechanism

The `Welcome-free-standard-shipping.xml` file demonstrates that a shipping promotion
can override global exclusions with:

```xml
<shipping-promotion-rule>
  <disable-global-excluded-products>true</disable-global-excluded-products>
```

This must be preserved in v2 as `shippingRuleOptions.disableGlobalExcludedProducts: true`.

---

## Consequences

### Positive
- Every generated XML includes the correct global exclusion block automatically
- No intent input required for exclusions
- Site-wide policy changes require updating one env/config value

### Negative
- Tightly couples the service to a specific SFCC site configuration
- Multi-site deployments need per-site configuration
- Must update config if SFCC exclusion categories change
