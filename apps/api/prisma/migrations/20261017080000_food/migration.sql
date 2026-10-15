-- CreateEnum
CREATE TYPE "StoreKind" AS ENUM ('SHOP', 'RESTAURANT');

-- CreateEnum
CREATE TYPE "OrderKind" AS ENUM ('MARKET', 'FOOD');

-- CreateEnum
CREATE TYPE "FoodDeliveryMode" AS ENUM ('SELF', 'UZGO');

-- CreateEnum
CREATE TYPE "CourierStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CourierVehicle" AS ENUM ('FOOT', 'BICYCLE', 'SCOOTER', 'CAR');

-- AlterEnum
ALTER TYPE "LedgerAccount" ADD VALUE 'COURIER_PAYABLE';

-- AlterEnum
ALTER TYPE "OrderActor" ADD VALUE 'COURIER';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'COURIER';

-- AlterTable
ALTER TABLE "LedgerEntry" ADD COLUMN     "courierId" UUID;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryLat" DOUBLE PRECISION,
ADD COLUMN     "deliveryLng" DOUBLE PRECISION,
ADD COLUMN     "foodDeliveryMode" "FoodDeliveryMode",
ADD COLUMN     "kind" "OrderKind" NOT NULL DEFAULT 'MARKET';

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "menuItemId" UUID,
ALTER COLUMN "variantId" DROP NOT NULL,
ALTER COLUMN "productId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SellerOrder" ADD COLUMN     "acceptedAt" TIMESTAMPTZ(3),
ADD COLUMN     "courierAssignedAt" TIMESTAMPTZ(3),
ADD COLUMN     "courierFeeTiyin" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "courierId" UUID,
ADD COLUMN     "readyAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "kind" "StoreKind" NOT NULL DEFAULT 'SHOP';

-- CreateTable
CREATE TABLE "RestaurantProfile" (
    "storeId" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "phone" TEXT,
    "deliveryMode" "FoodDeliveryMode" NOT NULL,
    "deliveryRadiusM" INTEGER NOT NULL DEFAULT 5000,
    "selfDeliveryFeeTiyin" BIGINT NOT NULL DEFAULT 0,
    "minOrderTiyin" BIGINT NOT NULL DEFAULT 0,
    "prepMinutes" INTEGER NOT NULL DEFAULT 25,
    "openingHours" JSONB NOT NULL,
    "acceptingOrders" BOOLEAN NOT NULL DEFAULT true,
    "coverKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RestaurantProfile_pkey" PRIMARY KEY ("storeId")
);

