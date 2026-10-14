import { Controller, Get, Header, HttpStatus, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { District, Region } from '@uzgo/contracts';
import { AppException } from '../common/http-exception.filter.js';
import { Public } from '../auth/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Names = { uz: string; ru: string };

/** Uzbekistan regions and districts (reference data, docs/DATABASE.md). */
@ApiTags('geo')
@Public()
@Controller('geo/regions')
export class GeoController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=3600')
  async regions(): Promise<{ items: Region[] }> {
    const rows = await this.prisma.region.findMany({
      orderBy: { sort: 'asc' },
      select: { id: true, code: true, kind: true, name: true },
    });
    return { items: rows.map((r) => ({ ...r, name: r.name as Names })) };
  }

  @Get(':regionId/districts')
  @Header('Cache-Control', 'public, max-age=3600')
  async districts(
    @Param('regionId', new ParseUUIDPipe({ version: '7' })) regionId: string,
  ): Promise<{ items: District[] }> {
    const region = await this.prisma.region.findUnique({
      where: { id: regionId },
      select: { id: true },
    });
    if (!region) throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Region not found');
    const rows = await this.prisma.district.findMany({
      where: { regionId, active: true },
      orderBy: { sort: 'asc' },
      select: { id: true, regionId: true, kind: true, name: true },
    });
    return { items: rows.map((d) => ({ ...d, name: d.name as Names })) };
  }
}
