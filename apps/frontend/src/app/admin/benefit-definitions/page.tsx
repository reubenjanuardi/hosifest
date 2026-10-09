'use client';

import { ConfigResourcePage } from '@/components/admin/ConfigResourcePage';

export default function BenefitDefinitionsPage() {
  return (
    <ConfigResourcePage
      resource="benefit-definitions"
      title="Benefit definitions"
      description="Entitlements included with each ticket offer."
      singular="Benefit definition"
      columns={[
        { key: 'name', header: 'Name' },
        { key: 'benefit_type', header: 'Type' },
        { key: 'quantity', header: 'Qty', className: 'tabular-nums' },
        { key: 'source_type', header: 'Source' },
        {
          key: 'is_mandatory',
          header: 'Mandatory',
          render: (v) => (v === true ? 'Yes' : v === false ? 'No' : '—'),
        },
        { key: 'sort_order', header: 'Order', className: 'tabular-nums' },
      ]}
      fields={[
        { key: 'ticket_offer_id', label: 'Ticket offer ID', type: 'text', required: true },
        { key: 'benefit_type', label: 'Benefit type', type: 'text', required: true, hint: 'e.g. BEVERAGE, SOUVENIR, TUMBLER' },
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'quantity', label: 'Quantity', type: 'number', required: true },
        { key: 'source_type', label: 'Source type', type: 'text', hint: 'e.g. BEVERAGE_OPTION, SOUVENIR_OPTION' },
        { key: 'source_option_id', label: 'Source option ID', type: 'text' },
        { key: 'is_mandatory', label: 'Mandatory', type: 'text', hint: 'true / false' },
        { key: 'sort_order', label: 'Sort order', type: 'number' },
      ]}
      deactivatePatch={null}
    />
  );
}