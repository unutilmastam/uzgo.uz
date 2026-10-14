import { HttpStatus, Injectable } from '@nestjs/common';
import type { CategoryDetail, CategoryNode, CategoryRef } from '@uzgo/contracts';
import { AppException } from '../common/http-exception.filter.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Names = { uz: string; ru: string };
type CategoryRow = {
  id: string;
  parentId: string | null;
  slug: string;
  icon: string | null;
  name: unknown;
  sort: number;
};

const ref = (row: CategoryRow): CategoryRef => ({
  id: row.id,
  slug: row.slug,
  icon: row.icon,
  name: row.name as Names,
});

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  private activeCategories(): Promise<CategoryRow[]> {
    return this.prisma.category.findMany({
      where: { active: true },
      orderBy: [{ sort: 'asc' }, { slug: 'asc' }],
      select: { id: true, parentId: true, slug: true, icon: true, name: true, sort: true },
    });
  }

  async tree(): Promise<CategoryNode[]> {
    const rows = await this.activeCategories();
    const byParent = Map.groupBy(rows, (row) => row.parentId ?? 'root');
    const build = (parentId: string): CategoryNode[] =>
      (byParent.get(parentId) ?? []).map((row) => ({ ...ref(row), children: build(row.id) }));
    return build('root');
  }

  /** All active descendant ids of a category, including itself. */
  async subtreeIds(categoryId: string): Promise<string[]> {
    const rows = await this.activeCategories();
    const byParent = Map.groupBy(rows, (row) => row.parentId ?? 'root');
    const ids: string[] = [];
    const walk = (id: string) => {
      ids.push(id);
      for (const child of byParent.get(id) ?? []) walk(child.id);
    };
    walk(categoryId);
    return ids;
  }

  async detail(slug: string): Promise<CategoryDetail> {
    const rows = await this.activeCategories();
    const byId = new Map(rows.map((row) => [row.id, row]));
    const category = rows.find((row) => row.slug === slug);
    // An inactive ancestor hides the whole branch.
    const ancestors: CategoryRow[] = [];
    let parentId = category?.parentId ?? null;
    while (parentId) {
      const parent = byId.get(parentId);
      if (!parent) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Category not found');
      ancestors.unshift(parent);
      parentId = parent.parentId;
    }
    if (!category) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Category not found');

    const lineage = [...ancestors.map((a) => a.id), category.id];
    const links = await this.prisma.categoryAttribute.findMany({
      where: { categoryId: { in: lineage } },
      orderBy: { sort: 'asc' },
      select: {
        attribute: {
          select: {
            code: true,
            name: true,
            sort: true,
            values: { orderBy: { sort: 'asc' }, select: { code: true, name: true } },
          },
        },
      },
    });
    const filters = new Map<string, CategoryDetail['filters'][number]>();
    for (const { attribute } of links) {
      filters.set(attribute.code, {
        code: attribute.code,
        name: attribute.name as Names,
        values: attribute.values.map((v) => ({ code: v.code, name: v.name as Names })),
      });
    }

    return {
      category: ref(category),
      breadcrumbs: ancestors.map(ref),
      children: rows.filter((row) => row.parentId === category.id).map(ref),
      filters: [...filters.values()],
    };
  }
}
