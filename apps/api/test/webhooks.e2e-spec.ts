import 'reflect-metadata';
import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createApp } from '../src/create-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { CreatedEndpointDto } from '../src/endpoints/endpoints.dto';
import { hashToken } from '../src/endpoints/token';
import { EndpointsService } from '../src/endpoints/endpoints.service';

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
