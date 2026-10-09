'use client';

import { ConfigResourcePage } from '@/components/admin/ConfigResourcePage';

export default function EventsPage() {
  return (
    <ConfigResourcePage
      resource="events"
      title="Events"
      description="Events, venue details and lifecycle status."
      singular="Event"
      columns={[
        { key: 'name', header: 'Name' },
        { key: 'slug', header: 'Slug' },
        {
          key: 'starts_at',
          header: 'Starts',
          render: (v) => (v ? new Date(v as string).toLocaleString() : '—'),
        },
        {
          key: 'ends_at',
          header: 'Ends',
          render: (v) => (v ? new Date(v as string).toLocaleString() : '—'),
        },
        { key: 'status', header: 'Status' },
      ]}
      fields={[
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'slug', label: 'Slug', type: 'text', required: true, hint: 'URL-safe unique identifier' },
        { key: 'description', label: 'Description', type: 'text' },
        { key: 'starts_at', label: 'Starts at', type: 'datetime-local' },
        { key: 'ends_at', label: 'Ends at', type: 'datetime-local' },
        { key: 'venue_name', label: 'Venue name', type: 'text' },
        { key: 'venue_address', label: 'Venue address', type: 'text' },
        { key: 'status', label: 'Status', type: 'text', hint: 'DRAFT, PUBLISHED, ACTIVE, ARCHIVED, CANCELLED' },
      ]}
      deactivatePatch={{ status: 'ARCHIVED' }}
    />
  );
}