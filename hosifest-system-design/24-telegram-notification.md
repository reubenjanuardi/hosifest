# 24 — Telegram Notification Module

Status: **Design draft — awaiting approval**
Scope: Backend-only delivery of order activity and payment review to Telegram.

---

## 1. Purpose

Admins/Finance receive real-time order activity in a Telegram **forum group** instead of
polling the admin web UI. Payment review can be performed **directly from Telegram** via
inline buttons, with the admin web UI remaining an equally valid path.

This module is **administrative notification only**. It carries no customer-facing
delivery — see §9.

---

## 2. Decisions Taken (locked with product owner)

| # | Decision |
|---|-----------|
| D-01 | Delivery target is a Telegram **forum group** (topics), one bot, one group. |
| D-02 | Reject reason is **admin-only**. It is visible in Telegram and in the admin web UI, never to the customer. |
| D-03 | Reject reason can be supplied from **either** Telegram **or** the admin web UI. Both write the same field. |
| D-04 | Order log notifies: `CREATED`, `→ PAYMENT_REVIEW`, `→ PAID`. It does **not** notify `EXPIRED` or `CANCELLED`. |
| D-05 | No customer notification in this module. Customer channel is a separate future decision (§9). |
| D-06 | No queue broker. Volume ceiling is ~200–300 orders for the whole event; direct HTTPS calls are sufficient. |

### Why D-06 is safe

Peak delivery is bounded by ticket quota, not by traffic. Every event notification is
triggered by an order transition, and there can be at most ~200 orders. Telegram's
documented group limit is ~30 messages/second; realistic peak is under 1/second. A queue
would add operational surface with no benefit at this scale. If D-06 is ever revisited,
the trigger points are already isolated in `telegram.service.ts` (§5).

---

## 3. Topics

Two topics in the forum group. Anything else is added later without code restructuring.

| Topic | Purpose | Trigger |
|-------|---------|---------|
| `📋 Order Log` | Read-only activity trail | `order.created`, `order.payment_submitted`, `order.paid` |
| `💰 Payment Review` | Actionable verification queue | `payment.proof_submitted` |

Both are resolved by **numeric thread ID** stored in env (`TELEGRAM_TOPIC_*`). Topic
names are never parsed from messages; renaming a topic in Telegram must not break
delivery.

---

## 4. Message Formats

### 4.1 Order Log

New order:

```text
📋 ORDER CREATED
HOS-202610-00123 · WAITING_PAYMENT
2× Early Bird GPIB Hosiana (Rp300.000)
1× Presale (Rp225.000)
Total: Rp525.000
Buyer: Budi Santoso · 0812xxxxxxx
```

Proof submitted:

```text
📋 PAYMENT PROOF SUBMITTED
HOS-202610-00123 · PAYMENT_REVIEW
Amount: Rp525.000 · Method: QRIS
```

Paid:

```text
✅ ORDER PAID
HOS-202610-00123 · PAID
Tickets issued: 3
[ABC-7K2D9] [DEF-1M4Q2] [GHI-8R3T5]
```

Status-change lines for `EXPIRED` and `CANCELLED` are intentionally omitted (D-04).
Both transitions remain fully visible in the admin UI, reports and `order_status_history`.

### 4.2 Payment Review

```text
💰 PAYMENT REVIEW

HOS-202610-00123
Rp525.000 · QRIS
Buyer: Budi Santoso · 0812xxxxxxx
2× Early Bird GPIB Hosiana · 1× Presale
Uploaded: 07 Oct 2026 14:32 WIB
Expires: 07 Oct 2026 15:02 WIB
```

```text
[✅ APPROVE]  [❌ REJECT]  [🔎 OPEN ORDER]
```

**No proof link is embedded in the static message.** See §6.2 — presigned URLs expire.

After resolution the message is edited in place, keyboard removed:

```text
💰 PAYMENT REVIEW — RESOLVED

HOS-202610-00123
✅ APPROVED by @budi_admin at 14:35 WIB
```

or

```text
💰 PAYMENT REVIEW — RESOLVED

HOS-202610-00123
❌ REJECTED by @budi_admin at 14:35 WIB
Reason: nominal Rp500.000, kurang Rp25.000
```

