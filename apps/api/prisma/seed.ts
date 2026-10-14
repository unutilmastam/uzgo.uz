// Seeds reference data (idempotent) and, only when SEED_DEMO=true outside
// production, clearly labelled demo stores and products. Never seeds users or
// admins — the first super admin is granted with `pnpm user:grant-role`.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedCatalog } from './seeders/catalog.js';
import { seedDemo } from './seeders/demo.js';
import { seedGeo } from './seeders/geo.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

try {
  console.log(`[seed] ${await seedGeo(prisma)}`);
  console.log(`[seed] ${await seedCatalog(prisma)}`);
  if (process.env.SEED_DEMO === 'true') {
    console.log(`[seed] ${await seedDemo(prisma)} (DEMO DATA)`);
  }
} finally {
  await prisma.$disconnect();
}
