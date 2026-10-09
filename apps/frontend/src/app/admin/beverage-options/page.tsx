'use client';

import { ConfigResourcePage } from '@/components/admin/ConfigResourcePage';

export default function BeverageOptionsPage() {
  return (
    <ConfigResourcePage
      resource="beverage-options"
      title="Beverage options"
      description="Beverage catalog entries available as ticket benefits."
      singular="Beverage option"
      columns={[
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Name' },
        { key: 'description', header: 'Description' },
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
        { key: 'image_url', label: 'Image URL', type: 'text' },
        { key: 'active', label: 'Active', type: 'text', hint: 'true / false' },
        { key: 'display_order', label: 'Display order', type: 'number' },
      ]}
      deactivatePatch={{ active: false }}
    />
  );
}