# 15 — Final Database Schema

## 1. Conventions

- PostgreSQL
- UUID for internal primary keys
- human-readable codes separate from UUID
- `created_at`, `updated_at` on mutable entities
- `TIMESTAMPTZ` for timestamps
- integer IDR amounts using BIGINT
- JSONB only for extensible metadata/snapshots, not for core relational identity
- foreign keys enforced
- transaction records are append-oriented where practical

## 2. Core Schema

### events

```sql
id UUID PRIMARY KEY
name VARCHAR(200) NOT NULL
slug VARCHAR(200) UNIQUE NOT NULL
description TEXT
starts_at TIMESTAMPTZ
ends_at TIMESTAMPTZ
venue_name VARCHAR(255)
venue_address TEXT
status VARCHAR(30) NOT NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

### sales_phases

```sql
id UUID PRIMARY KEY
event_id UUID NOT NULL REFERENCES events(id)
code VARCHAR(50) NOT NULL
name VARCHAR(100) NOT NULL
start_at TIMESTAMPTZ
end_at TIMESTAMPTZ
visibility VARCHAR(30) NOT NULL
status VARCHAR(30) NOT NULL
display_order INTEGER NOT NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
UNIQUE(event_id, code)
```

### ticket_offers

```sql
id UUID PRIMARY KEY
sales_phase_id UUID NOT NULL REFERENCES sales_phases(id)
code VARCHAR(80) NOT NULL
name VARCHAR(150) NOT NULL
base_price BIGINT NOT NULL
quota INTEGER NOT NULL
reserved_quantity INTEGER NOT NULL DEFAULT 0
sold_quantity INTEGER NOT NULL DEFAULT 0
purchase_limit_min INTEGER
purchase_limit_max INTEGER
visibility VARCHAR(30) NOT NULL
sales_channel VARCHAR(30) NOT NULL
status VARCHAR(30) NOT NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
UNIQUE(sales_phase_id, code)
CHECK(base_price >= 0)
CHECK(quota >= 0)
CHECK(reserved_quantity >= 0)
CHECK(sold_quantity >= 0)
```

### offer_allocations

```sql
id UUID PRIMARY KEY
ticket_offer_id UUID NOT NULL REFERENCES ticket_offers(id)
code VARCHAR(80) NOT NULL
name VARCHAR(150) NOT NULL
quota INTEGER NOT NULL
reserved_quantity INTEGER NOT NULL DEFAULT 0
sold_quantity INTEGER NOT NULL DEFAULT 0
eligibility_type VARCHAR(40) NOT NULL
congregation_id UUID NULL REFERENCES congregations(id)
discount_code_id UUID NULL REFERENCES discount_codes(id)
status VARCHAR(30) NOT NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
UNIQUE(ticket_offer_id, code)
```

### congregations

```sql
id UUID PRIMARY KEY
name VARCHAR(255) NOT NULL
code VARCHAR(80) UNIQUE NOT NULL
region VARCHAR(100)
active BOOLEAN NOT NULL DEFAULT TRUE
display_order INTEGER NOT NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

### customers

```sql
id UUID PRIMARY KEY
name VARCHAR(200) NOT NULL
email VARCHAR(255)
phone VARCHAR(50) NOT NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

### orders

```sql
id UUID PRIMARY KEY
order_number VARCHAR(50) UNIQUE NOT NULL
event_id UUID NOT NULL REFERENCES events(id)
customer_id UUID NOT NULL REFERENCES customers(id)
status VARCHAR(40) NOT NULL
subtotal_amount BIGINT NOT NULL
discount_amount BIGINT NOT NULL
total_amount BIGINT NOT NULL
expires_at TIMESTAMPTZ
cancelled_at TIMESTAMPTZ
expired_at TIMESTAMPTZ
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

### order_items

```sql
id UUID PRIMARY KEY
order_id UUID NOT NULL REFERENCES orders(id)
item_type VARCHAR(30) NOT NULL
ticket_offer_id UUID NULL REFERENCES ticket_offers(id)
product_id UUID NULL REFERENCES products(id)
quantity INTEGER NOT NULL
unit_price BIGINT NOT NULL
discount_amount BIGINT NOT NULL DEFAULT 0
subtotal_amount BIGINT NOT NULL
item_name_snapshot VARCHAR(255) NOT NULL
metadata JSONB
created_at TIMESTAMPTZ NOT NULL
CHECK(quantity > 0)
CHECK(unit_price >= 0)
```

### payments

```sql
id UUID PRIMARY KEY
order_id UUID NOT NULL REFERENCES orders(id)
method VARCHAR(30) NOT NULL
amount BIGINT NOT NULL
proof_file_key TEXT
status VARCHAR(30) NOT NULL
submitted_at TIMESTAMPTZ
reviewed_at TIMESTAMPTZ
reviewed_by UUID REFERENCES users(id)
rejection_reason TEXT
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

### tickets

```sql
id UUID PRIMARY KEY
order_item_id UUID NOT NULL REFERENCES order_items(id)
ticket_offer_id UUID NOT NULL REFERENCES ticket_offers(id)
ticket_code VARCHAR(80) UNIQUE NOT NULL
qr_token_hash VARCHAR(255) UNIQUE NOT NULL
holder_name_snapshot VARCHAR(200) NOT NULL
price_snapshot BIGINT NOT NULL
discount_snapshot BIGINT NOT NULL DEFAULT 0
congregation_name_snapshot VARCHAR(255)
status VARCHAR(30) NOT NULL
issued_at TIMESTAMPTZ
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

