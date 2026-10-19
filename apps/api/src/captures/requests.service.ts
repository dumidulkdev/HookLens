import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InspectorEvents } from '../common/inspector-events';
import { SUMMARY_SELECT, toSummary } from './request-summary';
import { readableBody } from './body-text';
import { HistoryQueryDto, RequestDetailDto, RequestPageDto } from './requests.dto';

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: InspectorEvents,
  ) {}

  async clear(endpointId: string): Promise<{ deleted: number }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const [endpoint] = await tx.$queryRaw<
        Array<{ expiresAt: Date }>
      >`SELECT "expiresAt" FROM "WebhookEndpoint" WHERE "id" = ${endpointId}::uuid FOR UPDATE`;
      if (!endpoint || endpoint.expiresAt.getTime() <= Date.now())
        throw new NotFoundException('Endpoint expired');
      const result = await tx.capturedRequest.deleteMany({ where: { endpointId } });
      return { deleted: result.count };
    });
    this.events.emit('request:deleted', { endpointId, requestIds: [], cleared: true });
    return result;
  }

  async history(endpointId: string, query: HistoryQueryDto): Promise<RequestPageDto> {
    const where = { endpointId, method: query.method };
    const [rows, total] = await this.prisma.$transaction(
      [
        this.prisma.capturedRequest.findMany({
          where,
          select: SUMMARY_SELECT,
          orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        this.prisma.capturedRequest.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: rows.map(toSummary),
      page: query.page,
      limit: query.limit,
      total,
      hasMore: query.page * query.limit < total,
    };
  }

  async detail(endpointId: string, id: string): Promise<RequestDetailDto> {
    const row = await this.prisma.capturedRequest.findFirst({ where: { endpointId, id } });
    if (!row) throw new NotFoundException('Captured request not found');
    const encoding =
      row.headers && typeof row.headers === 'object' && !Array.isArray(row.headers)
        ? row.headers['content-encoding']
        : undefined;
    return {
      ...toSummary(row),
      headers: row.headers,
      query: row.query,
      bodyBase64: Buffer.from(row.body).toString('base64'),
      bodyText: readableBody(
        row.body,
        row.contentType,
        typeof encoding === 'string' ? encoding : undefined,
      ),
      bodySize: row.body.byteLength,
    };
  }
}
