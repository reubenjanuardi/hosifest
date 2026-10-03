-- 009_config_views.sql
-- Read-only views that expose the CONFIGURATION surface the backend and admin
-- UI consume. These views only SELECT; they never compute totals or enforce rules.
-- They exist so the "no hardcoding" rule has a single stable read contract.
-- Idempotent: safe to re-run.

-- Active phase for the current instant, per event.
CREATE OR REPLACE VIEW v_current_sales_phase AS
SELECT sp.*
  FROM sales_phases sp
 WHERE sp.status = 'ACTIVE'
   AND (sp.start_at IS NULL OR sp.start_at <= now())
   AND (sp.end_at   IS NULL OR sp.end_at   >  now());

-- Ticket offers that are currently sellable by date/status.
CREATE OR REPLACE VIEW v_active_ticket_offers AS
SELECT o.*
  FROM ticket_offers o
 WHERE o.status IN ('ACTIVE', 'SOLD_OUT')
   AND (o.active_from  IS NULL OR o.active_from  <= now())
   AND (o.active_until IS NULL OR o.active_until >  now());

-- Remaining capacity per offer and per allocation (never hardcoded math:
-- just the residual of the two configured counters vs the configured quota).
CREATE OR REPLACE VIEW v_offer_capacity AS
SELECT o.id                AS ticket_offer_id,
       o.code              AS ticket_offer_code,
       o.name              AS ticket_offer_name,
       o.quota             AS quota,
       o.reserved_quantity AS reserved_quantity,
       o.sold_quantity     AS sold_quantity,
       GREATEST(o.quota - o.reserved_quantity - o.sold_quantity, 0) AS remaining,
       p.code              AS sales_phase_code
  FROM ticket_offers o
  JOIN sales_phases p ON p.id = o.sales_phase_id;

CREATE OR REPLACE VIEW v_allocation_capacity AS
SELECT a.id             AS allocation_id,
       a.ticket_offer_id,
       a.code           AS allocation_code,
       a.name           AS allocation_name,
       a.quota          AS quota,
       a.reserved_quantity,
       a.sold_quantity,
       GREATEST(a.quota - a.reserved_quantity - a.sold_quantity, 0) AS remaining,
       a.eligibility_type,
       a.congregation_id,
       a.discount_code_id
  FROM offer_allocations a;

-- Discount usage consumption against the configured cap.
CREATE OR REPLACE VIEW v_discount_usage_summary AS
SELECT dc.id                        AS discount_code_id,
       dc.code                      AS discount_code,
       dc.discount_type,
       dc.discount_value,
       dc.max_total_usage,
       COALESCE(SUM(du.quantity) FILTER (WHERE du.status = 'CONSUMED'), 0) AS consumed_quantity,
       COALESCE(SUM(du.quantity) FILTER (WHERE du.status = 'RESERVED'), 0) AS reserved_quantity,
       COALESCE(SUM(du.quantity) FILTER (WHERE du.status IN ('RESERVED','CONSUMED')), 0) AS committed_quantity,
       GREATEST(
           COALESCE(dc.max_total_usage, 0)
           - COALESCE(SUM(du.quantity) FILTER (WHERE du.status IN ('RESERVED','CONSUMED')), 0),
           0
       ) AS remaining_usage
  FROM discount_codes dc
  LEFT JOIN discount_usages du ON du.discount_code_id = dc.id
 GROUP BY dc.id, dc.code, dc.discount_type, dc.discount_value, dc.max_total_usage;

-- Per-offer benefit entitlements (configuration surface).
CREATE OR REPLACE VIEW v_offer_benefit_definitions AS
SELECT bd.*,
       o.code AS ticket_offer_code
  FROM benefit_definitions bd
  JOIN ticket_offers o ON o.id = bd.ticket_offer_id;

-- Current attendance state derived from sessions.
-- Relies on the one-active-session unique index to stay single-valued.
CREATE OR REPLACE VIEW v_ticket_attendance_state AS
SELECT t.id                AS ticket_id,
       t.ticket_code,
       t.status            AS ticket_status,
       s.id                AS active_session_id,
       s.entry_at,
       CASE WHEN s.id IS NULL THEN 'OUTSIDE' ELSE 'INSIDE' END AS attendance_state
  FROM tickets t
  LEFT JOIN attendance_sessions s
         ON s.ticket_id = t.id
        AND s.exit_at IS NULL;

-- Full-text-ish search support for attendance staff (ticket code lookup).
CREATE OR REPLACE VIEW v_ticket_lookup AS
SELECT t.id              AS ticket_id,
       t.ticket_code,
       t.holder_name_snapshot,
       t.status,
       t.price_snapshot,
       t.discount_snapshot,
       t.effective_price_snapshot,
       t.congregation_name_snapshot,
       t.issued_at,
       o.id              AS order_id,
       o.order_number,
       o.status          AS order_status,
       o.event_id,
       c.name            AS customer_name,
       c.email           AS customer_email,
       c.phone           AS customer_phone
  FROM tickets t
  JOIN order_items oi ON oi.id = t.order_item_id
  JOIN orders o       ON o.id  = oi.order_id
  JOIN customers c    ON c.id  = o.customer_id;
