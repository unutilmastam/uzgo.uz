import {
  adminCourierListSchema,
  adminRestaurantListSchema,
  adminRestaurantSchema,
  restaurantDetailSchema,
  restaurantListSchema,
  restaurantOrderListSchema,
} from '@uzgo/contracts';
import { z } from 'zod';
import { apiFetch } from './api-server';

async function getJson<T extends z.ZodType>(path: string, schema: T): Promise<z.output<T> | null> {
  const res = await apiFetch(path);
  if ([400, 401, 403, 404].includes(res.status)) return null;
  if (!res.ok) throw new Error(`API ${path} failed with ${String(res.status)}`);
  return schema.parse(await res.json());
}

/** UZGO Food catalogue (ADR 0024); location filtering happens in the browser. */
export const getRestaurants = async () =>
  (await getJson('/food/restaurants', restaurantListSchema))?.items ?? [];

export const getRestaurant = (slug: string) =>
  getJson(`/food/restaurants/${encodeURIComponent(slug)}`, restaurantDetailSchema);

/** Restaurant team: the restaurant (with menu) and its orders; null for non-members. */
export const getTeamRestaurant = async (storeId: string) =>
  (await getJson(`/restaurant/${storeId}`, z.object({ restaurant: adminRestaurantSchema })))
    ?.restaurant ?? null;

export const getTeamOrders = async (storeId: string, scope: 'active' | 'all') =>
  (await getJson(`/restaurant/${storeId}/orders?scope=${scope}`, restaurantOrderListSchema))
    ?.items ?? [];

export const getAdminRestaurants = async () =>
  (await getJson('/admin/restaurants', adminRestaurantListSchema))?.items ?? [];

export const getAdminRestaurant = async (id: string) =>
  (await getJson(`/admin/restaurants/${id}`, z.object({ restaurant: adminRestaurantSchema })))
    ?.restaurant ?? null;

export const getAdminCouriers = async () =>
  (await getJson('/admin/couriers', adminCourierListSchema))?.items ?? [];
