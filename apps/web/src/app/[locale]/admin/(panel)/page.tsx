import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getAdminProducts, getAdminStores } from '@/lib/admin-api';

export default async function AdminOverviewPage() {
  const [t, stores, products] = await Promise.all([
    getTranslations('admin'),
    getAdminStores('PENDING', 1),
    getAdminProducts('PENDING_REVIEW', 1),
  ]);
  const cards = [
    { href: '/admin/stores?status=PENDING', label: t('pendingStores'), count: stores?.total ?? 0 },
    {
      href: '/admin/products?status=PENDING_REVIEW',
      label: t('pendingProducts'),
      count: products?.total ?? 0,
    },
  ];
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {cards.map((card) => (
        <li key={card.href}>
          <Link
            href={card.href}
            className="flex items-center justify-between rounded-xl border border-border bg-card p-5 hover:border-primary"
          >
            <span className="font-medium">{card.label}</span>
            <span className="text-3xl font-bold tabular-nums" data-testid="pending-count">
              {card.count}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
