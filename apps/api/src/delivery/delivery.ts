import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/http-exception.filter.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { DeliveryType } from '../generated/prisma/enums.js';

type Db = Prisma.TransactionClient;

export type DeliveryPlan = {
  /** Delivery price per store shipment (tiyin). */
  feeFor: (itemsTotalTiyin: bigint) => bigint;
  etaDays: { min: number; max: number } | null;
  pickupPoint: { id: string; name: unknown; address: string; hours: string | null } | null;
};

const unavailable = () =>
  new AppException(
    HttpStatus.CONFLICT,
    'DELIVERY_UNAVAILABLE',
    'Delivery is not available for this address',
  );

/**
 * Delivery rules (ADR 0019): courier price per shipment from the district's
 * zone (free from a threshold); no zone = price agreed with the seller (0);
 * an inactive zone = no courier delivery; pickup is free at an active point in
 * the chosen district.
 */
export async function planDelivery(
  db: Db,
  input: { districtId: string; type: DeliveryType; pickupPointId?: string | undefined },
): Promise<DeliveryPlan> {
  if (input.type === 'PICKUP') {
    const point = input.pickupPointId
      ? await db.pickupPoint.findFirst({
          where: { id: input.pickupPointId, districtId: input.districtId, active: true },
          select: { id: true, name: true, address: true, hours: true },
        })
      : null;
    if (!point) throw unavailable();
    return { feeFor: () => 0n, etaDays: null, pickupPoint: point };
  }
  const zone = await db.deliveryZone.findUnique({ where: { districtId: input.districtId } });
  if (!zone) return { feeFor: () => 0n, etaDays: null, pickupPoint: null };
  if (!zone.active) throw unavailable();
  return {
    feeFor: (itemsTotal) =>
      zone.freeFromTiyin !== null && itemsTotal >= zone.freeFromTiyin ? 0n : zone.feeTiyin,
    etaDays: { min: zone.etaDaysMin, max: zone.etaDaysMax },
    pickupPoint: null,
  };
}
