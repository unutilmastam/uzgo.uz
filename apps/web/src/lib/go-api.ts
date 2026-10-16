import {
  adminDriverListSchema,
  adminRideListSchema,
  type DriverStatus,
  driverApplicationResponseSchema,
  rideListSchema,
  type RideStatus,
  rideViewSchema,
} from '@uzgo/contracts';
import { z } from 'zod';
import { apiFetch } from './api-server';

async function getJson<T extends z.ZodType>(path: string, schema: T): Promise<z.output<T> | null> {
  const res = await apiFetch(path);
  if ([400, 401, 403, 404].includes(res.status)) return null;
  if (!res.ok) throw new Error(`API ${path} failed with ${String(res.status)}`);
  return schema.parse(await res.json());
}

/** UZGO Go (ADR 0025): the signed-in rider's rides. */
export const getMyRides = async () => (await getJson('/rides', rideListSchema))?.items ?? [];

export const getMyRide = async (number: string) =>
  (await getJson(`/rides/${encodeURIComponent(number)}`, z.object({ ride: rideViewSchema })))
    ?.ride ?? null;

/** The signed-in user's driver application (null: never applied). */
export const getDriverApplication = async () =>
  (await getJson('/driver/application', driverApplicationResponseSchema))?.application ?? null;

export const getAdminDrivers = async (status: DriverStatus | undefined) =>
  (await getJson(`/admin/drivers${status ? `?status=${status}` : ''}`, adminDriverListSchema))
    ?.items ?? [];

export const getAdminRides = async (status: RideStatus | undefined) =>
  (await getJson(`/admin/rides${status ? `?status=${status}` : ''}`, adminRideListSchema))?.items ??
  [];
