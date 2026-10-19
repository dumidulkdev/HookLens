import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { RequestSummaryDto } from '../captures/requests.dto';

export interface RequestsDeletedEvent {
  endpointId: string;
  requestIds: string[];
  cleared: boolean;
}
export interface EndpointExpiredEvent {
  endpointId: string;
  reason: 'expired' | 'deleted';
}

/** Process-local notifications published only after database transactions commit. */
@Injectable()
export class InspectorEvents extends EventEmitter<{
  'request:received': [RequestSummaryDto];
  'request:deleted': [RequestsDeletedEvent];
  'endpoint:expired': [EndpointExpiredEvent];
}> {}
