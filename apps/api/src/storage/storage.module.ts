import { Global, Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { DevLocalDiskStorage } from './dev-local-disk.storage.js';
import { MediaController } from './media.controller.js';
import { STORAGE, type StorageAdapter } from './storage.adapter.js';

@Global()
@Module({
  controllers: [MediaController],
  providers: [
    {
      provide: STORAGE,
      inject: [ENV],
      useFactory: (env: Env): StorageAdapter =>
        new DevLocalDiskStorage(env.STORAGE_LOCAL_DIR, env.MEDIA_PUBLIC_BASE_URL),
    },
  ],
  exports: [STORAGE],
})
export class StorageModule {}
