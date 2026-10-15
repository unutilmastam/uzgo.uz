import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { FavoritesController } from './favorites.controller.js';

@Module({ imports: [CatalogModule], controllers: [FavoritesController] })
export class FavoritesModule {}
