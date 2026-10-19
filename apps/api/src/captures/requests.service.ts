import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { readableBody } from './body-text';
import {
  HistoryQueryDto,
  RequestDetailDto,
  RequestPageDto,
  RequestSummaryDto,
} from './requests.dto';

export const SUMMARY_SELECT = {
  id: true,
  endpointId: true,
  method: true,
  contentType: true,
  receivedAt: true,
  sourceIp: true,
} as const;
export function toSummary(
  row: Prisma.CapturedRequestGetPayload<{ select: typeof SUMMARY_SELECT }>,
): RequestSummaryDto {
  return {
    id: row.id,
    endpointId: row.endpointId,
    method: row.method,
    contentType: row.contentType,
    sourceIp: row.sourceIp,
    receivedAt: row.receivedAt.toISOString(),
  };
}

@Injectable()
export class RequestsService {
  constructor(private readonly prisma: PrismaService) {}

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
