import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type AdminPayout,
  type AdminPayoutList,
  type AdminRefundList,
  type LedgerSummary,
  type PayoutDetails,
  type StoreFinance,
  adminPayoutListQuerySchema,
  adminRefundListQuerySchema,
  createPayoutSchema,
  payoutDetailsSchema,
  payoutPaidSchema,
  refundFailedSchema,
  refundSucceededSchema,
  storeCommissionSchema,
} from '@uzgo/contracts';
import type { Request } from 'express';
import type { z } from 'zod';
import { metaOf } from '../admin/meta.js';
import type { AuthContext } from '../auth/auth.types.js';
import { CurrentAuth, RequireStaffTotp, Roles } from '../auth/decorators.js';
import { AppException } from '../common/http-exception.filter.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { Role } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StoreAccessService } from '../seller/store-access.service.js';
import { FinanceService } from './finance.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

/** Store money: balance, ledger lines, payouts, bank details. Owner only. */
@ApiTags('seller')
@Controller('seller/stores/:storeId')
export class SellerFinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly access: StoreAccessService,
  ) {}

  @Get('finance')
  async get(
    @CurrentAuth() auth: AuthContext,
    @Param('storeId', uuid) storeId: string,
  ): Promise<StoreFinance> {
    await this.access.require(auth.user.id, storeId, { owner: true });
    return this.finance.storeFinance(storeId);
  }

  @Put('payout-details')
  async setDetails(
    @CurrentAuth() auth: AuthContext,
    @Param('storeId', uuid) storeId: string,
    @Body(new ZodValidationPipe(payoutDetailsSchema)) body: PayoutDetails,
    @Req() req: Request,
  ): Promise<StoreFinance> {
    await this.access.require(auth.user.id, storeId, { owner: true, write: true });
    await this.finance.setPayoutDetails(storeId, auth.user.id, body, metaOf(req));
    return this.finance.storeFinance(storeId);
  }
}

/** Refunds, payouts, commission and ledger. Admins with a verified second factor. */
@ApiTags('admin')
@Controller('admin')
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@RequireStaffTotp()
export class AdminFinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('refunds')
  refunds(
    @Query(new ZodValidationPipe(adminRefundListQuerySchema))
    query: z.output<typeof adminRefundListQuerySchema>,
  ): Promise<AdminRefundList> {
    return this.finance.listRefunds(query.status, query.page);
  }

  @Post('refunds/:id/succeed')
  @HttpCode(HttpStatus.NO_CONTENT)
  async refundSucceeded(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(refundSucceededSchema)) body: z.infer<typeof refundSucceededSchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<void> {
    await this.finance.markRefund(
      id,
      { status: 'SUCCEEDED', reference: body.reference },
      auth.user.id,
      metaOf(req),
    );
  }

  @Post('refunds/:id/fail')
  @HttpCode(HttpStatus.NO_CONTENT)
  async refundFailed(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(refundFailedSchema)) body: z.infer<typeof refundFailedSchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<void> {
    await this.finance.markRefund(
      id,
      { status: 'FAILED', note: body.note },
      auth.user.id,
      metaOf(req),
    );
  }

  @Get('payouts')
  payouts(
    @Query(new ZodValidationPipe(adminPayoutListQuerySchema))
    query: z.output<typeof adminPayoutListQuerySchema>,
  ): Promise<AdminPayoutList> {
    return this.finance.listPayouts(query.status, query.page);
  }

  @Get('stores/:id/finance')
  async storeFinance(@Param('id', uuid) id: string): Promise<StoreFinance> {
    const exists = await this.prisma.store.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Store not found');
    return this.finance.storeFinance(id);
  }

  @Post('stores/:id/payouts')
  async createPayout(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(createPayoutSchema)) body: z.infer<typeof createPayoutSchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<{ payout: AdminPayout }> {
    return {
      payout: await this.finance.createPayout(
        id,
        BigInt(body.amountTiyin),
        auth.user.id,
        metaOf(req),
      ),
    };
  }

  @Post('payouts/:id/paid')
  @HttpCode(HttpStatus.OK)
  async payoutPaid(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(payoutPaidSchema)) body: z.infer<typeof payoutPaidSchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<{ payout: AdminPayout }> {
    return {
      payout: await this.finance.settlePayout(
        id,
        { status: 'PAID', reference: body.reference },
        auth.user.id,
        metaOf(req),
      ),
    };
  }

  @Post('payouts/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async payoutCancel(
    @Param('id', uuid) id: string,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<{ payout: AdminPayout }> {
    return {
      payout: await this.finance.settlePayout(
        id,
        { status: 'CANCELLED' },
        auth.user.id,
        metaOf(req),
      ),
    };
  }

  @Patch('stores/:id/commission')
  @HttpCode(HttpStatus.NO_CONTENT)
  async storeCommission(
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(storeCommissionSchema)) body: z.infer<typeof storeCommissionSchema>,
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
  ): Promise<void> {
    await this.finance.setStoreCommission(id, body.commissionBp, auth.user.id, metaOf(req));
  }

  @Get('ledger')
  ledger(): Promise<LedgerSummary> {
    return this.finance.ledgerSummary();
  }
}
