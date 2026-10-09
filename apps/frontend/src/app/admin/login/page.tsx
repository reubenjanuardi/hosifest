import { Metadata } from 'next';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';

export const metadata: Metadata = { title: 'Admin sign-in' };

export default function AdminLoginPage() {
  return <AdminLoginForm />;
}