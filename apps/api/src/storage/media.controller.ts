import { Controller, Get, HttpStatus, Inject, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/decorators.js';
import { AppException } from '../common/http-exception.filter.js';
import { STORAGE, type StorageAdapter } from './storage.adapter.js';

/**
 * Serves objects from the development storage adapter. In production images
 * are served by object storage / CDN directly (docs/DEPLOYMENT.md).
 */
@ApiExcludeController()
@Public()
@Controller('media')
export class MediaController {
  constructor(@Inject(STORAGE) private readonly storage: StorageAdapter) {}

  @Get('*key')
  async get(@Param('key') key: string | string[], @Res() res: Response): Promise<void> {
    const path = Array.isArray(key) ? key.join('/') : key;
    const object = await this.storage.get(path);
    if (!object) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Not found');
    res.setHeader('Content-Type', object.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.send(object.body);
  }
}
