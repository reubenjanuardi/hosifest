import { Metadata } from 'next';
import { AdminRouteGuard } from './AdminRouteGuard';

export const metadata: Metadata = { title: 'Admin' };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminRouteGuard>{children}</AdminRouteGuard>;
}