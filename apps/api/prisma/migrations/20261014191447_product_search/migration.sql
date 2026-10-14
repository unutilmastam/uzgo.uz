-- Product search (Phase 4d): normalised text + full-text vector + trigram index.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "Product" ADD COLUMN "searchText" TEXT NOT NULL DEFAULT '';

-- Generated, so it can never drift from searchText.
ALTER TABLE "Product" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple'::regconfig, "searchText")) STORED;

CREATE INDEX "Product_searchVector_idx" ON "Product" USING GIN ("searchVector");
CREATE INDEX "Product_searchText_idx" ON "Product" USING GIN ("searchText" gin_trgm_ops);
