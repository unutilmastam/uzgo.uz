import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  apiErrorSchema,
  currentUserResponseSchema,
  districtsResponseSchema,
  regionsResponseSchema,
} from '@uzgo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp, login, loginStaff, TEST_ORIGIN } from './app.js';

const errorCode = (body: unknown) => apiErrorSchema.parse(body).error.code;

describe('geo, profile and roles', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('geo (public, seeded reference data)', () => {
    it('lists 14 regions and the districts of Surxondaryo', async () => {
      const regions = regionsResponseSchema.parse(
        (await http().get('/api/v1/geo/regions').expect(200)).body,
      );
      expect(regions.items).toHaveLength(14);
      const surxondaryo = regions.items.find((r) => r.code === 'UZ-SU');
      expect(surxondaryo?.name.uz).toBe('Surxondaryo viloyati');

      const districts = districtsResponseSchema.parse(
        (
          await http()
            .get(`/api/v1/geo/regions/${surxondaryo?.id ?? ''}/districts`)
            .expect(200)
        ).body,
      );
      expect(districts.items).toHaveLength(15);
      expect(districts.items[0]?.name.uz).toBe('Termiz shahri');
      expect(districts.items.map((d) => d.name.uz)).toContain('Jarqoʻrgʻon tumani');
    });

    it('validates the region id', async () => {
      await http().get('/api/v1/geo/regions/not-a-uuid/districts').expect(400);
      await http()
        .get('/api/v1/geo/regions/01890000-0000-7000-8000-000000000000/districts')
        .expect(404);
    });
  });

  describe('PATCH /users/me', () => {
    it('requires authentication', async () => {
      await http().patch('/api/v1/users/me').send({ firstName: 'Ali' }).expect(401);
    });

    it('rejects unknown fields such as roles (no mass assignment)', async () => {
      const { cookie } = await login(app);
      const res = await http()
        .patch('/api/v1/users/me')
        .set('Cookie', cookie)
        .set('Origin', TEST_ORIGIN)
        .send({ firstName: 'Ali', roles: ['SUPER_ADMIN'] })
        .expect(400);
      expect(errorCode(res.body)).toBe('VALIDATION_FAILED');
    });

    it('rejects an unknown district', async () => {
      const { cookie } = await login(app);
      await http()
        .patch('/api/v1/users/me')
        .set('Cookie', cookie)
        .set('Origin', TEST_ORIGIN)
        .send({ districtId: '01890000-0000-7000-8000-000000000000' })
        .expect(400);
    });

    it('updates the profile and audits field names only', async () => {
      const { cookie, userId } = await login(app);
      const district = await prisma.district.findFirstOrThrow({ where: { slug: 'termiz_city' } });
      const res = await http()
        .patch('/api/v1/users/me')
        .set('Cookie', cookie)
        .set('Origin', TEST_ORIGIN)
        .send({ firstName: 'Gʻayrat', lastName: 'Maʼrufov', districtId: district.id, locale: 'ru' })
        .expect(200);
      const { user } = currentUserResponseSchema.parse(res.body);
      expect(user.profile).toEqual({
        firstName: 'Gʻayrat',
        lastName: 'Maʼrufov',
        districtId: district.id,
        regionId: district.regionId,
      });
      expect(user.locale).toBe('ru');

      const event = await prisma.auditEvent.findFirstOrThrow({
        where: { actorId: userId, action: 'user.profile_updated' },
      });
      expect(JSON.stringify(event.metadata)).not.toContain('Gʻayrat');
    });
  });

  describe('role management (RBAC)', () => {
    const makeRole = (role: 'ADMIN' | 'SUPER_ADMIN') => loginStaff(app, role);

    const grant = (cookie: string, userId: string, role: string) =>
      http()
        .post(`/api/v1/admin/users/${userId}/roles`)
        .set('Cookie', cookie)
        .set('Origin', TEST_ORIGIN)
        .send({ role });

    it('forbids customers', async () => {
      const customer = await login(app);
      const target = await login(app);
      const res = await grant(customer.cookie, target.userId, 'MODERATOR').expect(403);
      expect(errorCode(res.body)).toBe('FORBIDDEN');
      await http()
        .post(`/api/v1/admin/users/${target.userId}/roles`)
        .send({ role: 'MODERATOR' })
        .expect(401);
    });

    it('lets an admin grant and revoke moderator, with audit events', async () => {
      const admin = await makeRole('ADMIN');
      const target = await login(app);
      await grant(admin.cookie, target.userId, 'MODERATOR').expect(204);

      const me = await http().get('/api/v1/auth/me').set('Cookie', target.cookie).expect(200);
      expect(currentUserResponseSchema.parse(me.body).user.roles).toContain('MODERATOR');

      await http()
        .delete(`/api/v1/admin/users/${target.userId}/roles/MODERATOR`)
        .set('Cookie', admin.cookie)
        .set('Origin', TEST_ORIGIN)
        .expect(204);
      const actions = (
        await prisma.auditEvent.findMany({
          where: { entityId: target.userId, actorId: admin.userId },
        })
      ).map((e) => e.action);
      expect(actions).toEqual(expect.arrayContaining(['role.granted', 'role.revoked']));
    });

    it('only a super admin can grant admin roles, and nobody changes their own roles', async () => {
      const admin = await makeRole('ADMIN');
      const superAdmin = await makeRole('SUPER_ADMIN');
      const target = await login(app);
      await grant(admin.cookie, target.userId, 'ADMIN').expect(403);
      await grant(admin.cookie, admin.userId, 'SUPER_ADMIN').expect(403);
      await grant(superAdmin.cookie, superAdmin.userId, 'MODERATOR').expect(403);
      await grant(superAdmin.cookie, target.userId, 'ADMIN').expect(204);
    });

    it('validates role names and user ids', async () => {
      const admin = await makeRole('ADMIN');
      const target = await login(app);
      await grant(admin.cookie, target.userId, 'ROOT').expect(400);
      await grant(admin.cookie, 'not-a-uuid', 'MODERATOR').expect(400);
      await grant(admin.cookie, '01890000-0000-7000-8000-000000000000', 'MODERATOR').expect(404);
    });
  });
});
