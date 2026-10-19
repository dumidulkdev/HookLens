import 'reflect-metadata';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createApp } from '../src/create-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { CreatedEndpointDto } from '../src/endpoints/endpoints.dto';
import { hashToken } from '../src/endpoints/token';
import { EndpointsService } from '../src/endpoints/endpoints.service';
import { RequestPageDto, RequestDetailDto } from '../src/captures/requests.dto';
import { ExpirationService } from '../src/endpoints/expiration.service';

describe('HookLens integration', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const endpointIds: string[] = [];

  beforeAll(async () => {
    app = await createApp(false);
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    if (prisma) await prisma.webhookEndpoint.deleteMany({ where: { id: { in: endpointIds } } });
    if (app) await app.close();
  });

  async function createEndpoint(): Promise<CreatedEndpointDto> {
    const result = await request(app.getHttpServer()).post('/api/endpoints').expect(201);
    const endpoint = result.body as CreatedEndpointDto;
    endpointIds.push(endpoint.id);
    return endpoint;
  }

  it('clears history and deletes endpoints with cascading captures only with authorization', async () => {
    const endpoint = await createEndpoint();
    const root = `/api/endpoints/${endpoint.id}`;
    const path = new URL(endpoint.webhookUrl).pathname;
    const auth = `Bearer ${endpoint.managementToken}`;
    await request(app.getHttpServer()).post(path).send('first').expect(200);
    await request(app.getHttpServer()).delete(`${root}/requests`).expect(401);
    await request(app.getHttpServer()).delete(root).expect(401);
    await request(app.getHttpServer())
      .delete(`${root}/requests`)
      .set('Authorization', auth)
      .expect(200, { deleted: 1 });
    expect(await prisma.capturedRequest.count({ where: { endpointId: endpoint.id } })).toBe(0);
    await request(app.getHttpServer()).post(path).send('second').expect(200);
    await request(app.getHttpServer()).delete(root).set('Authorization', auth).expect(204);
    expect(await prisma.capturedRequest.count({ where: { endpointId: endpoint.id } })).toBe(0);
    await request(app.getHttpServer()).post(path).expect(404);
  });

  it('reclaims expired endpoints and their captures without touching active endpoints', async () => {
    const endpoint = await createEndpoint();
    const active = await createEndpoint();
    await request(app.getHttpServer()).post(new URL(endpoint.webhookUrl).pathname).expect(200);
    await prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const deleted = await app.get(ExpirationService).cleanupExpired();
    expect(deleted).toContain(endpoint.id);
    expect(deleted).not.toContain(active.id);
    expect(await prisma.webhookEndpoint.findUnique({ where: { id: endpoint.id } })).toBeNull();
    expect(await prisma.capturedRequest.count({ where: { endpointId: endpoint.id } })).toBe(0);
  });

  it('protects history and details, paginates, filters, and prevents cross-endpoint reads', async () => {
    const endpoint = await createEndpoint();
    const path = new URL(endpoint.webhookUrl).pathname;
    const history = `/api/endpoints/${endpoint.id}/requests`;
    const auth = `Bearer ${endpoint.managementToken}`;
    await request(app.getHttpServer())
      .post(path)
      .set('Content-Type', 'application/json')
      .send('{ "hello": true }')
      .expect(200);
    await request(app.getHttpServer())
      .put(path)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from([255, 0, 128]))
      .expect(200);
    await request(app.getHttpServer()).get(history).expect(401);
    await request(app.getHttpServer())
      .get(history)
      .set('Authorization', `Bearer ${'x'.repeat(43)}`)
      .expect(401);
    const result = await request(app.getHttpServer())
      .get(`${history}?limit=1`)
      .set('Authorization', auth)
      .expect(200);
    const page = result.body as RequestPageDto;
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(2);
    expect(page.hasMore).toBe(true);
    expect(page.items[0]).not.toHaveProperty('body');
    const second = await request(app.getHttpServer())
      .get(`${history}?page=2&limit=1`)
      .set('Authorization', auth)
      .expect(200);
    expect((second.body as RequestPageDto).items[0]?.id).not.toBe(page.items[0]?.id);
    const filtered = await request(app.getHttpServer())
      .get(`${history}?method=POST`)
      .set('Authorization', auth)
      .expect(200);
    const post = (filtered.body as RequestPageDto).items[0]!;
    const full = await request(app.getHttpServer())
      .get(`${history}/${post.id}`)
      .set('Authorization', auth)
      .expect(200);
    expect((full.body as RequestDetailDto).bodyText).toBe('{ "hello": true }');
    expect(full.body).not.toHaveProperty('body');
    expect(Buffer.from((full.body as RequestDetailDto).bodyBase64, 'base64').toString()).toBe(
      '{ "hello": true }',
    );
    const binary = await request(app.getHttpServer())
      .get(`${history}?method=PUT`)
      .set('Authorization', auth)
      .expect(200);
    const binaryId = (binary.body as RequestPageDto).items[0]!.id;
    const binaryFull = await request(app.getHttpServer())
      .get(`${history}/${binaryId}`)
      .set('Authorization', auth)
      .expect(200);
    expect((binaryFull.body as RequestDetailDto).bodyText).toBeNull();
    const other = await createEndpoint();
    await request(app.getHttpServer())
      .get(`/api/endpoints/${other.id}/requests/${post.id}`)
      .set('Authorization', `Bearer ${other.managementToken}`)
      .expect(404);
    await request(app.getHttpServer()).get(`${history}/${post.id}`).expect(401);
    for (const query of ['limit=101', 'page=0', 'method=TRACE', 'unexpected=1']) {
      await request(app.getHttpServer())
        .get(`${history}?${query}`)
        .set('Authorization', auth)
        .expect(400);
    }
  });

  it.each([
    ['application/json', '{ "event": "created", "value": 1 }\n'],
    ['text/plain', 'hello webhook\n'],
    ['application/x-www-form-urlencoded', 'a=hello+world&a=two'],
    ['application/json', '{malformed-json'],
    ['application/octet-stream', Buffer.from([0, 255, 128, 13, 10])],
  ])('captures exact bytes for %s', async (contentType, payload) => {
    const endpoint = await createEndpoint();
    const path = new URL(endpoint.webhookUrl).pathname;
    await request(app.getHttpServer())
      .post(`${path}?tag=a&tag=b`)
      .set('Content-Type', contentType)
      .set('X-Forwarded-For', '203.0.113.10')
      .send(payload)
      .expect(200, { received: true });
    const capture = await prisma.capturedRequest.findFirstOrThrow({
      where: { endpointId: endpoint.id },
    });
    expect(Buffer.from(capture.body)).toEqual(
      Buffer.isBuffer(payload) ? payload : Buffer.from(payload),
    );
    expect(capture.query).toEqual({ tag: ['a', 'b'] });
    expect(capture.sourceIp).not.toBe('203.0.113.10');
    expect(capture.contentType).toBe(contentType);
  });

  it('supports all five HTTP methods', async () => {
    const endpoint = await createEndpoint();
    const path = new URL(endpoint.webhookUrl).pathname;
    const server = request(app.getHttpServer());
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      await server[method](path).expect(200);
    }
    expect(await prisma.capturedRequest.count({ where: { endpointId: endpoint.id } })).toBe(5);
  });

  it('rejects unknown and expired slugs', async () => {
    await request(app.getHttpServer()).post('/h/unknown').expect(404);
    const endpoint = await createEndpoint();
    await prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await request(app.getHttpServer()).post(new URL(endpoint.webhookUrl).pathname).expect(404);
  });

  it('accepts 256 KiB and rejects larger bodies without storing them', async () => {
    const endpoint = await createEndpoint();
    const path = new URL(endpoint.webhookUrl).pathname;
    await request(app.getHttpServer())
      .post(path)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.alloc(256 * 1024))
      .expect(200);
    await request(app.getHttpServer())
      .post(path)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.alloc(256 * 1024 + 1))
      .expect(413);
    expect(await prisma.capturedRequest.count({ where: { endpointId: endpoint.id } })).toBe(1);
  });

  it('retains at most 100 requests under concurrent deliveries', async () => {
    const endpoint = await createEndpoint();
    const path = new URL(endpoint.webhookUrl).pathname;
    for (let i = 0; i < 11; i++) {
      await Promise.all(
        Array.from({ length: 10 }, () => request(app.getHttpServer()).post(path).expect(200)),
      );
    }
    expect(await prisma.capturedRequest.count({ where: { endpointId: endpoint.id } })).toBe(100);
  });

  it('creates independent random public slugs and management tokens, storing only the hash', async () => {
    const endpoint = await createEndpoint();
    expect(endpoint.webhookUrl.split('/').pop()).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(endpoint.managementToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Date(endpoint.expiresAt).getTime() - Date.now()).toBeGreaterThan(86_390_000);
    const stored = await prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpoint.id } });
    expect(stored.managementTokenHash).toBe(hashToken(endpoint.managementToken));
    expect(JSON.stringify(stored)).not.toContain(endpoint.managementToken);
    const other = await createEndpoint();
    expect(other.webhookUrl).not.toBe(endpoint.webhookUrl);
    expect(other.managementToken).not.toBe(endpoint.managementToken);
    await expect(app.get(EndpointsService).authorize(endpoint.id, 'wrong')).rejects.toThrow();
  });
});
