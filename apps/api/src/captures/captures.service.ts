import { Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';

export const CAPTURE_RETENTION = 100;

@Injectable()
export class CapturesService {
  constructor(private readonly prisma: PrismaService) {}

  async capture(slug: string, request: Request): Promise<void> {
    if (!/^[A-Za-z0-9_-]{22}$/.test(slug)) throw new NotFoundException('Endpoint not found');
    const body = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
    const query: Record<string, string | string[]> = {};
    for (const [key, value] of new URL(request.originalUrl, 'http://internal').searchParams) {
      // Define own properties so keys such as __proto__ remain harmless data.
      const previous = Object.hasOwn(query, key) ? query[key] : undefined;
      Object.defineProperty(query, key, {
        value:
          previous === undefined
            ? value
            : [...(Array.isArray(previous) ? previous : [previous]), value],
        enumerable: true,
        configurable: true,
      });
    }
    const headers: Record<string, string | string[]> = {};
    for (const [key, value] of Object.entries(request.headers)) {
      if (value !== undefined) Object.defineProperty(headers, key, { value, enumerable: true });
    }
    await this.prisma.$transaction(async (tx) => {
      // Serialize insertion and pruning per endpoint. No network calls occur under this lock.
      const [endpoint] = await tx.$queryRaw<Array<{ id: string; expiresAt: Date }>>`
        SELECT "id", "expiresAt" FROM "WebhookEndpoint" WHERE "slug" = ${slug} FOR UPDATE
      `;
      if (!endpoint || endpoint.expiresAt.getTime() <= Date.now())
        throw new NotFoundException('Endpoint not found');
      await tx.capturedRequest.create({
        data: {
          endpointId: endpoint.id,
          method: request.method,
          headers,
          query,
          body: Uint8Array.from(body),
          contentType: request.headers['content-type'] ?? null,
          sourceIp: request.socket.remoteAddress ?? null,
        },
      });
      const oldest = await tx.capturedRequest.findMany({
        where: { endpointId: endpoint.id },
        orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
        skip: CAPTURE_RETENTION,
        select: { id: true },
      });
      if (oldest.length)
        await tx.capturedRequest.deleteMany({
          where: { id: { in: oldest.map((capture) => capture.id) } },
        });
    });
  }
}
