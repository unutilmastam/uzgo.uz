import { getTranslations } from 'next-intl/server';
import { Banners } from '@/components/home/banners';
import { ComingSoonServices } from '@/components/home/coming-soon-services';
import { PopularCategories } from '@/components/home/popular-categories';
import { ProductGrid } from '@/components/home/product-grid';
import { SellerCta } from '@/components/home/seller-cta';

export default async function HomePage() {
  const t = await getTranslations('home');

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-4 md:gap-14 md:py-6">
      <h1 className="sr-only">{t('title')}</h1>
      <Banners />
      <PopularCategories />
      <ProductGrid />
      <ComingSoonServices />
      <SellerCta />
    </div>
  );
}
