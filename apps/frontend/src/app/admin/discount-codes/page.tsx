'use client';

import { ConfigResourcePage } from '@/components/admin/ConfigResourcePage';

export default function DiscountCodesPage() {
  return (
    <ConfigResourcePage
      resource="discount-codes"
      title="Discount codes"
      description="Discount rules, usage limits and eligibility."
      singular="Discount code"
      columns={[
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Name' },
        { key: 'discount_type', header: 'Type' },
        { key: 'discount_value', header: 'Value', className: 'tabular-nums' },
        { key: 'status', header: 'Status' },
      ]}
      fields={[
        { key: 'code', label: 'Code', type: 'text', required: true },
        { key: 'name', label: 'Name', type: 'text' },
        { key: 'description', label: 'Description', type: 'text' },
        { key: 'discount_type', label: 'Discount type', type: 'text', hint: 'FIXED_AMOUNT, PERCENTAGE, FIXED_PRICE' },
        { key: 'discount_value', label: 'Discount value', type: 'number' },
        { key: 'max_total_usage', label: 'Max total usage', type: 'number' },
        { key: 'max_usage_per_order', label: 'Max per order', type: 'number' },
        { key: 'max_usage_per_customer', label: 'Max per customer', type: 'number' },
        { key: 'eligible_ticket_offer_id', label: 'Eligible offer ID', type: 'text' },
        { key: 'eligible_event_id', label: 'Eligible event ID', type: 'text' },
        { key: 'eligible_congregation_id', label: 'Eligible congregation ID', type: 'text' },
        { key: 'active_from', label: 'Active from', type: 'datetime-local' },
        { key: 'active_until', label: 'Active until', type: 'datetime-local' },
        { key: 'status', label: 'Status', type: 'text', hint: 'DRAFT, ACTIVE, PAUSED, EXPIRED, ARCHIVED' },
      ]}
      deactivatePatch={null}
    />
  );
}