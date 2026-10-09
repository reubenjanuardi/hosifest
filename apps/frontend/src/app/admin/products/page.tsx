'use client';

import { ConfigResourcePage } from '@/components/admin/ConfigResourcePage';

export default function ProductsPage() {
  return (
    <ConfigResourcePage
      resource="products"
      title="Products"
      description="Commerce catalog sold as order items."
      singular="Product"
      columns={[
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Name' },
        { key: 'price', header: 'Price', className: 'tabular-nums' },
        { key: 'stock', header: 'Stock', className: 'tabular-nums' },
        {
          key: 'is_active',
          header: 'Active',
          render: (v) => (v === true ? 'Yes' : v === false ? 'No' : '—'),
        },
        { key: 'sort_order', header: 'Order', className: 'tabular-nums' },
      ]}
      fields={[
        { key: 'event_id', label: 'Event ID', type: 'text' },
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'code', label: 'Code', type: 'text', required: true },
        { key: 'description', label: 'Description', type: 'text' },
        { key: 'price', label: 'Price', type: 'number', required: true, hint: 'Minor units' },
        { key: 'stock', label: 'Stock', type: 'number', hint: 'Blank = unlimited' },
        { key: 'is_active', label: 'Active', type: 'text', hint: 'true / false' },
        { key: 'sort_order', label: 'Sort order', type: 'number' },
      ]}
      deactivatePatch={{ is_active: false }}
    />
  );
}