Store a hash of the opaque QR token where possible. Never store sensitive personal data inside the QR itself.

### souvenir_option_groups

```sql
id UUID PRIMARY KEY
name VARCHAR(150) NOT NULL
code VARCHAR(80) UNIQUE NOT NULL
selection_min INTEGER NOT NULL DEFAULT 0
selection_max INTEGER NOT NULL DEFAULT 1
display_order INTEGER NOT NULL
active BOOLEAN NOT NULL DEFAULT TRUE
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

### souvenir_options

```sql
id UUID PRIMARY KEY
option_group_id UUID NOT NULL REFERENCES souvenir_option_groups(id)
name VARCHAR(150) NOT NULL
code VARCHAR(80) NOT NULL
image_url TEXT
metadata JSONB
display_order INTEGER NOT NULL
active BOOLEAN NOT NULL DEFAULT TRUE
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
UNIQUE(option_group_id, code)
```

### souvenir_customizations

```sql
id UUID PRIMARY KEY
ticket_id UUID UNIQUE NOT NULL REFERENCES tickets(id)
status VARCHAR(30) NOT NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

### souvenir_selections

```sql
id UUID PRIMARY KEY
customization_id UUID NOT NULL REFERENCES souvenir_customizations(id)
option_group_id UUID NOT NULL REFERENCES souvenir_option_groups(id)
option_id UUID NOT NULL REFERENCES souvenir_options(id)
quantity INTEGER NOT NULL
option_group_snapshot JSONB NOT NULL
option_snapshot JSONB NOT NULL
created_at TIMESTAMPTZ NOT NULL
CHECK(quantity > 0)
```

### beverage_options

```sql
id UUID PRIMARY KEY
name VARCHAR(150) NOT NULL
code VARCHAR(80) UNIQUE NOT NULL
description TEXT
active BOOLEAN NOT NULL DEFAULT TRUE
display_order INTEGER NOT NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

Initial seed:
- ES_KOPI_SUSU
- MILK_TEA

### benefit_selections

```sql
id UUID PRIMARY KEY
ticket_id UUID NOT NULL REFERENCES tickets(id)
benefit_type VARCHAR(30) NOT NULL
beverage_option_id UUID NULL REFERENCES beverage_options(id)
quantity INTEGER NOT NULL
snapshot JSONB NOT NULL
created_at TIMESTAMPTZ NOT NULL
```

### discount_codes

```sql
id UUID PRIMARY KEY
code VARCHAR(100) UNIQUE NOT NULL
name VARCHAR(150) NOT NULL
discount_type VARCHAR(30) NOT NULL
discount_value BIGINT NOT NULL
max_total_usage INTEGER
max_usage_per_order INTEGER
max_usage_per_customer INTEGER
eligible_ticket_offer_id UUID NULL REFERENCES ticket_offers(id)
active_from TIMESTAMPTZ
active_until TIMESTAMPTZ
status VARCHAR(30) NOT NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

Initial Hosiana configuration should produce an effective Rp150.000 price from Rp175.000 using a Rp25.000 discount and max usage of 35 tickets.

### discount_code_usages

```sql
id UUID PRIMARY KEY
discount_code_id UUID NOT NULL REFERENCES discount_codes(id)
order_id UUID NOT NULL REFERENCES orders(id)
quantity INTEGER NOT NULL
status VARCHAR(30) NOT NULL
reserved_at TIMESTAMPTZ
released_at TIMESTAMPTZ
consumed_at TIMESTAMPTZ
created_at TIMESTAMPTZ NOT NULL
```

### attendance_sessions

```sql
id UUID PRIMARY KEY
ticket_id UUID NOT NULL REFERENCES tickets(id)
entry_at TIMESTAMPTZ NOT NULL
entry_scanned_by UUID NOT NULL REFERENCES users(id)
exit_at TIMESTAMPTZ
exit_scanned_by UUID REFERENCES users(id)
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
```

### audit_logs

```sql
id UUID PRIMARY KEY
actor_user_id UUID REFERENCES users(id)
action VARCHAR(100) NOT NULL
entity_type VARCHAR(100) NOT NULL
entity_id UUID
before_data JSONB
after_data JSONB
request_id VARCHAR(100)
ip_address INET
user_agent TEXT
created_at TIMESTAMPTZ NOT NULL
```

## 3. Important Constraints

### Offer quota

An offer must satisfy:

```text
sold_quantity + reserved_quantity <= quota
```

### Allocation quota

Each allocation must satisfy:

```text
sold_quantity + reserved_quantity <= quota
```

### Discount limit

Consumed + active reservations must never exceed max usage.

### Souvenir

One ticket can have only one customization.

### Attendance

A ticket may have at most one active session:

```sql
CREATE UNIQUE INDEX one_active_attendance_session
ON attendance_sessions(ticket_id)
WHERE exit_at IS NULL;
```

## 4. Order Price Calculation

The server computes:

```text
subtotal
- discount
= total
```

The client must not submit a trusted total.

## 5. Migration Strategy

Every schema change must be represented by migration files.

Prefer additive, backward-compatible changes during deployment.

Destructive changes require explicit approval.
