import type { CurrentUser, Role } from '@uzgo/contracts';
import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/require-user';

const STAFF: Role[] = ['MODERATOR', 'ADMIN', 'SUPER_ADMIN'];

export const isAdmin = (user: CurrentUser) =>
  user.roles.includes('ADMIN') || user.roles.includes('SUPER_ADMIN');

/**
 * Staff gate for admin pages. Non-staff get a plain 404, so the back office
 * is not advertised. The API enforces roles and TOTP on every call anyway.
 */
export async function requireStaff(next: string, level: 'moderator' | 'admin' = 'moderator') {
  const user = await requireUser(next);
  if (!user.roles.some((r) => STAFF.includes(r))) notFound();
  if (level === 'admin' && !isAdmin(user)) notFound();
  return user;
}
