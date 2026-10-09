'use client';

import { ConfigResourcePage } from '@/components/admin/ConfigResourcePage';

export default function SouvenirOptionGroupsPage() {
  return (
    <ConfigResourcePage
      resource="souvenir-option-groups"
      title="Souvenir option groups"
      description="Choice groups a ticket holder may pick from, with min/max selections."
      singular="Souvenir option group"
      columns={[
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Name' },
        { key: 'selection_min', header: 'Min', className: 'tabular-nums' },
        { key: 'selection_max', header: 'Max', className: 'tabular-nums' },
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
        { key: 'description', label: 'Description', type: 'text' },
        { key: 'selection_min', label: 'Selection min', type: 'number' },
        { key: 'selection_max', label: 'Selection max', type: 'number' },
        { key: 'display_order', label: 'Display order', type: 'number' },
        { key: 'active', label: 'Active', type: 'text', hint: 'true / false' },
      ]}
      deactivatePatch={{ active: false }}
    />
  );
}