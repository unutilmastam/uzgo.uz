import {
  adminAttributesResponseSchema,
  adminCategoriesResponseSchema,
  adminOrderListResponseSchema,
  adminProductListResponseSchema,
  adminProductSchema,
  adminStoreListResponseSchema,
  adminUserListResponseSchema,
  auditListResponseSchema,
  orderResponseSchema,
  totpStatusSchema,
} from '@uzgo/contracts';
import { z } from 'zod';
import { apiFetch } from './api-server';

/**
 * Staff GET with the session cookie. 400/404 → null. 401/403 → null as well:
 * Next.js renders a page in parallel with its layouts, so a page may fetch
 * before the TOTP gate in the layout redirects. The API refuses (TOTP_REQUIRED)
 * and nothing is shown; the redirect wins.
 */
async function getJson<T extends z.ZodType>(path: string, schema: T): Promise<z.output<T> | null> {
  const res = await apiFetch(path);
  // 400: a malformed filter typed into the URL; 404: no such record.
  if ([400, 401, 403, 404].includes(res.status)) return null;
  if (!res.ok) throw new Error(`API ${path} failed with ${String(res.status)}`);
  return schema.parse(await res.json());
}

const qs = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
};

export async function getTotpStatus() {
  const res = await apiFetch('/auth/totp/status');
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`API /auth/totp/status failed with ${String(res.status)}`);
  return totpStatusSchema.parse(await res.json());
}

export const getAdminStores = (status: string | undefined, page: number) =>
  getJson(`/admin/stores${qs({ status, page })}`, adminStoreListResponseSchema);

export const getAdminProducts = (status: string | undefined, page: number) =>
  getJson(`/admin/products${qs({ status, page })}`, adminProductListResponseSchema);

export const getAdminProduct = async (id: string) =>
  (await getJson(`/admin/products/${id}`, z.object({ product: adminProductSchema })))?.product ??
  null;

export const getAdminCategories = async () =>
  (await getJson('/admin/categories', adminCategoriesResponseSchema))?.items ?? [];

export const getAdminAttributes = async () =>
  (await getJson('/admin/attributes', adminAttributesResponseSchema))?.items ?? [];

export const getAdminUsers = (query: { phone?: string; role?: string; page: number }) =>
  getJson(`/admin/users${qs(query)}`, adminUserListResponseSchema);

export const getAdminOrders = (query: { status?: string; number?: string; page: number }) =>
  getJson(`/admin/orders${qs(query)}`, adminOrderListResponseSchema);

export const getAdminOrder = async (number: string) =>
  (await getJson(`/admin/orders/${encodeURIComponent(number)}`, orderResponseSchema))?.order ??
  null;

export const getAudit = (query: { action?: string; before?: string }) =>
  getJson(`/admin/audit${qs(query)}`, auditListResponseSchema);
