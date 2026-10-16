-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RideClass" AS ENUM ('ECONOMY', 'COMFORT');

-- CreateEnum
CREATE TYPE "RideStatus" AS ENUM ('AWAITING_PAYMENT', 'SEARCHING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_DRIVER');

-- AlterEnum
ALTER TYPE "LedgerAccount" ADD VALUE 'DRIVER_PAYABLE';

-- AlterEnum
ALTER TYPE "OrderActor" ADD VALUE 'DRIVER';

-- AlterEnum
ALTER TYPE "OrderKind" ADD VALUE 'RIDE';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'DRIVER';

-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "driverId" UUID;

-- CreateTable
CREATE TABLE "DriverProfile" (
    "userId" UUID NOT NULL,
    "status" "DriverStatus" NOT NULL DEFAULT 'PENDING',
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "licenceNumber" TEXT NOT NULL,
    "permitNumber" TEXT,
    "taxId" TEXT,
    "carMake" TEXT NOT NULL,
    "carModel" TEXT NOT NULL,
    "carColor" TEXT NOT NULL,
    "carYear" INTEGER NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "rideClass" "RideClass" NOT NULL DEFAULT 'ECONOMY',
    "termsAcceptedAt" TIMESTAMPTZ(3) NOT NULL,
    "reviewNote" TEXT,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "online" BOOLEAN NOT NULL DEFAULT false,
    "lastLat" DOUBLE PRECISION,
    "lastLng" DOUBLE PRECISION,
    "lastSeenAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DriverProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "Ride" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "riderId" UUID NOT NULL,
    "driverId" UUID,
    "rideClass" "RideClass" NOT NULL,
    "status" "RideStatus" NOT NULL,
    "pickupLat" DOUBLE PRECISION NOT NULL,
    "pickupLng" DOUBLE PRECISION NOT NULL,
    "pickupLabel" TEXT NOT NULL,
    "dropoffLat" DOUBLE PRECISION NOT NULL,
    "dropoffLng" DOUBLE PRECISION NOT NULL,
    "dropoffLabel" TEXT NOT NULL,
    "distanceM" INTEGER NOT NULL,
    "etaMinutes" INTEGER NOT NULL,
    "priceTiyin" BIGINT NOT NULL,
    "commissionTiyin" BIGINT NOT NULL,
    "searchingAt" TIMESTAMPTZ(3),
    "acceptedAt" TIMESTAMPTZ(3),
    "arrivedAt" TIMESTAMPTZ(3),
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "cancelledBy" "OrderActor",
    "cancelReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Ride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverSettlement" (
    "id" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "amountTiyin" BIGINT NOT NULL,
    "note" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriverProfile_plateNumber_key" ON "DriverProfile"("plateNumber");

-- CreateIndex
CREATE INDEX "DriverProfile_status_online_idx" ON "DriverProfile"("status", "online");

-- CreateIndex
CREATE UNIQUE INDEX "Ride_orderId_key" ON "Ride"("orderId");

-- CreateIndex
CREATE INDEX "Ride_status_searchingAt_idx" ON "Ride"("status", "searchingAt");

-- CreateIndex
CREATE INDEX "Ride_riderId_createdAt_idx" ON "Ride"("riderId", "createdAt");

-- CreateIndex
CREATE INDEX "Ride_driverId_status_idx" ON "Ride"("driverId", "status");

-- CreateIndex
CREATE INDEX "DriverSettlement_driverId_createdAt_idx" ON "DriverSettlement"("driverId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_account_driverId_createdAt_idx" ON "LedgerEntry"("account", "driverId", "createdAt");

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverProfile" ADD CONSTRAINT "DriverProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ride" ADD CONSTRAINT "Ride_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ride" ADD CONSTRAINT "Ride_riderId_fkey" FOREIGN KEY ("riderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ride" ADD CONSTRAINT "Ride_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverSettlement" ADD CONSTRAINT "DriverSettlement_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Driver balances always name the driver (new enum value: compare as text).
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_driver_has_user" CHECK (
  ("account"::text = 'DRIVER_PAYABLE') = ("driverId" IS NOT NULL));

ALTER TABLE "DriverProfile"
  ADD CONSTRAINT "DriverProfile_position" CHECK (
    ("lastLat" IS NULL) = ("lastLng" IS NULL)
    AND ("lastLat" IS NULL OR ("lastLat" BETWEEN -90 AND 90 AND "lastLng" BETWEEN -180 AND 180))),
  ADD CONSTRAINT "DriverProfile_car_year" CHECK ("carYear" BETWEEN 1980 AND 2100),
  -- Only active drivers can be online.
  ADD CONSTRAINT "DriverProfile_online_active" CHECK (NOT "online" OR "status" = 'ACTIVE');

ALTER TABLE "Ride"
  ADD CONSTRAINT "Ride_points" CHECK (
    "pickupLat" BETWEEN 37 AND 46 AND "pickupLng" BETWEEN 55 AND 74
    AND "dropoffLat" BETWEEN 37 AND 46 AND "dropoffLng" BETWEEN 55 AND 74),
  ADD CONSTRAINT "Ride_money" CHECK (
    "priceTiyin" > 0 AND "commissionTiyin" >= 0 AND "commissionTiyin" <= "priceTiyin"),
  -- A driver is named exactly while the ride is with them (or done by them).
  ADD CONSTRAINT "Ride_driver" CHECK (
    ("status" IN ('ACCEPTED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED')) <= ("driverId" IS NOT NULL)
    AND ("status" IN ('AWAITING_PAYMENT', 'SEARCHING', 'NO_DRIVER')) <= ("driverId" IS NULL));

-- One active ride per driver and per rider, enforced by the database.
CREATE UNIQUE INDEX "Ride_one_active_per_driver" ON "Ride" ("driverId")
  WHERE "status" IN ('ACCEPTED', 'ARRIVED', 'IN_PROGRESS');
CREATE UNIQUE INDEX "Ride_one_active_per_rider" ON "Ride" ("riderId")
  WHERE "status" IN ('AWAITING_PAYMENT', 'SEARCHING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS');

ALTER TABLE "DriverSettlement" ADD CONSTRAINT "DriverSettlement_amount_nonzero" CHECK ("amountTiyin" <> 0);
CREATE TRIGGER driver_settlement_no_delete BEFORE DELETE ON "DriverSettlement"
  FOR EACH ROW EXECUTE FUNCTION money_record_no_delete();

-- Rides carry no delivery point, mode or promo code (the Ride row has the places).
ALTER TABLE "Order" DROP CONSTRAINT "Order_food_fields";
ALTER TABLE "Order" ADD CONSTRAINT "Order_food_fields" CHECK (
  ("kind"::text = 'FOOD'
    AND "deliveryLat" BETWEEN -90 AND 90 AND "deliveryLng" BETWEEN -180 AND 180
    AND "foodDeliveryMode" IS NOT NULL AND "promoCodeId" IS NULL)
  OR ("kind"::text = 'MARKET'
    AND "deliveryLat" IS NULL AND "deliveryLng" IS NULL AND "foodDeliveryMode" IS NULL)
  OR ("kind"::text = 'RIDE'
    AND "deliveryLat" IS NULL AND "deliveryLng" IS NULL AND "foodDeliveryMode" IS NULL
    AND "promoCodeId" IS NULL AND "deliveryType" = 'COURIER' AND "discountTiyin" = 0));
