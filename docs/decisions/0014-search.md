# 0014 — Product search in PostgreSQL (Phase 4)

- Status: Accepted
- Date: 2026-10-14

## Context

Customers type in Uzbek Latin (with ʻ, ', ‘ or ` in oʻ/gʻ), Uzbek Cyrillic and
Russian. A separate search engine (Elasticsearch, Meilisearch) would add
infrastructure the project does not need yet.

## Decision

- One normaliser (`apps/api/src/search/normalize.ts`) folds case, removes every
  apostrophe variant and transliterates Uzbek Cyrillic and Russian into Uzbek
  Latin. It is applied both when indexing and to queries.
- `Product.searchText` stores the normalised titles (uz + ru), category path,
  brand/option values, store name and SKUs. A generated `tsvector` column with
  a GIN index serves prefix full-text matching; a `pg_trgm` GIN index serves
  substring matching (e.g. "чайник" inside "электрочайник").
- A product matches if every query token matches as a prefix (FTS) or as a
  substring (trigram). Relevance = `ts_rank`.
- `searchText` is rebuilt by `reindexProducts()` (seeds, tests, and later every
  product edit in Phase 5); `pnpm --filter @uzgo/api search:reindex` rebuilds all.

## Consequences

Good enough for the MVP catalogue size; revisit (ADR) if catalogue size or
ranking needs exceed PostgreSQL (e.g. typo tolerance, facets at scale).
