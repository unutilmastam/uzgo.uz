import type { Request } from 'express';
import { clientIp } from '../common/http.js';

export type Meta = { ip: string; requestId?: string | undefined };

export const metaOf = (req: Request): Meta => ({
  ip: clientIp(req),
  requestId: typeof req.id === 'string' ? req.id : undefined,
});

export const PAGE_SIZE = 20;
export type Names = { uz: string; ru: string };
