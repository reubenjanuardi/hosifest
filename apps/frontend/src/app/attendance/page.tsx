import type { Metadata } from 'next';
import { AttendanceScanner } from '@/components/attendance/AttendanceScanner';
import { Callout } from '@/components/ui/Callout';
import { PageHeader } from '@/components/ui/PageHeader';

export const metadata: Metadata = { title: 'Attendance' };

/**
 * Attendance staff surface.
 *
 * Minimal stub per Wave 1 scope: scanning entry/exit and manual code entry are
 * implemented; broader admin navigation lives in `src/app/admin` placeholders.
 * Authentication/permission gating is a backend concern and is not implemented here.
 */
export default function AttendancePage() {
  return (
    <>
      <PageHeader
        eyebrow="Staff"
        title="Attendance scanner"
        description="Select the mode, then scan a ticket QR. The result appears immediately."
      />
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-10 sm:px-6">
        <Callout tone="warning" title="Authorised staff only">
          This screen records real attendance state. Only authorised committee staff
          should use it. Access permissions are enforced by the ticketing system.
        </Callout>

        <AttendanceScanner />
      </div>
    </>
  );
}
