'use client';

import { ConfigResourcePage } from '@/components/admin/ConfigResourcePage';

export default function OfferAllocationsPage() {
  return (
    <ConfigResourcePage
      resource="offer-allocations"
      title="Offer allocations"
      description="Quota slices and eligibility rules per ticket offer."
      singular="Offer allocation"
      columns={[
        { key: 'code', header: 'Code' },
        { key: 'name', header: 'Name' },
        { key: 'quota', header: 'Quota', className: 'tabular-nums' },
        { key: 'eligibility_type', header: 'Eligibility' },
        { key: 'status', header: 'Status' },
        { key: 'sort_order', header: 'Order', className: 'tabular-nums' },
      ]}
      fields={[
        { key: 'ticket_offer_id', label: 'Ticket offer ID', type: 'text', required: true },
        { key: 'code', label: 'Code', type: 'text', required: true },
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'description', label: 'Description', type: 'text' },
        { key: 'quota', label: 'Quota', type: 'number', required: true },
        { key: 'eligibility_type', label: 'Eligibility type', type: 'text', hint: 'FREE, CONGREGATION_LIST, DISCOUNT_CODE' },
        { key: 'congregation_id', label: 'Congregation ID', type: 'text' },
        { key: 'discount_code_id', label: 'Discount code ID', type: 'text' },
        { key: 'requires_beverage', label: 'Requires beverage', type: 'text', hint: 'true / false' },
        { key: 'requires_souvenir', label: 'Requires souvenir', type: 'text', hint: 'true / false' },
        { key: 'status', label: 'Status', type: 'text' },
        { key: 'sort_order', label: 'Sort order', type: 'number' },
      ]}
      deactivatePatch={null}
    />
  );
}