---

## 5. Module Shape

```text
src/modules/telegram/
├── telegram.service.ts        # Bot API transport + message formatting
├── telegram.routes.ts         # POST /webhook/telegram (public, unauthenticated)
├── telegram.callbacks.ts      # callback_data encode/decode, strict parsing
├── telegram.formatters.ts     # Order log + payment review message bodies
└── telegram.types.ts          # Telegram Update subset actually consumed
```

Wiring:

- `container.ts` — construct `TelegramService`, inject into `OrderService` and
  `PaymentService` as a **narrow interface** (`Notifier`), not the concrete class, so
  unit tests substitute a no-op double with no network.
- `order.service.ts` — after order create commits → `order.created`
- `payment.service.ts` — after proof submit commits → `payment.proof_submitted`
- `payment.service.approvePayment` / `rejectPayment` — after commit → resolve message

All emission happens **after** the database transaction returns. A notification failure
must never roll back, fail, or delay the order.

---

## 6. Design Decisions & Constraints

### 6.1 Notification is never authoritative

The database is the source of truth. Telegram is a delivery surface only. If Telegram is
down, orders and payments behave exactly as they do today — the module fails closed and
silently, logging a warning.

Consequence: **the admin web UI must remain fully functional** with Telegram disabled.
No business flow may require Telegram to complete.

### 6.2 Proof files are never linked in a static message

`StorageService.presignedGetUrl` has a bounded TTL (default 900s). A presigned URL pasted
into a Telegram message is dead after 15 minutes, and financial review routinely happens
later than that.

The `[🔎 OPEN ORDER]` button therefore **generates a fresh presigned URL at click time**,
inside the callback handler, and returns it as a reply. The URL exists only in the admin's
private chat and is never written to `Order Log`.

The same handler returns the full order detail, so review needs no second system.

### 6.3 Reject requires a reason before it is accepted

Telegram has no modal form. Pressing `❌ REJECT` puts the bot into a short-lived
**conversation state**:

1. Bot answers the callback with `answerCallbackQuery` (stops the spinner) and replies:
   `Send the rejection reason for HOS-202610-00123.`
2. The next `message` from that same `user.id`, in that same chat, is taken as the reason.
3. `rejectPayment(orderId, reason, context)` runs; message edits to `❌ REJECTED`.

Rules:

- State is stored in `telegram_callback_sessions` with a **5-minute TTL** and is keyed by
  `(chat_id, telegram_user_id)`. A stray message outside that window is ignored.
- Reason is truncated to 1000 characters, matching the admin web UI limit, so both paths
  produce identical stored data.
- Pressing `❌ REJECT` then abandoning the conversation expires the session harmlessly; the
  order stays `PAYMENT_REVIEW`.
- If the admin prefers the web UI, they ignore the prompt entirely. **Both paths write
  `orders.cancel_reason` through the same service call** (D-03).

### 6.4 Idempotency and double-tap

| Risk | Mitigation |
|------|-----------|
| Button pressed twice | `approvePayment` is already idempotent (BR-PAY-07, three independent guards). A repeat returns `transitioned: false`; the handler replies "already resolved" and does not re-edit the message. |
| Webhook redelivery | `callback_query.id` is recorded in `telegram_callback_log` with a unique index. A duplicate is dropped. |
| Non-admin presses a button | `user.id` checked against the admin allowlist **before** any service call. Reply is `answerCallbackQuery` only — the service layer never sees the request. |
| Expired callback on an old message | Order is no longer `PAYMENT_REVIEW`; the service returns without transitioning and the handler reports current state. |

### 6.5 Authorization mapping — schema conflict (must resolve before coding)

`orders.cancelled_by` is `UUID REFERENCES users(id)`, and `AuditService.actor_user_id` is
likewise a `users.id` UUID. A Telegram identity is an **int64**, not a UUID.

There is no correct way to store a Telegram `user.id` in these columns without lying about
the value. Options:

