import {
  type SellerProduct,
  type SellerProductList,
  type SellerStore,
  type StoreMember,
  sellerProductListResponseSchema,
  sellerProductResponseSchema,
  sellerShipmentListSchema,
  sellerStoresResponseSchema,
  storeMembersResponseSchema,
} from '@uzgo/contracts';
import type { z } from 'zod';
import { apiFetch } from './api-server';

/** GET with the session cookie: null for 404 (not a member / not found), throws otherwise. */
async function getJson<T extends z.ZodType>(path: string, schema: T): Promise<z.output<T> | null> {
  const res = await apiFetch(path);
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`API ${path} failed with ${String(res.status)}`);
  return schema.parse(await res.json());
}

export async function getSellerStores(): Promise<SellerStore[]> {
  return (await getJson('/seller/stores', sellerStoresResponseSchema))?.items ?? [];
}

export async function getSellerStore(storeId: string): Promise<SellerStore | null> {
  return (await getSellerStores()).find((s) => s.id === storeId) ?? null;
}

export async function getSellerProducts(
  storeId: string,
  query: { status?: string | undefined; page: number },
): Promise<SellerProductList | null> {
  const params = new URLSearchParams({ page: String(query.page) });
  if (query.status) params.set('status', query.status);
  return getJson(
    `/seller/stores/${storeId}/products?${params.toString()}`,
    sellerProductListResponseSchema,
  );
}

export async function getSellerProduct(
  storeId: string,
  productId: string,
): Promise<SellerProduct | null> {
  return (
    (await getJson(`/seller/stores/${storeId}/products/${productId}`, sellerProductResponseSchema))
      ?.product ?? null
  );
}

export async function getSellerShipments(storeId: string) {
  return (
    (await getJson(`/seller/orders?storeId=${storeId}`, sellerShipmentListSchema))?.items ?? []
  );
}

export async function getStoreMembers(storeId: string): Promise<StoreMember[] | null> {
  return (
    (await getJson(`/seller/stores/${storeId}/members`, storeMembersResponseSchema))?.items ?? null
  );
}
