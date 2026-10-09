'use client';

import { ConfigResourcePage } from '@/components/admin/ConfigResourcePage';

export default function CongregationsPage() {
  return (
    <ConfigResourcePage
      resource="congregations"
      title="Congregations"
      description="Early-bird eligibility list values."
      singular="Congregation"
      columns={[
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Name' },
        { key: 'region', header: 'Region' },
        {
          key: 'active',
          header: 'Active',
          render: (v) => (v === true ? 'Yes' : v === false ? 'No' : '—'),
        },
        { key: 'display_order', header: 'Order', className: 'tabular-nums' },
      ]}
      fields={[
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'code', label: 'Code', type: 'text', required: true },
        { key: 'region', label: 'Region', type: 'text' },
        { key: 'active', label: 'Active', type: 'text', hint: 'true / false' },
        { key: 'display_order', label: 'Display order', type: 'number' },
      ]}
      deactivatePatch={{ active: false }}
    />
  );
}