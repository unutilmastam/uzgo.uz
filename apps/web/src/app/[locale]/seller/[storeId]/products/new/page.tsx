import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ProductForm } from '@/components/seller/product-form';
import { getCategoryTree } from '@/lib/catalog-api';
import { loadSellerStore } from '../../store-context';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('seller');
  return { title: t('newProduct'), robots: { index: false } };
}

export default async function NewProductPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await params;
  const { store, readOnly } = await loadSellerStore(storeId, `/seller/${storeId}/products/new`);
  if (readOnly) notFound();
  const [t, categories] = await Promise.all([getTranslations('seller'), getCategoryTree()]);
  return (
    <section
      aria-labelledby="new-product"
      className="max-w-4xl rounded-xl border border-border bg-card p-5 md:p-6"
    >
      <h2 id="new-product" className="mb-4 text-lg font-semibold">
        {t('newProduct')}
      </h2>
      <ProductForm storeId={store.id} categories={categories} />
    </section>
  );
}