| Option | Change | Trade-off |
|--------|--------|-----------|
| **A (recommended)** | Add `users.telegram_user_id BIGINT NULL` + partial unique index; seed admin `users` rows with their Telegram id. `actorUserId` stays a real `users.id`. | Clean audit. Requires mapping Telegram admins to existing user rows before enabling. |
| B | Add `orders.cancelled_by_telegram_id BIGINT` alongside `cancelled_by`. | Two nullable actor columns; divergent state; audit rows still have no actor. |
| C | Store the int64 in `actor_user_id` cast to text. | **Rejected** — breaks referential integrity and corrupts audit data. |

**Decision required: Option A.** Under A, the seed must include one `users` row per
Telegram admin, matched by email, carrying their `telegram_user_id`.

`TELEGRAM_ADMIN_IDS` stays an env allowlist as the **first** gate (cheap rejection before
any DB work); `users.telegram_user_id` is the **second** gate that produces the audit
actor. Both must pass.

### 6.6 Webhook endpoint security

`POST /webhook/telegram` is the only publicly reachable, unauthenticated route in the
module. It is reachable through the existing Cloudflare Tunnel.

Protections:

- **`X-Telegram-Bot-Api-Secret-Token`** header must match `TELEGRAM_WEBHOOK_SECRET`.
  Set via `setWebhook`. Without it the endpoint accepts forged approvals.
- Applied to a **separate** rate limit bucket, default 60/min, well under Telegram's own
  redelivery behaviour.
- The route sits outside `auth.plugin.ts` entirely; it never reaches JWT middleware.
- Unknown update types and unparseable `callback_data` return `200` with no side effect.
  Telegram retries non-2xx, so a deliberate `200` is what stops a bad payload from looping.

### 6.7 Secrets

`TELEGRAM_BOT_TOKEN` is a bearer credential for the bot and grants full control of it.

- Environment only. Never in Git, never in a Docker image, never in this document.
- Three channels: `apps/backend/.env` (local), `/opt/hosifest/deploy/.env` (VPS), and
  GitHub Actions secrets `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET`.
- Rotating the token via @BotFather invalidates the old webhook registration; the
  `setWebhook` call must be re-issued.

---

## 7. Environment Variables

```env
TELEGRAM_ENABLED=false
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
TELEGRAM_CHAT_ID=
TELEGRAM_TOPIC_ORDER_LOG=
TELEGRAM_TOPIC_PAYMENT_REVIEW=
TELEGRAM_ADMIN_IDS=
TELEGRAM_WEBHOOK_URL=
```

Notes:

- `TELEGRAM_ENABLED` gates the whole module. When `false`, `TelegramService` is a no-op
  and the webhook route is not registered. The system behaves exactly as today.
- `TELEGRAM_CHAT_ID` is negative for a supergroup (`-100...`). It is validated at boot.
- `TELEGRAM_ADMIN_IDS` is a comma-separated list of **numeric ids**, never usernames.
  Usernames are mutable and reassignable; numeric ids are not.
- `TELEGRAM_WEBHOOK_URL` is the public API origin + `/api/webhook/telegram`.

---

## 8. Database Additions

New migration `011_telegram_notifications.sql`:

