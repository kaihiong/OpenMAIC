/**
 * Fork: /admin — users, courses and usage for administrators.
 *
 * The check happens here on the server (the middleware-verified NIE owner must
 * be listed in OPENMAIC_ADMIN_USERS); anyone else gets a plain 404, and every
 * /api/admin route checks again.
 */
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { adminOwnerFromHeaders } from '@/lib/server/admin/admins';
import { AdminDashboard } from '@/components/admin/admin-dashboard';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  if (!adminOwnerFromHeaders(await headers())) notFound();
  return <AdminDashboard />;
}
