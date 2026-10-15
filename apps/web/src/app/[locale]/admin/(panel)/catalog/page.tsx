import { CatalogManager } from '@/components/admin/catalog-manager';
import { getAdminAttributes, getAdminCategories } from '@/lib/admin-api';
import { requireStaff } from '../../staff';

export default async function AdminCatalogPage() {
  await requireStaff('/admin/catalog', 'admin');
  const [categories, attributes] = await Promise.all([getAdminCategories(), getAdminAttributes()]);
  return <CatalogManager categories={categories} attributes={attributes} />;
}
