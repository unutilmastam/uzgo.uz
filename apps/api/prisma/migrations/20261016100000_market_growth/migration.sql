-- CreateEnum
CREATE TYPE "ReturnReason" AS ENUM ('DEFECTIVE', 'WRONG_ITEM', 'NOT_AS_DESCRIBED', 'DAMAGED_IN_DELIVERY', 'CHANGED_MIND', 'OTHER');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PUBLISHED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "PromoKind" AS ENUM ('PERCENT', 'FIXED');

-- AlterEnum
ALTER TYPE "LedgerAccount" ADD VALUE 'PLATFORM_PROMOTIONS';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "discountTiyin" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "promoCodeId" UUID;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "discountTiyin" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ratingSum" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SellerOrder" ADD COLUMN     "deliveredAt" TIMESTAMPTZ(3),
ADD COLUMN     "discountTiyin" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "returnComment" TEXT,
ADD COLUMN     "returnDecisionNote" TEXT,
ADD COLUMN     "returnReason" "ReturnReason";

-- CreateTable
CREATE TABLE "Favorite" (
    "userId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("userId","productId")
);

-- CreateTable
CREATE TABLE "ProductReview" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "moderationNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProductReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "PromoKind" NOT NULL,
    "percentBp" INTEGER,
    "amountTiyin" BIGINT,
    "maxDiscountTiyin" BIGINT,
    "minOrderTiyin" BIGINT NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "usageLimit" INTEGER,
    "perUserLimit" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Favorite_userId_createdAt_idx" ON "Favorite"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductReview_productId_status_createdAt_idx" ON "ProductReview"("productId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ProductReview_status_createdAt_idx" ON "ProductReview"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductReview_productId_userId_key" ON "ProductReview"("productId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");

-- CreateIndex
CREATE INDEX "PromoCode_active_code_idx" ON "PromoCode"("active", "code");

-- CreateIndex
CREATE INDEX "Order_promoCodeId_userId_idx" ON "Order"("promoCodeId", "userId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReview" ADD CONSTRAINT "ProductReview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─── Phase 9a: database-level guarantees (ADR 0023) ─────────────────────────

ALTER TABLE "ProductReview"
  ADD CONSTRAINT "ProductReview_rating_range" CHECK ("rating" BETWEEN 1 AND 5),
  ADD CONSTRAINT "ProductReview_text_length" CHECK ("text" IS NULL OR char_length("text") <= 1000);

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_rating_aggregates" CHECK (
    "ratingCount" >= 0 AND "ratingSum" >= "ratingCount" AND "ratingSum" <= 5 * "ratingCount");

ALTER TABLE "PromoCode"
  ADD CONSTRAINT "PromoCode_code_format" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9-]{2,31}$'),
  ADD CONSTRAINT "PromoCode_kind_value" CHECK (
    ("kind" = 'PERCENT' AND "percentBp" BETWEEN 1 AND 9000 AND "amountTiyin" IS NULL)
    OR ("kind" = 'FIXED' AND "amountTiyin" > 0 AND "percentBp" IS NULL AND "maxDiscountTiyin" IS NULL)),
  ADD CONSTRAINT "PromoCode_limits" CHECK (
    "minOrderTiyin" >= 0
    AND ("maxDiscountTiyin" IS NULL OR "maxDiscountTiyin" > 0)
    AND ("usageLimit" IS NULL OR "usageLimit" > 0)
    AND "perUserLimit" > 0
    AND ("startsAt" IS NULL OR "endsAt" IS NULL OR "startsAt" < "endsAt"));

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_discount_range" CHECK ("discountTiyin" >= 0 AND "discountTiyin" <= "itemsTotalTiyin"),
  ADD CONSTRAINT "Order_total_formula" CHECK (
    "totalTiyin" = "itemsTotalTiyin" + "deliveryTotalTiyin" - "discountTiyin");
ALTER TABLE "SellerOrder"
  ADD CONSTRAINT "SellerOrder_discount_range" CHECK ("discountTiyin" >= 0 AND "discountTiyin" <= "itemsTotalTiyin");
ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_discount_range" CHECK ("discountTiyin" >= 0 AND "discountTiyin" <= "lineTotalTiyin");

-- Money snapshots never change after checkout (status, tracking and return
-- fields still can).
CREATE OR REPLACE FUNCTION "order_money_immutable"() RETURNS trigger AS $$
BEGIN
  IF NEW."itemsTotalTiyin" IS DISTINCT FROM OLD."itemsTotalTiyin"
     OR NEW."totalTiyin" IS DISTINCT FROM OLD."totalTiyin"
     OR NEW."discountTiyin" IS DISTINCT FROM OLD."discountTiyin" THEN
    RAISE EXCEPTION 'order amounts are immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Order_money_immutable" BEFORE UPDATE ON "Order"
  FOR EACH ROW EXECUTE FUNCTION "order_money_immutable"();
CREATE TRIGGER "SellerOrder_money_immutable" BEFORE UPDATE ON "SellerOrder"
  FOR EACH ROW EXECUTE FUNCTION "order_money_immutable"();

-- Start of the return window for shipments delivered before this migration.
UPDATE "SellerOrder" so SET "deliveredAt" = e."at"
FROM (
  SELECT "sellerOrderId", max("createdAt") AS "at" FROM "OrderEvent"
  WHERE "toStatus" = 'DELIVERED' AND "sellerOrderId" IS NOT NULL
  GROUP BY "sellerOrderId"
) e
WHERE so."id" = e."sellerOrderId" AND so."deliveredAt" IS NULL;
