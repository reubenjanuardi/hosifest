# 10 — Custom Souvenir Design

## Product Definition

Every ticket includes:

```text
1 × Custom Canvas Keychain
```

Customization is mandatory.

## Per-ticket Model

```text
Order
├── Ticket A
│   └── Souvenir Configuration A
├── Ticket B
│   └── Souvenir Configuration B
└── Ticket C
    └── Souvenir Configuration C
```

Configurations are independent.

## Dynamic Option Model

```text
Souvenir Option Group
├── Main Charm
├── Letter
├── Accessory
└── Color
```

This is illustrative only.

Admins can create any option group.

Each group supports:
- name
- code
- description
- selection rule
- display order
- active status

Each option supports:
- name
- code
- image
- metadata
- display order
- active status

Do not hardcode charm count or types.

## Price

Basic customization has no extra charge.

```text
price_delta = 0
```

## Snapshot

When order becomes PAID, store an immutable snapshot of:
- option group name
- selected option name
- option code
- quantity
- relevant metadata

Future catalog edits must not modify historical order data.

## Fulfillment Status

Recommended:

```text
PENDING
IN_PRODUCTION
READY
HANDED_OVER
```

## Production Report

Aggregate paid/confirmed tickets:

```text
Option / Selection    Quantity
-------------------   --------
Star                  42
Heart                 31
Letter A              18
Letter R              11
```

The aggregate report is for procurement and production.

## Tumbler

Presale ticket receives one tumbler entitlement.

Tumbler is a benefit of the Presale offer, not an independently charged mandatory cart item.

## Beverage

Presale customer selects one beverage from dynamic catalog.

Current planned entries:
- Es Kopi Susu
- Milk Tea

These are seed/configuration values, not hardcoded enum values.

Future beverage options must be addable through admin/configuration.
