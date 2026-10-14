// Rebuilds the search text of every product: pnpm --filter @uzgo/api search:reindex
import { existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { reindexProducts } from '../src/search/search-index.js';

if (existsSync('.env') && process.env.NODE_ENV !== 'production') process.loadEnvFile('.env');
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
try {
  console.log(`[search] reindexed ${String(await reindexProducts(prisma))} products`);
} finally {
  await prisma.$disconnect();
}
