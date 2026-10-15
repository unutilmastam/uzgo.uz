import type { FoodOrderInfo } from '@uzgo/contracts';
import type { Prisma } from '../generated/prisma/client.js';
import { distanceM, etaMinutes } from './geo.js';

type Names = { uz: string; ru: string };

/** Relations a food order view needs (added to the order include). */
export const foodShipmentInclude = {
  store: {
    select: {
      id: true,
      slug: true,
      name: true,
      isDemo: true,
      restaurant: { select: { phone: true, lat: true, lng: true, prepMinutes: true } },
    },
  },
  courier: {
    select: {
      phone: true,
      profile: { select: { firstName: true } },
      courierProfile: {
        select: { vehicle: true, lastLat: true, lastLng: true, lastSeenAt: true },
      },
    },
  },
} satisfies Prisma.SellerOrderInclude;

type FoodShipment = Prisma.SellerOrderGetPayload<{ include: typeof foodShipmentInclude }>;

const ACTIVE = new Set(['NEW', 'ACCEPTED', 'PACKED', 'HANDED_TO_DELIVERY']);
/** A courier position older than this is not shown (app closed, no signal). */
const POSITION_TTL_MS = 10 * 60 * 1000;

/** Food part of the customer/staff order view (ADR 0024). */
export function foodOrderInfo(
  order: {
    createdAt: Date;
    deliveryLat: number | null;
    deliveryLng: number | null;
    foodDeliveryMode: 'SELF' | 'UZGO' | null;
  },
  shipment: FoodShipment,
  now = new Date(),
): FoodOrderInfo | null {
  const restaurant = shipment.store.restaurant;
  if (!restaurant || order.deliveryLat === null || order.deliveryLng === null) return null;
  const destination = { lat: order.deliveryLat, lng: order.deliveryLng };
  const active = ACTIVE.has(shipment.status);
  const start = shipment.acceptedAt ?? order.createdAt;
  const eta = etaMinutes(restaurant.prepMinutes, distanceM(restaurant, destination));
  const courier = shipment.courier;
  const profile = courier?.courierProfile;
  const fresh =
    profile?.lastSeenAt && now.getTime() - profile.lastSeenAt.getTime() < POSITION_TTL_MS;
  return {
    deliveryMode: order.foodDeliveryMode ?? 'SELF',
    restaurant: {
      id: shipment.store.id,
      slug: shipment.store.slug,
      name: shipment.store.name as Names,
      phone: restaurant.phone,
      lat: restaurant.lat,
      lng: restaurant.lng,
    },
    destination,
    etaAt: active ? new Date(start.getTime() + eta * 60_000).toISOString() : null,
    courier:
      courier && profile
        ? {
            name: courier.profile?.firstName ?? null,
            phone: courier.phone,
            vehicle: profile.vehicle,
            position:
              active && fresh && profile.lastLat !== null && profile.lastLng !== null
                ? {
                    lat: profile.lastLat,
                    lng: profile.lastLng,
                    at: profile.lastSeenAt?.toISOString() ?? now.toISOString(),
                  }
                : null,
          }
        : null,
  };
}
