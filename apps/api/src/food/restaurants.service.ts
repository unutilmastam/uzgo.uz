import { randomBytes } from 'node:crypto';
import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  type AdminRestaurant,
  type CreateRestaurant,
  type MenuCategory,
  type MenuCategoryInput,
  type MenuItemInput,
  type OpeningHours,
  PRODUCT_IMAGE_LIMITS,
  type RestaurantDetail,
  type RestaurantSummary,
  type UpdateMenuItem,
  type UpdateRestaurant,
} from '@uzgo/contracts';
import type { Meta } from '../admin/meta.js';
import { AuditService } from '../audit/audit.service.js';
import { normalizePhone } from '../auth/phone.js';
import { AppException } from '../common/http-exception.filter.js';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import { Role, StoreRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { reindexFood } from '../search/food-index.js';
import { processProductImage } from '../seller/image-processing.js';
import { STORAGE, type StorageAdapter } from '../storage/storage.adapter.js';
import { courierFeeTiyin, distanceM, etaMinutes, isOpenAt, type Point } from './geo.js';

type Names = { uz: string; ru: string };

const notFound = (what = 'Restaurant') =>
  new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} not found`);
const bad = (code: string, message: string) =>
  new AppException(HttpStatus.BAD_REQUEST, code, message);

export const MENU_LIMITS = { categories: 50, items: 500 } as const;

const restaurantSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  status: true,
  districtId: true,
  district: { select: { name: true } },
  commissionBp: true,
  createdAt: true,
  restaurant: true,
} satisfies Prisma.StoreSelect;
type RestaurantRow = Prisma.StoreGetPayload<{ select: typeof restaurantSelect }>;

const itemSelect = {
  id: true,
  categoryId: true,
  name: true,
  description: true,
  priceTiyin: true,
  imageKey: true,
  available: true,
  archived: true,
  sort: true,
  mxikCode: true,
  packageCode: true,
  vatRateBp: true,
} satisfies Prisma.FoodMenuItemSelect;
type ItemRow = Prisma.FoodMenuItemGetPayload<{ select: typeof itemSelect }>;

/**
 * Restaurants and menus (ADR 0024). Staff create and edit them; customers see
 * active restaurants with their non-archived dishes; delivery fee, ETA and
 * whether a point is inside the delivery area are computed here only.
 */
@Injectable()
export class RestaurantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ─── Shared rules ──────────────────────────────────────────────────────────

  openNow(profile: { openingHours: unknown; acceptingOrders: boolean }, now = new Date()) {
    return profile.acceptingOrders && isOpenAt(profile.openingHours as OpeningHours, now);
  }

  /** Delivery fee for a point (null = outside the delivery area). */
  deliveryFor(
    profile: {
      lat: number;
      lng: number;
      deliveryMode: 'SELF' | 'UZGO';
      deliveryRadiusM: number;
      selfDeliveryFeeTiyin: bigint;
      prepMinutes: number;
    },
    point: Point,
  ): { distanceM: number; inArea: boolean; feeTiyin: bigint; etaMinutes: number } {
    const d = distanceM(profile, point);
    return {
      distanceM: Math.round(d),
      inArea: d <= profile.deliveryRadiusM,
      feeTiyin:
        profile.deliveryMode === 'SELF'
          ? profile.selfDeliveryFeeTiyin
          : courierFeeTiyin(d, {
              baseTiyin: BigInt(this.env.FOOD_COURIER_BASE_TIYIN),
              perKmTiyin: BigInt(this.env.FOOD_COURIER_PER_KM_TIYIN),
            }),
      etaMinutes: etaMinutes(profile.prepMinutes, d),
    };
  }

  private image(key: string | null) {
    return key ? this.storage.publicUrl(key) : null;
  }

  private item(row: ItemRow) {
    return {
      id: row.id,
      categoryId: row.categoryId,
      name: row.name as Names,
      description: (row.description as Names | null) ?? null,
      priceTiyin: row.priceTiyin.toString(),
      image: this.image(row.imageKey),
      available: row.available,
      sort: row.sort,
    };
  }

  // ─── Customers ─────────────────────────────────────────────────────────────

  async list(query: { lat?: number; lng?: number; districtId?: string }) {
    const rows = await this.prisma.store.findMany({
      where: {
        kind: 'RESTAURANT',
        status: 'ACTIVE',
        deletedAt: null,
        restaurant: { isNot: null },
        ...(query.districtId ? { districtId: query.districtId } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: restaurantSelect,
    });
    const point =
      query.lat !== undefined && query.lng !== undefined
        ? { lat: query.lat, lng: query.lng }
        : null;
    const items = rows.flatMap((row) => {
      const summary = this.summary(row, point);
      return summary ? [summary] : [];
    });
    // Nearest first when the customer shared a location; those that deliver there first.
    if (point) {
      items.sort(
        (a, b) =>
          Number(b.deliversHere) - Number(a.deliversHere) ||
          Number(b.openNow) - Number(a.openNow) ||
          (a.distanceM ?? 0) - (b.distanceM ?? 0),
      );
    } else {
      items.sort((a, b) => Number(b.openNow) - Number(a.openNow));
    }
    return { items };
  }

  private summary(row: RestaurantRow, point: Point | null): RestaurantSummary | null {
    const p = row.restaurant;
    if (!p) return null;
    const delivery = point ? this.deliveryFor(p, point) : null;
    return {
      id: row.id,
      slug: row.slug,
      name: row.name as Names,
      description: (row.description as Names | null) ?? null,
      cover: this.image(p.coverKey),
      district: (row.district?.name as Names | undefined) ?? null,
      deliveryMode: p.deliveryMode,
      openNow: this.openNow(p),
      minOrderTiyin: p.minOrderTiyin.toString(),
      prepMinutes: p.prepMinutes,
      distanceM: delivery?.distanceM ?? null,
      deliversHere: delivery?.inArea ?? null,
      deliveryFeeTiyin: delivery?.inArea ? delivery.feeTiyin.toString() : null,
      etaMinutes: delivery?.inArea ? delivery.etaMinutes : null,
    };
  }

  async detail(slug: string, point: Point | null): Promise<RestaurantDetail> {
    const row = await this.prisma.store.findFirst({
      where: { slug, kind: 'RESTAURANT', status: 'ACTIVE', deletedAt: null },
      select: restaurantSelect,
    });
    const summary = row ? this.summary(row, point) : null;
    const p = row?.restaurant;
    if (!row || !summary || !p) throw notFound();
    return {
      ...summary,
      address: p.address,
      phone: p.phone,
      lat: p.lat,
      lng: p.lng,
      openingHours: p.openingHours as OpeningHours,
      menu: await this.menu(row.id, false),
    };
  }

  /** Categories with dishes (customers: no archived dishes, no empty categories). */
  async menu(storeId: string, staff: boolean): Promise<MenuCategory[]> {
    const categories = await this.prisma.foodMenuCategory.findMany({
      where: { storeId },
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        name: true,
        sort: true,
        items: {
          where: staff ? {} : { archived: false },
          orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
          select: itemSelect,
        },
      },
    });
    return categories
      .filter((c) => staff || c.items.length > 0)
      .map((c) => ({
        id: c.id,
        name: c.name as Names,
        sort: c.sort,
        items: c.items.map((i) =>
          staff
            ? {
                ...this.item(i),
                archived: i.archived,
                mxikCode: i.mxikCode,
                packageCode: i.packageCode,
                vatRateBp: i.vatRateBp,
              }
            : this.item(i),
        ),
      }));
  }

  // ─── Staff ────────────────────────────────────────────────────────────────

  async adminList() {
    const rows = await this.prisma.store.findMany({
      where: { kind: 'RESTAURANT', deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: restaurantSelect,
    });
    return {
      items: rows.flatMap((row) => {
        const view = this.adminView(row, []);
        if (!view) return [];
        const { menu: _menu, ...rest } = view;
        return [rest];
      }),
    };
  }

  async adminGet(id: string): Promise<AdminRestaurant> {
    const row = await this.prisma.store.findFirst({
      where: { id, kind: 'RESTAURANT', deletedAt: null },
      select: restaurantSelect,
    });
    const view = row ? this.adminView(row, await this.menu(row.id, true)) : null;
    if (!view) throw notFound();
    return view;
  }

  private adminView(row: RestaurantRow, menu: MenuCategory[]): AdminRestaurant | null {
    const p = row.restaurant;
    if (!p) return null;
    return {
      id: row.id,
      slug: row.slug,
      name: row.name as Names,
      description: (row.description as Names | null) ?? null,
      status: row.status,
      districtId: row.districtId,
      district: (row.district?.name as Names | undefined) ?? null,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      phone: p.phone,
      deliveryMode: p.deliveryMode,
      deliveryRadiusM: p.deliveryRadiusM,
      selfDeliveryFeeTiyin: p.selfDeliveryFeeTiyin.toString(),
      minOrderTiyin: p.minOrderTiyin.toString(),
      prepMinutes: p.prepMinutes,
      openingHours: p.openingHours as OpeningHours,
      acceptingOrders: p.acceptingOrders,
      commissionBp: row.commissionBp,
      cover: this.image(p.coverKey),
      openNow: this.openNow(p),
      menu: menu as AdminRestaurant['menu'],
      createdAt: row.createdAt.toISOString(),
    };
  }

  async create(input: CreateRestaurant, actorId: string, meta: Meta): Promise<AdminRestaurant> {
    const phone = normalizePhone(input.ownerPhone);
    if (!phone) throw bad('INVALID_PHONE', 'Invalid phone number');
    const owner = await this.prisma.user.findFirst({
      where: { phone, deletedAt: null },
      select: { id: true },
    });
    if (!owner) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        'USER_NOT_FOUND',
        'The owner must sign in to UZGO once first',
      );
    }
    const contactPhone = input.phone ? normalizePhone(input.phone) : null;
    if (input.phone && !contactPhone) throw bad('INVALID_PHONE', 'Invalid restaurant phone');
    const district = await this.prisma.district.findFirst({
      where: { id: input.districtId, active: true },
      select: { id: true },
    });
    if (!district) throw bad('VALIDATION_FAILED', 'Unknown district');
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const store = await tx.store.create({
          data: {
            kind: 'RESTAURANT',
            slug: input.slug,
            name: input.name,
            ...(input.description ? { description: input.description } : {}),
            status: 'ACTIVE',
            districtId: district.id,
            contactPhone,
            legalName: input.legalName ?? null,
            taxId: input.taxId ?? null,
            commissionBp: input.commissionBp ?? null,
            reviewedAt: new Date(),
            reviewedById: actorId,
            members: { create: { userId: owner.id, role: StoreRole.OWNER } },
            restaurant: {
              create: {
                address: input.address,
                lat: input.lat,
                lng: input.lng,
                phone: contactPhone,
                deliveryMode: input.deliveryMode,
                deliveryRadiusM: input.deliveryRadiusM,
                selfDeliveryFeeTiyin: BigInt(input.selfDeliveryFeeTiyin),
                minOrderTiyin: BigInt(input.minOrderTiyin),
                prepMinutes: input.prepMinutes,
                openingHours: input.openingHours,
              },
            },
          },
          select: { id: true },
        });
        await tx.userRole.createMany({
          data: [{ userId: owner.id, role: Role.SELLER_OWNER, grantedById: actorId }],
          skipDuplicates: true,
        });
        await this.audit.record(
          {
            action: 'restaurant.created',
            entityType: 'Store',
            entityId: store.id,
            actorId,
            metadata: { slug: input.slug, deliveryMode: input.deliveryMode },
            ...meta,
          },
          tx,
        );
        return store.id;
      });
      await reindexFood(this.prisma, [id]);
      return await this.adminGet(id);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new AppException(HttpStatus.CONFLICT, 'SLUG_TAKEN', 'This address is taken');
      }
      throw err;
    }
  }

  async update(
    id: string,
    input: UpdateRestaurant,
    actorId: string,
    meta: Meta,
  ): Promise<AdminRestaurant> {
    const current = await this.adminGet(id);
    let contactPhone: string | null | undefined;
    if (input.phone !== undefined) {
      contactPhone = input.phone === null ? null : normalizePhone(input.phone);
      if (input.phone !== null && !contactPhone) throw bad('INVALID_PHONE', 'Invalid phone');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.store.update({
        where: { id },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { description: input.description ?? Prisma.DbNull }
            : {}),
          ...(input.districtId ? { districtId: input.districtId } : {}),
          ...(input.commissionBp !== undefined ? { commissionBp: input.commissionBp } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(contactPhone !== undefined ? { contactPhone } : {}),
        },
      });
      await tx.restaurantProfile.update({
        where: { storeId: id },
        data: {
          ...(input.address ? { address: input.address } : {}),
          ...(input.lat !== undefined ? { lat: input.lat } : {}),
          ...(input.lng !== undefined ? { lng: input.lng } : {}),
          ...(contactPhone !== undefined ? { phone: contactPhone } : {}),
          ...(input.deliveryMode ? { deliveryMode: input.deliveryMode } : {}),
          ...(input.deliveryRadiusM ? { deliveryRadiusM: input.deliveryRadiusM } : {}),
          ...(input.selfDeliveryFeeTiyin !== undefined
            ? { selfDeliveryFeeTiyin: BigInt(input.selfDeliveryFeeTiyin) }
            : {}),
          ...(input.minOrderTiyin !== undefined
            ? { minOrderTiyin: BigInt(input.minOrderTiyin) }
            : {}),
          ...(input.prepMinutes ? { prepMinutes: input.prepMinutes } : {}),
          ...(input.openingHours ? { openingHours: input.openingHours } : {}),
        },
      });
      await this.audit.record(
        {
          action: 'restaurant.updated',
          entityType: 'Store',
          entityId: id,
          actorId,
          metadata: {
            fields: Object.keys(input),
            ...(input.status ? { from: current.status, to: input.status } : {}),
            ...(input.commissionBp !== undefined ? { commissionBp: input.commissionBp } : {}),
          },
          ...meta,
        },
        tx,
      );
    });
    await reindexFood(this.prisma, [id]);
    return this.adminGet(id);
  }

  private async requireRestaurant(id: string) {
    const store = await this.prisma.store.findFirst({
      where: { id, kind: 'RESTAURANT', deletedAt: null },
      select: { id: true },
    });
    if (!store) throw notFound();
  }

  async addCategory(storeId: string, input: MenuCategoryInput, actorId: string, meta: Meta) {
    await this.requireRestaurant(storeId);
    if (
      (await this.prisma.foodMenuCategory.count({ where: { storeId } })) >= MENU_LIMITS.categories
    ) {
      throw new AppException(HttpStatus.CONFLICT, 'MENU_LIMIT', 'Too many categories');
    }
    const row = await this.prisma.foodMenuCategory.create({
      data: { storeId, name: input.name, sort: input.sort },
      select: { id: true },
    });
    await this.audit.record({
      action: 'menu.category_added',
      entityType: 'FoodMenuCategory',
      entityId: row.id,
      actorId,
      metadata: { storeId },
      ...meta,
    });
    return this.adminGet(storeId);
  }

  async updateCategory(
    storeId: string,
    categoryId: string,
    input: MenuCategoryInput,
    actorId: string,
    meta: Meta,
  ) {
    const updated = await this.prisma.foodMenuCategory.updateMany({
      where: { id: categoryId, storeId },
      data: { name: input.name, sort: input.sort },
    });
    if (updated.count === 0) throw notFound('Category');
    await this.audit.record({
      action: 'menu.category_updated',
      entityType: 'FoodMenuCategory',
      entityId: categoryId,
      actorId,
      metadata: { storeId },
      ...meta,
    });
    await reindexFood(this.prisma, [storeId]);
    return this.adminGet(storeId);
  }

  private async requireCategory(storeId: string, categoryId: string) {
    const category = await this.prisma.foodMenuCategory.findFirst({
      where: { id: categoryId, storeId },
      select: { id: true },
    });
    if (!category) throw bad('VALIDATION_FAILED', 'Unknown category');
  }

  async addItem(storeId: string, input: MenuItemInput, actorId: string, meta: Meta) {
    await this.requireRestaurant(storeId);
    await this.requireCategory(storeId, input.categoryId);
    if ((await this.prisma.foodMenuItem.count({ where: { storeId } })) >= MENU_LIMITS.items) {
      throw new AppException(HttpStatus.CONFLICT, 'MENU_LIMIT', 'Too many dishes');
    }
    const row = await this.prisma.foodMenuItem.create({
      data: {
        storeId,
        categoryId: input.categoryId,
        name: input.name,
        ...(input.description ? { description: input.description } : {}),
        priceTiyin: BigInt(input.priceTiyin),
        sort: input.sort,
        mxikCode: input.mxikCode ?? null,
        packageCode: input.packageCode ?? null,
        vatRateBp: input.vatRateBp ?? null,
      },
      select: { id: true },
    });
    await this.audit.record({
      action: 'menu.item_added',
      entityType: 'FoodMenuItem',
      entityId: row.id,
      actorId,
      metadata: { storeId, priceTiyin: input.priceTiyin },
      ...meta,
    });
    await reindexFood(this.prisma, [storeId]);
    return this.adminGet(storeId);
  }

  async updateItem(
    storeId: string,
    itemId: string,
    input: UpdateMenuItem,
    actorId: string,
    meta: Meta,
  ) {
    if (input.categoryId) await this.requireCategory(storeId, input.categoryId);
    const updated = await this.prisma.foodMenuItem.updateMany({
      where: { id: itemId, storeId },
      data: {
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
        ...(input.name ? { name: input.name } : {}),
        ...(input.description !== undefined
          ? { description: input.description ?? Prisma.DbNull }
          : {}),
        ...(input.priceTiyin ? { priceTiyin: BigInt(input.priceTiyin) } : {}),
        ...(input.sort !== undefined ? { sort: input.sort } : {}),
        ...(input.mxikCode !== undefined ? { mxikCode: input.mxikCode } : {}),
        ...(input.packageCode !== undefined ? { packageCode: input.packageCode } : {}),
        ...(input.vatRateBp !== undefined ? { vatRateBp: input.vatRateBp } : {}),
        ...(input.archived !== undefined ? { archived: input.archived } : {}),
        ...(input.available !== undefined ? { available: input.available } : {}),
      },
    });
    if (updated.count === 0) throw notFound('Dish');
    await this.audit.record({
      action: 'menu.item_updated',
      entityType: 'FoodMenuItem',
      entityId: itemId,
      actorId,
      metadata: {
        storeId,
        fields: Object.keys(input),
        ...(input.priceTiyin ? { priceTiyin: input.priceTiyin } : {}),
      },
      ...meta,
    });
    await reindexFood(this.prisma, [storeId]);
    return this.adminGet(storeId);
  }

  /** Dish photo or restaurant cover (itemId null): decoded and re-encoded server-side. */
  async setImage(
    storeId: string,
    itemId: string | null,
    file: Buffer,
    actorId: string,
    meta: Meta,
  ) {
    if (file.length > PRODUCT_IMAGE_LIMITS.maxBytes) {
      throw bad('FILE_TOO_LARGE', 'The file is too large');
    }
    await this.requireRestaurant(storeId);
    let previous: string | null;
    if (itemId) {
      const item = await this.prisma.foodMenuItem.findFirst({
        where: { id: itemId, storeId },
        select: { imageKey: true },
      });
      if (!item) throw notFound('Dish');
      previous = item.imageKey;
    } else {
      const profile = await this.prisma.restaurantProfile.findUniqueOrThrow({
        where: { storeId },
        select: { coverKey: true },
      });
      previous = profile.coverKey;
    }
    const image = await processProductImage(file);
    if (!image) throw bad('INVALID_IMAGE', 'Upload a JPEG, PNG, WebP or AVIF image');
    const key = `food/${storeId.replaceAll('-', '')}/${randomBytes(12).toString('hex')}.webp`;
    await this.storage.put(key, image.body, 'image/webp');
    if (itemId) {
      await this.prisma.foodMenuItem.update({ where: { id: itemId }, data: { imageKey: key } });
    } else {
      await this.prisma.restaurantProfile.update({ where: { storeId }, data: { coverKey: key } });
    }
    if (previous) await this.storage.delete(previous).catch(() => undefined);
    await this.audit.record({
      action: itemId ? 'menu.item_image_set' : 'restaurant.cover_set',
      entityType: itemId ? 'FoodMenuItem' : 'Store',
      entityId: itemId ?? storeId,
      actorId,
      metadata: { storeId },
      ...meta,
    });
    return this.adminGet(storeId);
  }
}
