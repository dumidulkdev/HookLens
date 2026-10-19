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
import { io, Socket } from 'socket.io-client';
import { request as httpRequest } from 'node:http';

describe('HookLens integration', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const endpointIds: string[] = [];
  const sockets: Socket[] = [];

  beforeAll(async () => {
    app = await createApp(false);
    await app.listen(0, '127.0.0.1');
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    if (prisma) await prisma.webhookEndpoint.deleteMany({ where: { id: { in: endpointIds } } });
    if (app) await app.close();
  });

  async function createEndpoint(): Promise<CreatedEndpointDto> {
    const result = await request(app.getHttpServer()).post('/api/endpoints').expect(201);
    const endpoint = result.body as CreatedEndpointDto;
    endpointIds.push(endpoint.id);
    return endpoint;
  }

  async function sendRaw(
    path: string,
    chunks: Buffer[],
    headers: Record<string, string>,
  ): Promise<number> {
    const url = `${await app.getUrl()}${path}`;
    return new Promise<number>((resolve, reject) => {
      const outgoing = httpRequest(url, { method: 'POST', headers }, (response) => {
        response.resume();
        response.on('end', () => resolve(response.statusCode ?? 0));
      });
      outgoing.on('error', reject);
      for (const chunk of chunks) outgoing.write(chunk);
      outgoing.end();
    });
  }

  it('returns safe client errors for malformed management JSON and unexpected creation fields', async () => {
    const malformed = await request(app.getHttpServer())
      .post('/api/endpoints')
      .set('Content-Type', 'application/json')
      .send('{invalid')
      .expect(400);
    expect(malformed.body).toMatchObject({
      statusCode: 400,
      message: 'Malformed JSON request body',
    });
    expect(malformed.body).not.toHaveProperty('stack');
    expect(JSON.stringify(malformed.body)).not.toContain('{invalid');
    await request(app.getHttpServer())
      .post('/api/endpoints')
      .send({ unexpected: true })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/endpoints')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ large: 'x'.repeat(17000) }))
      .expect(413);
    const endpoint = await createEndpoint();
    await request(app.getHttpServer()).head(new URL(endpoint.webhookUrl).pathname).expect(405);
    expect(await prisma.capturedRequest.count({ where: { endpointId: endpoint.id } })).toBe(0);
  });

  it('enforces creation and capture rate limits and the configured CORS origin', async () => {
    const previousCapture = process.env.CAPTURE_RATE_LIMIT;
    const previousCreate = process.env.CREATE_RATE_LIMIT;
    process.env.CAPTURE_RATE_LIMIT = '2';
    process.env.CREATE_RATE_LIMIT = '2';
    let limited: NestExpressApplication | undefined;
    try {
      limited = await createApp(false);
      await limited.listen(0, '127.0.0.1');
      const server = request(limited.getHttpServer());
      const first = await server.post('/api/endpoints').expect(201);
      const endpoint = first.body as CreatedEndpointDto;
      endpointIds.push(endpoint.id);
      const second = await server.post('/api/endpoints').expect(201);
      endpointIds.push((second.body as CreatedEndpointDto).id);
      await server.post('/api/endpoints').expect(429).expect('Retry-After', /\d+/);
      const path = new URL(endpoint.webhookUrl).pathname;
      await server
        .post(path)
        .set('Origin', process.env.FRONTEND_ORIGIN!)
        .expect(200)
        .expect('Access-Control-Allow-Origin', process.env.FRONTEND_ORIGIN!);
      const untrusted = await server
        .post(path)
        .set('Origin', 'https://untrusted.example')
        .expect(200);
      expect(untrusted.headers['access-control-allow-origin']).not.toBe(
        'https://untrusted.example',
      );
      await server.post(path).set('X-Forwarded-For', '198.51.100.5').expect(429);
      expect(await prisma.capturedRequest.count({ where: { endpointId: endpoint.id } })).toBe(2);
    } finally {
      if (limited) await limited.close();
      process.env.CAPTURE_RATE_LIMIT = previousCapture;
      process.env.CREATE_RATE_LIMIT = previousCreate;
    }
  });

  it('preserves multipart, compressed, and chunked bytes without interpretation', async () => {
    const endpoint = await createEndpoint();
    const path = new URL(endpoint.webhookUrl).pathname;
    const multipart =
      '--boundary\r\nContent-Disposition: form-data; name="hello"\r\n\r\nworld\r\n--boundary--\r\n';
    await request(app.getHttpServer())
      .post(path)
      .set('Content-Type', 'multipart/form-data; boundary=boundary')
      .send(multipart)
      .expect(200);
    const stored = await prisma.capturedRequest.findFirstOrThrow({
      where: { endpointId: endpoint.id },
    });
    expect(Buffer.from(stored.body).toString()).toBe(multipart);
    const { gzipSync } = await import('node:zlib');
    const compressed = gzipSync(Buffer.from('{"event":"compressed"}'));
    expect(
      await sendRaw(path, [compressed], {
        'Content-Type': 'application/json',
        'Content-Encoding': 'gzip',
      }),
    ).toBe(200);
    const encoded = await prisma.capturedRequest.findFirstOrThrow({
      where: { endpointId: endpoint.id, headers: { path: ['content-encoding'], equals: 'gzip' } },
    });
    expect(Buffer.from(encoded.body)).toEqual(compressed);
    const full = await request(app.getHttpServer())
      .get(`/api/endpoints/${endpoint.id}/requests/${encoded.id}`)
      .set('Authorization', `Bearer ${endpoint.managementToken}`)
      .expect(200);
    expect((full.body as RequestDetailDto).bodyText).toBeNull();
    expect(
      await sendRaw(path, [Buffer.from('chunked '), Buffer.from('bytes')], {
        'Content-Type': 'text/plain',
      }),
    ).toBe(200);
    expect(
      await sendRaw(path, [Buffer.alloc(256 * 1024), Buffer.from('x')], {
        'Content-Type': 'text/plain',
      }),
    ).toBe(413);
  });

  async function connectSocket(): Promise<Socket> {
    const socket = io(`${await app.getUrl()}/inspector`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }

  async function subscribe(
    socket: Socket,
    endpointId: string,
    managementToken: string,
  ): Promise<{ ok: boolean }> {
    return socket
      .timeout(3000)
      .emitWithAck('endpoint:subscribe', { endpointId, managementToken }) as Promise<{
      ok: boolean;
    }>;
  }

  it('authorizes subscriptions and sends captures, clears, and expiration only to the endpoint room', async () => {
    const endpoint = await createEndpoint();
    const other = await createEndpoint();
    const owner = await connectSocket();
    const outsider = await connectSocket();
    const otherOwner = await connectSocket();
    expect(await subscribe(outsider, endpoint.id, 'x'.repeat(43))).toMatchObject({ ok: false });
    expect(await subscribe(owner, endpoint.id, endpoint.managementToken)).toEqual({ ok: true });
    expect(await subscribe(otherOwner, other.id, other.managementToken)).toEqual({ ok: true });
    const leaked: unknown[] = [];
    outsider.on('request:received', (event: unknown) => leaked.push(event));
    otherOwner.on('request:received', (event: unknown) => leaked.push(event));
    const received = new Promise<unknown>((resolve) => owner.once('request:received', resolve));
    await request(app.getHttpServer())
      .post(new URL(endpoint.webhookUrl).pathname)
      .send('private body')
      .expect(200);
    const event = await received;
    expect(event).toMatchObject({ endpointId: endpoint.id, method: 'POST' });
    expect(event).not.toHaveProperty('body');
    const deleted = new Promise<unknown>((resolve) => owner.once('request:deleted', resolve));
    await request(app.getHttpServer())
      .delete(`/api/endpoints/${endpoint.id}/requests`)
      .set('Authorization', `Bearer ${endpoint.managementToken}`)
      .expect(200);
    expect(await deleted).toMatchObject({ endpointId: endpoint.id, cleared: true });
    const expired = new Promise<unknown>((resolve) => owner.once('endpoint:expired', resolve));
    await prisma.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await app.get(ExpirationService).cleanupExpired();
    expect(await expired).toEqual({ endpointId: endpoint.id, reason: 'expired' });
    expect(await subscribe(outsider, endpoint.id, endpoint.managementToken)).toMatchObject({
      ok: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(leaked).toEqual([]);
    owner.disconnect();
    outsider.disconnect();
    otherOwner.disconnect();
  });

  it('rejects malformed subscriptions and untrusted browser origins', async () => {
    const socket = await connectSocket();
    const invalid = (await socket
      .timeout(3000)
      .emitWithAck('endpoint:subscribe', { endpointId: 'bad', managementToken: 'bad' })) as {
      ok: boolean;
    };
    expect(invalid.ok).toBe(false);
    socket.disconnect();
    const rejected = io(`${await app.getUrl()}/inspector`, {
      transports: ['websocket'],
      reconnection: false,
      extraHeaders: { Origin: 'https://untrusted.example' },
    });
    sockets.push(rejected);
    await new Promise<void>((resolve, reject) => {
      rejected.once('connect_error', () => resolve());
      rejected.once('connect', () => reject(new Error('Untrusted origin connected')));
    });
    rejected.disconnect();
  });

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
