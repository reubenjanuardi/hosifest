'use client';

import { ConfigResourcePage } from '@/components/admin/ConfigResourcePage';

export default function SouvenirOptionsPage() {
  return (
    <ConfigResourcePage
      resource="souvenir-options"
      title="Souvenir options"
      description="Individual souvenir choices inside each option group."
      singular="Souvenir option"
      columns={[
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Name' },
        { key: 'option_group_id', header: 'Group ID' },
        {
          key: 'active',
          header: 'Active',
          render: (v) => (v === true ? 'Yes' : v === false ? 'No' : '—'),
        },
        { key: 'display_order', header: 'Order', className: 'tabular-nums' },
      ]}
      fields={[
        { key: 'option_group_id', label: 'Option group ID', type: 'text', required: true },
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'code', label: 'Code', type: 'text', required: true },
        { key: 'description', label: 'Description', type: 'text' },
        { key: 'image_url', label: 'Image URL', type: 'text' },
        { key: 'metadata', label: 'Metadata', type: 'text', hint: 'JSON object' },
        { key: 'display_order', label: 'Display order', type: 'number' },
        { key: 'active', label: 'Active', type: 'text', hint: 'true / false' },
      ]}
      deactivatePatch={{ active: false }}
    />
  );
}