import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { addCartItemSchema, type CartView, updateCartItemSchema } from '@uzgo/contracts';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { Public } from '../auth/decorators.js';
import { parseCookies } from '../common/http.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { type CartOwner, CartService } from './cart.service.js';

/**
 * Cart for guests (cookie) and logged-in users. Prices and availability are
 * recalculated on every response; nothing price-related comes from the client.
 */
@ApiTags('cart')
@Public()
@Controller('cart')
export class CartController {
  constructor(private readonly carts: CartService) {}

  private owner(req: Request): CartOwner {
    return req.auth
      ? { userId: req.auth.user.id }
      : { guestToken: parseCookies(req.headers.cookie)[this.carts.cookieName] };
  }

  private async cartFor(req: Request, res: Response, create: boolean): Promise<string | null> {
    const { cartId, newGuestToken } = await this.carts.resolve(this.owner(req), create);
    if (newGuestToken) res.cookie(this.carts.cookieName, newGuestToken, this.carts.cookieOptions());
    return cartId;
  }

  @Get()
  async get(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ cart: CartView }> {
    res.setHeader('Cache-Control', 'no-store');
    return { cart: await this.carts.view(await this.cartFor(req, res, false)) };
  }

  @Post('items')
  async add(
    @Body(new ZodValidationPipe(addCartItemSchema)) body: z.output<typeof addCartItemSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ cart: CartView }> {
    const cartId = (await this.cartFor(req, res, true)) as string;
    await this.carts.addItem(cartId, body.variantId, body.quantity);
    return { cart: await this.carts.view(cartId) };
  }

  @Patch('items/:variantId')
  async update(
    @Param('variantId', new ParseUUIDPipe({ version: '7' })) variantId: string,
    @Body(new ZodValidationPipe(updateCartItemSchema)) body: z.output<typeof updateCartItemSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ cart: CartView }> {
    const cartId = await this.cartFor(req, res, false);
    if (cartId) await this.carts.setQuantity(cartId, variantId, body.quantity);
    return { cart: await this.carts.view(cartId) };
  }

  @Delete('items/:variantId')
  async remove(
    @Param('variantId', new ParseUUIDPipe({ version: '7' })) variantId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ cart: CartView }> {
    const cartId = await this.cartFor(req, res, false);
    if (cartId) await this.carts.removeItem(cartId, variantId);
    return { cart: await this.carts.view(cartId) };
  }
}
