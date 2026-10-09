'use client';

import { ConfigResourcePage } from '@/components/admin/ConfigResourcePage';

export default function SalesPhasesPage() {
  return (
    <ConfigResourcePage
      resource="sales-phases"
      title="Sales phases"
      description="Configure sales phase windows, visibility and ordering."
      singular="Sales phase"
      columns={[
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Name' },
        { key: 'start_at', header: 'Starts', render: (v) => (v ? new Date(v as string).toLocaleString() : '—') },
        { key: 'end_at', header: 'Ends', render: (v) => (v ? new Date(v as string).toLocaleString() : '—') },
        { key: 'visibility', header: 'Visibility' },
        { key: 'status', header: 'Status' },
        { key: 'display_order', header: 'Order', className: 'tabular-nums' },
      ]}
      fields={[
        { key: 'event_id', label: 'Event ID', type: 'text', required: true, hint: 'UUID of the event' },
        { key: 'code', label: 'Code', type: 'text', required: true, placeholder: 'EARLY_BIRD' },
        { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Early bird' },
        { key: 'start_at', label: 'Start at', type: 'datetime-local', hint: 'ISO 8601, optional' },
        { key: 'end_at', label: 'End at', type: 'datetime-local', hint: 'ISO 8601, optional' },
        { key: 'visibility', label: 'Visibility', type: 'text', required: true, placeholder: 'PUBLIC', hint: 'PUBLIC, RESTRICTED, or HIDDEN' },
        { key: 'status', label: 'Status', type: 'text', required: true, placeholder: 'SCHEDULED', hint: 'SCHEDULED, ACTIVE, CLOSED, or ARCHIVED' },
        { key: 'display_order', label: 'Display order', type: 'number', required: true, placeholder: '0' },
      ]}
      deactivatePatch={null}
    />
  );
}