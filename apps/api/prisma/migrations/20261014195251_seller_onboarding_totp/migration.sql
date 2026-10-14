-- CreateEnum
CREATE TYPE "LegalType" AS ENUM ('INDIVIDUAL_ENTREPRENEUR', 'LEGAL_ENTITY');

-- AlterEnum
ALTER TYPE "StoreStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "moderationNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMPTZ(3),
ADD COLUMN     "submittedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "totpVerifiedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "legalType" "LegalType",
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMPTZ(3),
ADD COLUMN     "reviewedById" UUID,
ADD COLUMN     "taxId" TEXT;

-- CreateTable
CREATE TABLE "StaffTotp" (
    "userId" UUID NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "enabledAt" TIMESTAMPTZ(3),
    "lastUsedStep" BIGINT,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StaffTotp_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "StaffTotp" ADD CONSTRAINT "StaffTotp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Store" ADD CONSTRAINT "Store_tax_id_format" CHECK ("taxId" IS NULL OR "taxId" ~ '^[0-9]{9}$');
ALTER TABLE "Store" ADD CONSTRAINT "Store_contact_phone_e164" CHECK ("contactPhone" IS NULL OR "contactPhone" ~ '^\+[1-9][0-9]{6,14}$');
