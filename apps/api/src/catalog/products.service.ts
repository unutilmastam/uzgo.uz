import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { ProductDetail, StoreDetail } from '@uzgo/contracts';
import { AppException } from '../common/http-exception.filter.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { STORAGE, type StorageAdapter } from '../storage/storage.adapter.js';
import { AVAILABLE_CAP, visibleProductWhere } from './visibility.js';

type Names = { uz: string; ru: string };

const notFound = () => new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not found');

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
  ) {}

  async detail(slug: string): Promise<ProductDetail> {
    const product = await this.prisma.product.findFirst({
      where: { slug, ...visibleProductWhere },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        category: {
          select: {
            id: true,
            slug: true,
            name: true,
            icon: true,
            parentId: true,
            parent: { select: { icon: true } },
          },
        },
        store: { select: { id: true, slug: true, name: true, isDemo: true } },
        attributes: {
          select: {
            attributeValue: {
              select: {
                code: true,
                name: true,
                attribute: { select: { code: true, name: true, sort: true } },
              },
            },
          },
        },
        images: { orderBy: { sort: 'asc' }, select: { storageKey: true, alt: true } },
        variants: {
          where: { active: true },
          orderBy: [{ sort: 'asc' }, { priceTiyin: 'asc' }],
          select: {
            id: true,
            sku: true,
            priceTiyin: true,
            compareAtPriceTiyin: true,
            stock: true,
            options: {
              select: {
                attributeValue: {
                  select: {
                    code: true,
                    name: true,
                    sort: true,
                    attribute: { select: { code: true, name: true, sort: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!product || product.variants.length === 0) throw notFound();

    const breadcrumbs: { slug: string; name: Names }[] = [];
    let parentId = product.category.parentId;
    while (parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: parentId },
        select: { slug: true, name: true, parentId: true },
      });
      if (!parent) break;
      breadcrumbs.unshift({ slug: parent.slug, name: parent.name as Names });
      parentId = parent.parentId;
    }

    const option = (v: {
      code: string;
      name: unknown;
      attribute: { code: string; name: unknown };
    }) => ({
      attribute: v.attribute.code,
      attributeName: v.attribute.name as Names,
      code: v.code,
      name: v.name as Names,
    });

    return {
      id: product.id,
      slug: product.slug,
      title: product.title as Names,
      description: product.description as Names,
      category: {
        slug: product.category.slug,
        name: product.category.name as Names,
        icon: product.category.icon ?? product.category.parent?.icon ?? null,
      },
      breadcrumbs,
      store: { ...product.store, name: product.store.name as Names },
      attributes: product.attributes
        .map((a) => a.attributeValue)
        .sort((a, b) => a.attribute.sort - b.attribute.sort)
        .map(option),
      images: product.images.map((image) => ({
        url: this.storage.publicUrl(image.storageKey),
        alt: (image.alt as Names | null) ?? null,
      })),
      variants: product.variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        priceTiyin: variant.priceTiyin.toString(),
        compareAtPriceTiyin: variant.compareAtPriceTiyin?.toString() ?? null,
        available: Math.min(variant.stock, AVAILABLE_CAP),
        options: variant.options
          .map((o) => o.attributeValue)
          .sort((a, b) => a.attribute.sort - b.attribute.sort)
          .map(option),
      })),
    };
  }

  async store(slug: string): Promise<StoreDetail> {
    const store = await this.prisma.store.findFirst({
      where: { slug, status: 'ACTIVE', deletedAt: null },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        isDemo: true,
        district: { select: { name: true, region: { select: { name: true } } } },
      },
    });
    if (!store) throw notFound();
    return {
      id: store.id,
      slug: store.slug,
      name: store.name as Names,
      description: (store.description as Names | null) ?? null,
      isDemo: store.isDemo,
      district: (store.district?.name as Names | undefined) ?? null,
      region: (store.district?.region.name as Names | undefined) ?? null,
    };
  }
}