```sql
CREATE TABLE IF NOT EXISTS telegram_deliveries (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type     VARCHAR(60) NOT NULL,
    chat_id        BIGINT NOT NULL,
    message_id     BIGINT,
    topic_id       BIGINT,
    entity_type    VARCHAR(40),
    entity_id      UUID,
    status         VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    error          TEXT,
    attempts       INTEGER NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Purpose: resolve the message that must later be edited (approval/rejection needs
`chat_id` + `message_id` for the original `PAYMENT REVIEW` post), and give operators a
view of delivery failures without reading application logs.

```sql
CREATE TABLE IF NOT EXISTS telegram_callback_log (
    callback_query_id  VARCHAR(80) PRIMARY KEY,
    telegram_user_id   BIGINT NOT NULL,
    action             VARCHAR(20) NOT NULL,
    order_id           UUID REFERENCES orders(id) ON DELETE CASCADE,
    result             VARCHAR(40) NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Purpose: replay protection (PK on `callback_query_id` is the dedup mechanism).

```sql
CREATE TABLE IF NOT EXISTS telegram_callback_sessions (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id        BIGINT NOT NULL,
    telegram_user_id BIGINT NOT NULL,
    action         VARCHAR(20) NOT NULL,
    order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    expires_at     TIMESTAMPTZ NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Purpose: pending reject-reason conversation (§6.3). Rows older than the TTL are pruned by
the existing maintenance job.

Plus, per §6.5 Option A:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS users_telegram_user_id_key
    ON users (telegram_user_id) WHERE telegram_user_id IS NOT NULL;
```

No notification content is stored. Messages are reconstructed from current order state;
there is no need to retain message history, and order snapshots stay in the order tables.

---

## 9. Out of Scope

- Customer-facing notification (WhatsApp, email, SMS, customer Telegram). Channel is
  undecided and must be decided separately — it changes the data model, because delivery
  status per customer must then be persisted.
- Refund notifications (`REFUNDED` exists as an order status but has no flow yet).
- Ticket, attendance, and souvenir notifications.
- Multiple destination groups, or per-role routing.
- Rich media in messages (proof photos are fetched on demand, never pushed).

---

## 10. New Business Rules

Proposed additions to `12-business-rules.md`, section 6 (Administration):

```text
### BR-ADM-06 — Administrative Notification

Order creation, payment proof submission and payment approval are notified to the
configured administrative channel.

### BR-ADM-07 — Channel Independence

Administrative notification failure MUST NOT affect order or payment processing.

### BR-ADM-08 — Telegram Payment Verification

Payment approval or rejection MAY be performed from the administrative notification
channel, subject to the same authorization and audit requirements as the admin web UI.
```

New acceptance criteria for `23-acceptance-criteria.md`, section I:

```text
### AC-SEC-06
Notification failure does not prevent order creation, proof submission or payment
resolution.

### AC-SEC-07
A notification-channel payment approval produces the same state, tickets and audit
record as the admin web UI approval.

### AC-SEC-08
Only allowlisted administrators can approve or reject payment from the notification
channel.

### AC-SEC-09
A repeated approval action from the notification channel does not issue duplicate
tickets.
```

---

## 11. Delivery Plan

Each phase ends green: `typecheck`, `build`, `test` all pass.

| Phase | Work | Gate |
|-------|------|------|
| 0 | Resolve §6.5 schema decision. Collect Telegram ids + topic ids. | Decision recorded here |
| 1 | Migration `011_telegram_notifications.sql` | Migrates on a copy of prod schema |
| 2 | `env.ts` schema + `.env.example` | Server boots with `TELEGRAM_ENABLED=false` |
| 3 | `telegram.service.ts` transport, injectable | Unit tests with mocked `fetch` |
| 4 | Formatters + `container.ts` wiring, no-op default | 58/58 existing tests still pass |
| 5 | Emit order-log notifications | Log messages verified against real bot |
| 6 | Emit payment-review notification | Proof submission verified end to end |
| 7 | Callback routing + idempotency | Double-tap test issues no duplicate ticket |
| 8 | Approve action from Telegram | Same tickets/audit as web UI |
| 9 | Reject action + reason conversation | Reason matches web UI storage |
| 10 | Wire `setWebhook` + VPS deploy secrets | Header rejection verified |
| 11 | Update `12`, `23`, docs | ROOT review |

**Phases 5–6 are independently valuable.** Even if phases 7–9 slip, the read-only log and
review queue work, and that is where most of the operational time saving comes from.

---

## 12. Open Questions

1. **§6.5 Option A** — approve the `users.telegram_user_id` mapping?
2. Telegram admins who are **not** HOSIFEST web accounts: should they be permitted to
   approve at all? Under Option A they need a `users` row, which grants a web login. A
   separate `telegram_admin_identities` table would allow approve-only, no web access.
3. Reject-reason conversation timeout currently 5 minutes. Acceptable?
4. `📋 Order Log` retains full buyer name and phone. Confirm this is acceptable for a
   group containing everyone with `payment:review`, including any non-admin volunteers.
5. Should `[🔎 OPEN ORDER]` also surface the buyer's customization data (keychain text,
   beverage choice), so approval does not require opening the web UI?
