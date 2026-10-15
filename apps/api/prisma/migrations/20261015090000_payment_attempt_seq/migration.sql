-- AlterTable
ALTER TABLE "PaymentAttempt" ADD COLUMN     "seq" BIGSERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "PaymentAttempt_seq_key" ON "PaymentAttempt"("seq");

