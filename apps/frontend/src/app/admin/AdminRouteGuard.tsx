'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { readSession } from '@/lib/admin-auth';

/**
 * Client-side route guard for /admin/* pages.
 *
 * A server-side redirect would be a security control, but this is only a UX
 * improvement: the backend enforces Authorization on every /api/v1/admin request,
 * so an unauthenticated browser will 401 on its first data fetch. This component
 * prevents a flash of the dashboard shell before that fetch fails.
 */
export function AdminRouteGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const session = readSession();
    if (!session && pathname !== '/admin/login') {
      router.replace('/admin/login');
    }
  }, [router, pathname]);

  // Render null while the redirect is in flight; the page shows nothing
  // until the session check passes or the router navigates.
  const session = readSession();
  if (!session && pathname !== '/admin/login') {
    return null;
  }

  return <>{children}</>;
}