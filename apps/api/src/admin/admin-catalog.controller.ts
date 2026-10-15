import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type AdminAttribute,
  type AdminCategory,
  categoryAttributesSchema,
  createAttributeSchema,
  createAttributeValueSchema,
  createCategorySchema,
  updateAttributeSchema,
  updateAttributeValueSchema,
  updateCategorySchema,
} from '@uzgo/contracts';
import type { Request } from 'express';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentAuth, RequireStaffTotp, Roles } from '../auth/decorators.js';
import { AppException } from '../common/http-exception.filter.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Prisma } from '../generated/prisma/client.js';
import { Role } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { reindexProducts } from '../search/search-index.js';
import { metaOf, type Names } from './meta.js';

const uuid = new ParseUUIDPipe({ version: '7' });
type Tx = Prisma.TransactionClient;

const notFound = (what: string) =>
  new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} not found`);

/** Maps unique-constraint violations to a 409 the UI can show. */
async function unique<T>(write: () => Promise<T>, code: string): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new AppException(HttpStatus.CONFLICT, code, 'Already exists');
    }
    throw err;
  }
}

/**
 * Category tree and filter attributes. Admin-only. Category names feed the
 * search index, so renames and moves reindex the affected products.
 */
@ApiTags('admin')
@Controller('admin')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@RequireStaffTotp()
export class AdminCatalogController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async categories(where: Prisma.CategoryWhereInput = {}): Promise<AdminCategory[]> {
    const rows = await this.prisma.category.findMany({
      where,
      orderBy: [{ sort: 'asc' }, { slug: 'asc' }],
      include: {
        attributes: { orderBy: { sort: 'asc' }, select: { attributeId: true } },
        _count: { select: { products: { where: { deletedAt: null } } } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      parentId: row.parentId,
      slug: row.slug,
      name: row.name as Names,
      icon: row.icon,
      sort: row.sort,
      active: row.active,
      attributeIds: row.attributes.map((a) => a.attributeId),
      productCount: row._count.products,
      commissionBp: row.commissionBp,
    }));
  }

  private async category(id: string): Promise<{ category: AdminCategory }> {
    const [category] = await this.categories({ id });
    if (!category) throw notFound('Category');
    return { category };
  }

  /** Every category in the subtree of `id`, including itself. */
  private async subtree(tx: Tx, id: string): Promise<string[]> {
    const all = await tx.category.findMany({ select: { id: true, parentId: true } });
    const ids = [id];
    for (let i = 0; i < ids.length; i += 1) {
      for (const c of all) if (c.parentId === ids[i]) ids.push(c.id);
    }
    return ids;
  }

  private async reindexCategory(tx: Tx, id: string): Promise<void> {
    const categoryIds = await this.subtree(tx, id);
    const products = await tx.product.findMany({
      where: { categoryId: { in: categoryIds } },
      select: { id: true },
    });
    if (products.length > 0)
      await reindexProducts(
        tx,
        products.map((p) => p.id),
      );
  }

  @Get('categories')
  async listCategories(): Promise<{ items: AdminCategory[] }> {
    return { items: await this.categories() };
  }

  @Post('categories')
  async createCategory(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createCategorySchema)) body: z.output<typeof createCategorySchema>,
    @Req() req: Request,
  ): Promise<{ category: AdminCategory }> {
    const id = await this.prisma.$transaction(async (tx) => {
      if (body.parentId) {
        const parent = await tx.category.findUnique({
          where: { id: body.parentId },
          select: { _count: { select: { products: true } } },
        });
        if (!parent) throw notFound('Parent category');
        // Products live in leaf categories only.
        if (parent._count.products > 0) {
          throw new AppException(
            HttpStatus.CONFLICT,
            'PARENT_HAS_PRODUCTS',
            'Move the products of the parent category first',
          );
        }
      }
      const created = await unique(
        () => tx.category.create({ data: body, select: { id: true } }),
        'SLUG_TAKEN',
      );
      await this.audit.record(
        {
          action: 'category.created',
          entityType: 'Category',
          entityId: created.id,
          actorId: auth.user.id,
          metadata: { slug: body.slug },
          ...metaOf(req),
        },
        tx,
      );
      return created.id;
    });
    return this.category(id);
  }

  @Patch('categories/:id')
  async updateCategory(
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateCategorySchema)) body: z.output<typeof updateCategorySchema>,
    @Req() req: Request,
  ): Promise<{ category: AdminCategory }> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.category.findUnique({ where: { id }, select: { id: true } });
      if (!current) throw notFound('Category');
      if (body.parentId) {
        // A category cannot move under itself or one of its descendants.
        if ((await this.subtree(tx, id)).includes(body.parentId)) {
          throw new AppException(HttpStatus.BAD_REQUEST, 'CATEGORY_CYCLE', 'Invalid parent');
        }
        const parent = await tx.category.findUnique({
          where: { id: body.parentId },
          select: { _count: { select: { products: true } } },
        });
        if (!parent) throw notFound('Parent category');
        if (parent._count.products > 0) {
          throw new AppException(
            HttpStatus.CONFLICT,
            'PARENT_HAS_PRODUCTS',
            'Move the products of the parent category first',
          );
        }
      }
      await unique(() => tx.category.update({ where: { id }, data: body }), 'SLUG_TAKEN');
      if (body.name !== undefined || body.parentId !== undefined)
        await this.reindexCategory(tx, id);
      await this.audit.record(
        {
          action: 'category.updated',
          entityType: 'Category',
          entityId: id,
          actorId: auth.user.id,
          metadata: { fields: Object.keys(body) },
          ...metaOf(req),
        },
        tx,
      );
    });
    return this.category(id);
  }

  @Put('categories/:id/attributes')
  async setCategoryAttributes(
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(categoryAttributesSchema))
    body: z.infer<typeof categoryAttributesSchema>,
    @Req() req: Request,
  ): Promise<{ category: AdminCategory }> {
    const ids = [...new Set(body.attributeIds)];
    await this.prisma.$transaction(async (tx) => {
      if (!(await tx.category.findUnique({ where: { id }, select: { id: true } }))) {
        throw notFound('Category');
      }
      if ((await tx.attribute.count({ where: { id: { in: ids } } })) !== ids.length) {
        throw new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Unknown attribute');
      }
      await tx.categoryAttribute.deleteMany({ where: { categoryId: id } });
      await tx.categoryAttribute.createMany({
        data: ids.map((attributeId, sort) => ({ categoryId: id, attributeId, sort })),
      });
      await this.audit.record(
        {
          action: 'category.attributes_set',
          entityType: 'Category',
          entityId: id,
          actorId: auth.user.id,
          metadata: { attributeIds: ids },
          ...metaOf(req),
        },
        tx,
      );
    });
    return this.category(id);
  }

  private async attributes(where: Prisma.AttributeWhereInput = {}): Promise<AdminAttribute[]> {
    const rows = await this.prisma.attribute.findMany({
      where,
      orderBy: [{ sort: 'asc' }, { code: 'asc' }],
      include: { values: { orderBy: [{ sort: 'asc' }, { code: 'asc' }] } },
    });
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name as Names,
      sort: row.sort,
      values: row.values.map((v) => ({
        id: v.id,
        code: v.code,
        name: v.name as Names,
        sort: v.sort,
      })),
    }));
  }

  private async attribute(id: string): Promise<{ attribute: AdminAttribute }> {
    const [attribute] = await this.attributes({ id });
    if (!attribute) throw notFound('Attribute');
    return { attribute };
  }

  @Get('attributes')
  async listAttributes(): Promise<{ items: AdminAttribute[] }> {
    return { items: await this.attributes() };
  }

  @Post('attributes')
  async createAttribute(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(createAttributeSchema))
    body: z.output<typeof createAttributeSchema>,
    @Req() req: Request,
  ): Promise<{ attribute: AdminAttribute }> {
    const created = await unique(
      () => this.prisma.attribute.create({ data: body, select: { id: true } }),
      'CODE_TAKEN',
    );
    await this.audit.record({
      action: 'attribute.created',
      entityType: 'Attribute',
      entityId: created.id,
      actorId: auth.user.id,
      metadata: { code: body.code },
      ...metaOf(req),
    });
    return this.attribute(created.id);
  }

  @Patch('attributes/:id')
  async updateAttribute(
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(updateAttributeSchema))
    body: z.output<typeof updateAttributeSchema>,
    @Req() req: Request,
  ): Promise<{ attribute: AdminAttribute }> {
    const updated = await this.prisma.attribute.updateMany({ where: { id }, data: body });
    if (updated.count === 0) throw notFound('Attribute');
    await this.audit.record({
      action: 'attribute.updated',
      entityType: 'Attribute',
      entityId: id,
      actorId: auth.user.id,
      metadata: { fields: Object.keys(body) },
      ...metaOf(req),
    });
    return this.attribute(id);
  }

  @Post('attributes/:id/values')
  async createValue(
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(createAttributeValueSchema))
    body: z.output<typeof createAttributeValueSchema>,
    @Req() req: Request,
  ): Promise<{ attribute: AdminAttribute }> {
    if (!(await this.prisma.attribute.findUnique({ where: { id }, select: { id: true } }))) {
      throw notFound('Attribute');
    }
    const value = await unique(
      () =>
        this.prisma.attributeValue.create({
          data: { ...body, attributeId: id },
          select: { id: true },
        }),
      'CODE_TAKEN',
    );
    await this.audit.record({
      action: 'attribute.value_created',
      entityType: 'AttributeValue',
      entityId: value.id,
      actorId: auth.user.id,
      metadata: { attributeId: id, code: body.code },
      ...metaOf(req),
    });
    return this.attribute(id);
  }

  @Patch('attributes/:id/values/:valueId')
  async updateValue(
    @CurrentAuth() auth: AuthContext,
    @Param('id', uuid) id: string,
    @Param('valueId', uuid) valueId: string,
    @Body(new ZodValidationPipe(updateAttributeValueSchema))
    body: z.output<typeof updateAttributeValueSchema>,
    @Req() req: Request,
  ): Promise<{ attribute: AdminAttribute }> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.attributeValue.updateMany({
        where: { id: valueId, attributeId: id },
        data: body,
      });
      if (updated.count === 0) throw notFound('Value');
      if (body.name !== undefined) {
        // Brand and other value names are part of the search text.
        const products = await tx.productAttributeValue.findMany({
          where: { attributeValueId: valueId },
          select: { productId: true },
        });
        if (products.length > 0)
          await reindexProducts(
            tx,
            products.map((p) => p.productId),
          );
      }
      await this.audit.record(
        {
          action: 'attribute.value_updated',
          entityType: 'AttributeValue',
          entityId: valueId,
          actorId: auth.user.id,
          metadata: { fields: Object.keys(body) },
          ...metaOf(req),
        },
        tx,
      );
    });
    return this.attribute(id);
  }
}
