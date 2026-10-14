import { getTranslations } from 'next-intl/server';
import { Benefits } from '@/components/home/benefits';
import { Hero } from '@/components/home/hero';
import { PopularCategories } from '@/components/home/popular-categories';
import { ProductGrid } from '@/components/home/product-grid';
import { SellerCta } from '@/components/home/seller-cta';
import { ServicesGrid } from '@/components/home/services-grid';

export default async function HomePage() {
  const t = await getTranslations('home');

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-4 md:gap-10 md:py-6">
      <h1 className="sr-only">{t('title')}</h1>
      <Hero />
      <ServicesGrid />
      <Benefits />
      <PopularCategories />
      <ProductGrid />
      <SellerCta />
    </div>
  );
}
