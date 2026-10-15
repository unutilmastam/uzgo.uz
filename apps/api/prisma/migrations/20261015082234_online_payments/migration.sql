-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'REFUNDED');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'AWAITING_PAYMENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'PAYME';
ALTER TYPE "PaymentMethod" ADD VALUE 'CLICK';
ALTER TYPE "PaymentMethod" ADD VALUE 'DEV_ONLINE';

-- AlterEnum
ALTER TYPE "SellerOrderStatus" ADD VALUE 'PENDING_PAYMENT';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paidAt" TIMESTAMPTZ(3),
ADD COLUMN     "paymentDueAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amountTiyin" BIGINT NOT NULL,
    "providerTxId" TEXT NOT NULL,
    "providerState" INTEGER,
    "providerTime" BIGINT,
    "performedAt" TIMESTAMPTZ(3),
    "cancelledAt" TIMESTAMPTZ(3),
    "cancelReason" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentAttempt_orderId_idx" ON "PaymentAttempt"("orderId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_status_createdAt_idx" ON "PaymentAttempt"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_method_providerTxId_key" ON "PaymentAttempt"("method", "providerTxId");

-- CreateIndex
CREATE INDEX "Order_paymentDueAt_idx" ON "Order"("paymentDueAt");

-- AddForeignKey
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written: money and lifecycle guards.
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_amount_positive" CHECK ("amountTiyin" > 0);
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_paid_has_time"
  CHECK ("status" NOT IN ('PAID', 'REFUNDED') OR "performedAt" IS NOT NULL);
ALTER TABLE "PaymentAttempt" ADD CONSTRAINT "PaymentAttempt_tx_id_nonempty" CHECK (length("providerTxId") BETWEEN 1 AND 100);

-- At most one captured payment per order: a second capture would double-charge.
CREATE UNIQUE INDEX "PaymentAttempt_one_paid_per_order" ON "PaymentAttempt"("orderId")
  WHERE "status" IN ('PAID', 'REFUNDED');

-- Payment attempts are financial records: never deleted.
CREATE FUNCTION payment_attempt_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'PaymentAttempt rows cannot be deleted';
END;
$$;
CREATE TRIGGER payment_attempt_no_delete BEFORE DELETE ON "PaymentAttempt"
  FOR EACH ROW EXECUTE FUNCTION payment_attempt_no_delete();
