-- AlterTable
ALTER TABLE "FoodMenuItem" ADD COLUMN     "searchText" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "RestaurantProfile" ADD COLUMN     "searchText" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "AssistantUsage" (
    "userId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AssistantUsage_pkey" PRIMARY KEY ("userId","day")
);

-- CreateIndex
CREATE INDEX "AssistantUsage_day_idx" ON "AssistantUsage"("day");

-- CreateIndex
CREATE INDEX "FoodMenuItem_searchText_idx" ON "FoodMenuItem" USING GIN ("searchText" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "RestaurantProfile_searchText_idx" ON "RestaurantProfile" USING GIN ("searchText" gin_trgm_ops);

-- AddForeignKey
ALTER TABLE "AssistantUsage" ADD CONSTRAINT "AssistantUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "AssistantUsage" ADD CONSTRAINT "AssistantUsage_counts" CHECK (
  "messages" >= 0 AND "inputTokens" >= 0 AND "outputTokens" >= 0);
