-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LedgerAccount" AS ENUM ('PROVIDER_CLEARING', 'CUSTOMER_PREPAYMENTS', 'SELLER_PAYABLE', 'PLATFORM_REVENUE');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "commissionBp" INTEGER;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "commissionBp" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SellerOrder" ADD COLUMN     "commissionTiyin" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "commissionBp" INTEGER,
ADD COLUMN     "payoutAccount" TEXT,
ADD COLUMN     "payoutBankName" TEXT,
ADD COLUMN     "payoutMfo" TEXT,
ADD COLUMN     "payoutRecipient" TEXT;

-- CreateTable
CREATE TABLE "Refund" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "sellerOrderId" UUID,
    "paymentAttemptId" UUID NOT NULL,
    "amountTiyin" BIGINT NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "reference" TEXT,
    "processedById" UUID,
    "processedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" UUID NOT NULL,
    "journalId" UUID NOT NULL,
    "account" "LedgerAccount" NOT NULL,
    "storeId" UUID,
    "amountTiyin" BIGINT NOT NULL,
    "kind" TEXT NOT NULL,
    "orderId" UUID,
    "sellerOrderId" UUID,
    "refundId" UUID,
    "payoutId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" UUID NOT NULL,
    "storeId" UUID NOT NULL,
    "amountTiyin" BIGINT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "bankSnapshot" JSONB NOT NULL,
    "reference" TEXT,
    "createdById" UUID NOT NULL,
    "paidById" UUID,
    "paidAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Refund_status_createdAt_idx" ON "Refund"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Refund_orderId_idx" ON "Refund"("orderId");

-- CreateIndex
CREATE INDEX "Refund_sellerOrderId_idx" ON "Refund"("sellerOrderId");

-- CreateIndex
CREATE INDEX "LedgerEntry_journalId_idx" ON "LedgerEntry"("journalId");

-- CreateIndex
CREATE INDEX "LedgerEntry_account_storeId_createdAt_idx" ON "LedgerEntry"("account", "storeId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_sellerOrderId_idx" ON "LedgerEntry"("sellerOrderId");

-- CreateIndex
CREATE INDEX "Payout_storeId_status_idx" ON "Payout"("storeId", "status");

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_sellerOrderId_fkey" FOREIGN KEY ("sellerOrderId") REFERENCES "SellerOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentAttemptId_fkey" FOREIGN KEY ("paymentAttemptId") REFERENCES "PaymentAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written: money and format guards.
ALTER TABLE "Category" ADD CONSTRAINT "Category_commission_range" CHECK ("commissionBp" IS NULL OR "commissionBp" BETWEEN 0 AND 5000);
ALTER TABLE "Store" ADD CONSTRAINT "Store_commission_range" CHECK ("commissionBp" IS NULL OR "commissionBp" BETWEEN 0 AND 5000);
ALTER TABLE "Store" ADD CONSTRAINT "Store_payout_mfo_format" CHECK ("payoutMfo" IS NULL OR "payoutMfo" ~ '^[0-9]{5}$');
ALTER TABLE "Store" ADD CONSTRAINT "Store_payout_account_format" CHECK ("payoutAccount" IS NULL OR "payoutAccount" ~ '^[0-9]{20}$');
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_commission_range" CHECK ("commissionBp" BETWEEN 0 AND 5000);
ALTER TABLE "SellerOrder" ADD CONSTRAINT "SellerOrder_commission_range" CHECK ("commissionTiyin" >= 0 AND "commissionTiyin" <= "itemsTotalTiyin");
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_amount_positive" CHECK ("amountTiyin" > 0);
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_amount_positive" CHECK ("amountTiyin" > 0);
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_amount_nonzero" CHECK ("amountTiyin" <> 0);
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_seller_has_store" CHECK (("account" = 'SELLER_PAYABLE') = ("storeId" IS NOT NULL));

-- At most one open refund per shipment (no double refunds).
CREATE UNIQUE INDEX "Refund_one_open_per_shipment" ON "Refund"("sellerOrderId")
  WHERE "sellerOrderId" IS NOT NULL AND "status" IN ('PENDING', 'SUCCEEDED');

-- Ledger is append-only.
CREATE FUNCTION ledger_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'LedgerEntry rows cannot be changed or deleted';
END;
$$;
CREATE TRIGGER ledger_append_only BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION ledger_append_only();

-- Every journal must balance (checked at commit, after all its rows exist).
CREATE FUNCTION ledger_journal_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  total NUMERIC;
BEGIN
  SELECT COALESCE(SUM("amountTiyin"), 0) INTO total FROM "LedgerEntry" WHERE "journalId" = NEW."journalId";
  IF total <> 0 THEN
    RAISE EXCEPTION 'Ledger journal % does not balance (%)', NEW."journalId", total;
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER ledger_journal_balanced AFTER INSERT ON "LedgerEntry"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION ledger_journal_balanced();

-- Refunds and payouts are financial records: never deleted.
CREATE FUNCTION money_record_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows cannot be deleted', TG_TABLE_NAME;
END;
$$;
CREATE TRIGGER refund_no_delete BEFORE DELETE ON "Refund" FOR EACH ROW EXECUTE FUNCTION money_record_no_delete();
CREATE TRIGGER payout_no_delete BEFORE DELETE ON "Payout" FOR EACH ROW EXECUTE FUNCTION money_record_no_delete();
