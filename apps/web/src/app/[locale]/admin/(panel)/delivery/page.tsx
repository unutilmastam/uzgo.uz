import { getLocale, getTranslations } from 'next-intl/server';
import { PickupPointForm, PickupPointRow, ZoneRow } from '@/components/admin/delivery-forms';
import { StatusFilter } from '@/components/panel/status-filter';
import type { Locale } from '@/i18n/routing';
import { getAdminPickupPoints, getAdminZones } from '@/lib/admin-api';
import { getRegions } from '@/lib/api-server';
import { requireStaff } from '../../staff';

/** Courier tariffs per district (by region) and pickup points. */
export default async function AdminDeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ regionId?: string }>;
}) {
  await requireStaff('/admin/delivery', 'admin');
  const [{ regionId: requested }, t, locale, regions, points] = await Promise.all([
    searchParams,
    getTranslations('admin'),
    getLocale() as Promise<Locale>,
    getRegions(),
    getAdminPickupPoints(),
  ]);
  const region =
    regions.find((r) => r.id === requested) ??
    regions.find((r) => r.code === 'UZ-SU') ??
    regions[0];
  const zones = region ? await getAdminZones(region.id) : [];
  const districtName = new Map(zones.map((z) => [z.districtId, z.name[locale]]));
  const box = 'rounded-xl border border-border bg-card';

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="zones" className="flex flex-col gap-3">
        <h2 id="zones" className="text-lg font-semibold">
          {t('zones')}
        </h2>
        <StatusFilter
          label={t('region')}
          current={region?.id}
          options={regions.map((r) => ({
            value: r.id,
            label: r.name[locale],
            href: `/admin/delivery?regionId=${r.id}`,
          }))}
        />
        <ul className={`${box} divide-y divide-border`}>
          {zones.map((row) => (
            <ZoneRow key={row.districtId} row={row} />
          ))}
        </ul>
      </section>
      <section aria-labelledby="points" className="flex flex-col gap-3">
        <h2 id="points" className="text-lg font-semibold">
          {t('pickupPoints')}
        </h2>
        <div className={`${box} p-4`}>
          <PickupPointForm
            districts={zones.map((z) => ({ id: z.districtId, name: z.name[locale] }))}
          />
        </div>
        <ul className={`${box} divide-y divide-border`}>
          {points.map((point) => (
            <PickupPointRow
              key={point.id}
              point={point}
              districtName={districtName.get(point.districtId) ?? ''}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
