'use client';

import { ConfigResourcePage } from '@/components/admin/ConfigResourcePage';

export default function TicketOffersPage() {
  return (
    <ConfigResourcePage
      resource="ticket-offers"
      title="Ticket offers"
      description="Configure ticket offers, pricing, quota and purchase limits."
      singular="Ticket offer"
      columns={[
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Name' },
        { key: 'base_price', header: 'Price', className: 'tabular-nums' },
        { key: 'quota', header: 'Quota', className: 'tabular-nums' },
        { key: 'status', header: 'Status' },
        { key: 'visibility', header: 'Visibility' },
        { key: 'sort_order', header: 'Order', className: 'tabular-nums' },
      ]}
      fields={[
        { key: 'sales_phase_id', label: 'Sales phase ID', type: 'text', required: true, hint: 'UUID' },
        { key: 'code', label: 'Code', type: 'text', required: true },
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'description', label: 'Description', type: 'text' },
        { key: 'base_price', label: 'Base price', type: 'number', required: true, hint: 'Minor units' },
        { key: 'quota', label: 'Quota', type: 'number', required: true },
        { key: 'purchase_limit_min', label: 'Min per order', type: 'number' },
        { key: 'purchase_limit_max', label: 'Max per order', type: 'number' },
        { key: 'active_from', label: 'Active from', type: 'datetime-local' },
        { key: 'active_until', label: 'Active until', type: 'datetime-local' },
        { key: 'visibility', label: 'Visibility', type: 'text', hint: 'PUBLIC, RESTRICTED, HIDDEN' },
        { key: 'sales_channel', label: 'Sales channel', type: 'text', hint: 'ONLINE, OFFLINE, BOTH' },
        { key: 'status', label: 'Status', type: 'text', hint: 'DRAFT, ACTIVE, SOLD_OUT, CLOSED, ARCHIVED' },
        { key: 'sort_order', label: 'Sort order', type: 'number' },
      ]}
      deactivatePatch={null}
    />
  );
}