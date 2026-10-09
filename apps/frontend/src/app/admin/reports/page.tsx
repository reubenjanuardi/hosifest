import { Metadata } from 'next';
import { ReportsClient } from './ReportsClient';

export const metadata: Metadata = { title: 'Admin Reports' };

export default function AdminReportsPage() {
  return <ReportsClient />;
}