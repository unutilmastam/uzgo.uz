import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiErrorSchema, healthLiveSchema, healthReadySchema } from '@uzgo/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, TEST_ORIGIN } from './app.js';

describe('API over HTTP (real PostgreSQL)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health/live → 200', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
    expect(healthLiveSchema.parse(res.body)).toEqual({ status: 'ok' });
  });

  it('GET /api/v1/health/ready → 200 when the database is up', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    expect(healthReadySchema.parse(res.body)).toEqual({ status: 'ok', checks: { database: 'up' } });
  });

  it('returns a generated X-Request-Id and reuses a safe incoming one', async () => {
    const generated = await request(app.getHttpServer()).get('/api/v1/health/live');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const reused = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('X-Request-Id', 'req-12345678');
    expect(reused.headers['x-request-id']).toBe('req-12345678');

    const unsafe = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('X-Request-Id', 'bad id <script>');
    expect(unsafe.headers['x-request-id']).not.toContain('bad');
  });

  it('unknown routes return the standard error shape with the request id', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);
    const body = apiErrorSchema.parse(res.body);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBe(res.headers['x-request-id']);
  });

  it('rejects bodies over the size limit with 413', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/health/live')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ padding: 'x'.repeat(4096) }))
      .expect(413);
    expect(apiErrorSchema.parse(res.body).error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects malformed JSON with 400 and no internals', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/health/live')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400);
    const body = apiErrorSchema.parse(res.body);
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(JSON.stringify(body)).not.toMatch(/at .*\.js|SyntaxError/);
  });

  it('sets security headers', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows CORS only for allow-listed origins', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('Origin', TEST_ORIGIN);
    expect(allowed.headers['access-control-allow-origin']).toBe(TEST_ORIGIN);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('Origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('serves the OpenAPI document outside production', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    const body = res.body as { paths: Record<string, unknown> };
    expect(Object.keys(body.paths)).toContain('/api/v1/health/ready');
  });
});

describe('readiness when the database is down', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({
      prisma: { isReachable: () => Promise.resolve(false), $disconnect: () => Promise.resolve() },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health/ready → 503', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(503);
    expect(healthReadySchema.parse(res.body)).toEqual({
      status: 'error',
      checks: { database: 'down' },
    });
  });
});