-- CreateTable
CREATE TABLE "FoodMenuCategory" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "name" JSONB NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoodMenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodMenuItem" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "name" JSONB NOT NULL,
    "description" JSONB,
    "priceTiyin" BIGINT NOT NULL,
    "imageKey" TEXT,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "mxikCode" TEXT,
    "packageCode" TEXT,
    "vatRateBp" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FoodMenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourierProfile" (
    "userId" UUID NOT NULL,
    "status" "CourierStatus" NOT NULL DEFAULT 'ACTIVE',
    "vehicle" "CourierVehicle" NOT NULL DEFAULT 'SCOOTER',
    "online" BOOLEAN NOT NULL DEFAULT false,
    "lastLat" DOUBLE PRECISION,
    "lastLng" DOUBLE PRECISION,
    "lastSeenAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CourierProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CourierSettlement" (
    "id" UUID NOT NULL,
    "courierId" UUID NOT NULL,
    "amountTiyin" BIGINT NOT NULL,
    "note" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourierSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FoodMenuCategory_storeId_sort_idx" ON "FoodMenuCategory"("storeId", "sort");

-- CreateIndex
CREATE INDEX "FoodMenuItem_storeId_archived_sort_idx" ON "FoodMenuItem"("storeId", "archived", "sort");

-- CreateIndex
CREATE INDEX "CourierProfile_status_online_idx" ON "CourierProfile"("status", "online");

-- CreateIndex
CREATE INDEX "CourierSettlement_courierId_createdAt_idx" ON "CourierSettlement"("courierId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_account_courierId_createdAt_idx" ON "LedgerEntry"("account", "courierId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_kind_status_createdAt_idx" ON "Order"("kind", "status", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_menuItemId_idx" ON "OrderItem"("menuItemId");

-- CreateIndex
CREATE INDEX "SellerOrder_courierId_status_idx" ON "SellerOrder"("courierId", "status");

-- CreateIndex
CREATE INDEX "Store_kind_status_idx" ON "Store"("kind", "status");

-- AddForeignKey
ALTER TABLE "SellerOrder" ADD CONSTRAINT "SellerOrder_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "FoodMenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RestaurantProfile" ADD CONSTRAINT "RestaurantProfile_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodMenuCategory" ADD CONSTRAINT "FoodMenuCategory_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodMenuItem" ADD CONSTRAINT "FoodMenuItem_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodMenuItem" ADD CONSTRAINT "FoodMenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FoodMenuCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierProfile" ADD CONSTRAINT "CourierProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourierSettlement" ADD CONSTRAINT "CourierSettlement_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── Hand-written: UZGO Food rules (ADR 0024) ──────────────────────────────
-- New enum values cannot be used in this transaction, so the checks below
-- compare enum columns as text.

-- An order line is either a marketplace variant or a menu dish, never both.
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_line_kind" CHECK (
  ("variantId" IS NOT NULL AND "productId" IS NOT NULL AND "menuItemId" IS NULL)
  OR ("variantId" IS NULL AND "productId" IS NULL AND "menuItemId" IS NOT NULL));

-- Food orders carry a delivery point and mode; marketplace orders never do.
ALTER TABLE "Order" ADD CONSTRAINT "Order_food_fields" CHECK (
  ("kind"::text = 'FOOD'
    AND "deliveryLat" BETWEEN -90 AND 90 AND "deliveryLng" BETWEEN -180 AND 180
    AND "foodDeliveryMode" IS NOT NULL AND "promoCodeId" IS NULL)
  OR ("kind"::text = 'MARKET'
    AND "deliveryLat" IS NULL AND "deliveryLng" IS NULL AND "foodDeliveryMode" IS NULL));

ALTER TABLE "SellerOrder" ADD CONSTRAINT "SellerOrder_courier_fee" CHECK (
  "courierFeeTiyin" >= 0 AND ("courierId" IS NULL) = ("courierAssignedAt" IS NULL));

-- Courier balances always name the courier.
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_courier_has_user" CHECK (
  ("account"::text = 'COURIER_PAYABLE') = ("courierId" IS NOT NULL));

ALTER TABLE "RestaurantProfile"
  ADD CONSTRAINT "RestaurantProfile_coordinates" CHECK (
    "lat" BETWEEN 37 AND 46 AND "lng" BETWEEN 55 AND 74),
  ADD CONSTRAINT "RestaurantProfile_limits" CHECK (
    "deliveryRadiusM" BETWEEN 500 AND 30000
    AND "selfDeliveryFeeTiyin" >= 0 AND "minOrderTiyin" >= 0
    AND "prepMinutes" BETWEEN 5 AND 180);

ALTER TABLE "FoodMenuItem"
  ADD CONSTRAINT "FoodMenuItem_price_positive" CHECK ("priceTiyin" > 0),
  ADD CONSTRAINT "FoodMenuItem_vat_range" CHECK ("vatRateBp" IS NULL OR "vatRateBp" BETWEEN 0 AND 10000);

ALTER TABLE "CourierProfile" ADD CONSTRAINT "CourierProfile_position" CHECK (
  ("lastLat" IS NULL) = ("lastLng" IS NULL)
  AND ("lastLat" IS NULL OR ("lastLat" BETWEEN -90 AND 90 AND "lastLng" BETWEEN -180 AND 180)));

ALTER TABLE "CourierSettlement" ADD CONSTRAINT "CourierSettlement_amount_nonzero" CHECK ("amountTiyin" <> 0);
CREATE TRIGGER courier_settlement_no_delete BEFORE DELETE ON "CourierSettlement"
  FOR EACH ROW EXECUTE FUNCTION money_record_no_delete();
