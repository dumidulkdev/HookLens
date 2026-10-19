import { Prisma } from '../generated/prisma/client';
import { RequestSummaryDto } from './requests.dto';

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
