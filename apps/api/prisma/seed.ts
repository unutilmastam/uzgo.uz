// Seeds reference data only (idempotent). Never seeds users or admins —
// the first super admin is granted explicitly with `pnpm user:grant-role`.
import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

type GeoData = {
  regions: {
    code: string;
    slug: string;
    kind: string;
    sort: number;
    name: { uz: string; ru: string };
  }[];
  districts: { slug: string; regionCode: string; kind: string; name: { uz: string; ru: string } }[];
};

const KIND = {
  region: 'REGION',
  republic: 'REPUBLIC',
  city: 'CITY',
  district: 'DISTRICT',
} as const;

const data = JSON.parse(
  readFileSync(new URL('./data/geo.json', import.meta.url), 'utf8'),
) as GeoData;

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

try {
  const regionIds = new Map<string, string>();
  for (const region of data.regions) {
    const kind = KIND[region.kind as keyof typeof KIND] as 'REGION' | 'REPUBLIC' | 'CITY';
    const row = await prisma.region.upsert({
      where: { code: region.code },
      create: { code: region.code, slug: region.slug, kind, name: region.name, sort: region.sort },
      update: { slug: region.slug, kind, name: region.name, sort: region.sort },
      select: { id: true },
    });
    regionIds.set(region.code, row.id);
  }

  const collator = new Intl.Collator('uz');
  const byRegion = Map.groupBy(data.districts, (d) => d.regionCode);
  let districtCount = 0;
  for (const [regionCode, districts] of byRegion) {
    const regionId = regionIds.get(regionCode);
    if (!regionId) throw new Error(`Unknown region ${regionCode}`);
    // Cities first, then districts, each alphabetically by Uzbek name.
    const sorted = districts.toSorted(
      (a, b) =>
        (a.kind === b.kind ? 0 : a.kind === 'city' ? -1 : 1) ||
        collator.compare(a.name.uz, b.name.uz),
    );
    for (const [index, district] of sorted.entries()) {
      const kind = district.kind === 'city' ? 'CITY' : 'DISTRICT';
      await prisma.district.upsert({
        where: { slug: district.slug },
        create: { slug: district.slug, regionId, kind, name: district.name, sort: index + 1 },
        update: { regionId, kind, name: district.name, sort: index + 1 },
      });
      districtCount++;
    }
  }
  console.log(`[seed] regions: ${regionIds.size}, districts: ${districtCount}`);
} finally {
  await prisma.$disconnect();
}
