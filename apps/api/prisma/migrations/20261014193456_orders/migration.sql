-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CREATED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SellerOrderStatus" AS ENUM ('NEW', 'ACCEPTED', 'PACKED', 'HANDED_TO_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED', 'CANCELLED_BY_SELLER', 'CANCELLED_BY_CUSTOMER', 'RETURN_REQUESTED', 'RETURNED', 'RETURN_REJECTED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH_ON_DELIVERY');

-- CreateEnum
CREATE TYPE "OrderActor" AS ENUM ('CUSTOMER', 'SELLER', 'ADMIN', 'SYSTEM');

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'CREATED',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "itemsTotalTiyin" BIGINT NOT NULL,
    "deliveryTotalTiyin" BIGINT NOT NULL,
    "totalTiyin" BIGINT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "districtId" UUID NOT NULL,
    "addressLine" TEXT NOT NULL,
    "addressSnapshot" JSONB NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerOrder" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" "SellerOrderStatus" NOT NULL DEFAULT 'NEW',
    "itemsTotalTiyin" BIGINT NOT NULL,
    "deliveryTiyin" BIGINT NOT NULL,
    "totalTiyin" BIGINT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SellerOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" UUID NOT NULL,
    "sellerOrderId" UUID NOT NULL,
    "variantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "productSlug" TEXT NOT NULL,
    "title" JSONB NOT NULL,
    "options" JSONB NOT NULL,
    "sku" TEXT NOT NULL,
    "unitPriceTiyin" BIGINT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineTotalTiyin" BIGINT NOT NULL,
    "mxikCode" TEXT,
    "packageCode" TEXT,
    "vatRateBp" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "sellerOrderId" UUID,
    "actorId" UUID,
    "actorType" "OrderActor" NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Order_number_key" ON "Order"("number");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "Order"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_districtId_idx" ON "Order"("districtId");

-- CreateIndex
CREATE UNIQUE INDEX "SellerOrder_number_key" ON "SellerOrder"("number");

-- CreateIndex
CREATE INDEX "SellerOrder_orderId_idx" ON "SellerOrder"("orderId");

-- CreateIndex
CREATE INDEX "SellerOrder_storeId_status_createdAt_idx" ON "SellerOrder"("storeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "OrderItem_sellerOrderId_idx" ON "OrderItem"("sellerOrderId");

-- CreateIndex
CREATE INDEX "OrderItem_variantId_idx" ON "OrderItem"("variantId");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "OrderEvent_sellerOrderId_idx" ON "OrderEvent"("sellerOrderId");

-- CreateIndex
CREATE INDEX "IdempotencyKey_createdAt_idx" ON "IdempotencyKey"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_userId_scope_key_key" ON "IdempotencyKey"("userId", "scope", "key");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerOrder" ADD CONSTRAINT "SellerOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerOrder" ADD CONSTRAINT "SellerOrder_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_sellerOrderId_fkey" FOREIGN KEY ("sellerOrderId") REFERENCES "SellerOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_sellerOrderId_fkey" FOREIGN KEY ("sellerOrderId") REFERENCES "SellerOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyKey" ADD CONSTRAINT "IdempotencyKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Hand-written: order numbers, money checks, immutability ──────────────

CREATE SEQUENCE "order_number_seq" START 1;

ALTER TABLE "Order" ADD CONSTRAINT "Order_money_check"
  CHECK ("itemsTotalTiyin" >= 0 AND "deliveryTotalTiyin" >= 0 AND "totalTiyin" = "itemsTotalTiyin" + "deliveryTotalTiyin");
ALTER TABLE "Order" ADD CONSTRAINT "Order_number_format" CHECK ("number" ~ '^UZ-[0-9]{4}-[0-9]{6,}$');
ALTER TABLE "Order" ADD CONSTRAINT "Order_phone_e164_check" CHECK ("recipientPhone" ~ '^\+[1-9][0-9]{6,14}$');
ALTER TABLE "SellerOrder" ADD CONSTRAINT "SellerOrder_money_check"
  CHECK ("itemsTotalTiyin" >= 0 AND "deliveryTiyin" >= 0 AND "totalTiyin" = "itemsTotalTiyin" + "deliveryTiyin");
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_money_check"
  CHECK ("unitPriceTiyin" >= 0 AND "quantity" > 0 AND "lineTotalTiyin" = "unitPriceTiyin" * "quantity");

-- Orders, shipments and items are never deleted; events are never changed.
CREATE FUNCTION "reject_change"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows cannot be %d', TG_TABLE_NAME, lower(TG_OP);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Order_no_delete" BEFORE DELETE ON "Order" FOR EACH ROW EXECUTE FUNCTION "reject_change"();
CREATE TRIGGER "SellerOrder_no_delete" BEFORE DELETE ON "SellerOrder" FOR EACH ROW EXECUTE FUNCTION "reject_change"();
CREATE TRIGGER "OrderItem_no_update_delete" BEFORE UPDATE OR DELETE ON "OrderItem" FOR EACH ROW EXECUTE FUNCTION "reject_change"();
CREATE TRIGGER "OrderEvent_no_update_delete" BEFORE UPDATE OR DELETE ON "OrderEvent" FOR EACH ROW EXECUTE FUNCTION "reject_change"();
