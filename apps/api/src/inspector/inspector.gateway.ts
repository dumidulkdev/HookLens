import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { Namespace, Socket } from 'socket.io';
import { RequestSummaryDto } from '../captures/requests.dto';
import {
  EndpointExpiredEvent,
  InspectorEvents,
  RequestsDeletedEvent,
} from '../common/inspector-events';
import { EndpointsService } from '../endpoints/endpoints.service';
import { SubscribeDto } from './subscribe.dto';

@WebSocketGateway({ namespace: '/inspector', transports: ['websocket'] })
export class InspectorGateway implements OnModuleInit, OnModuleDestroy {
  @WebSocketServer() private server!: Namespace;
  private readonly logger = new Logger(InspectorGateway.name);
  private readonly attempts = new WeakMap<Socket, { count: number; resetAt: number }>();

  constructor(
    private readonly endpoints: EndpointsService,
    private readonly events: InspectorEvents,
  ) {}

  private readonly received = (event: RequestSummaryDto): void => {
    this.server.to(this.room(event.endpointId)).emit('request:received', event);
  };
  private readonly deleted = (event: RequestsDeletedEvent): void => {
    this.server.to(this.room(event.endpointId)).emit('request:deleted', event);
  };
  private readonly expired = (event: EndpointExpiredEvent): void => {
    const room = this.room(event.endpointId);
    this.server.to(room).emit('endpoint:expired', event);
    this.server.in(room).socketsLeave(room);
  };

  onModuleInit(): void {
    this.events.on('request:received', this.received);
    this.events.on('request:deleted', this.deleted);
    this.events.on('endpoint:expired', this.expired);
  }
  onModuleDestroy(): void {
    this.events.off('request:received', this.received);
    this.events.off('request:deleted', this.deleted);
    this.events.off('endpoint:expired', this.expired);
  }

  @SubscribeMessage('endpoint:subscribe')
  async subscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() input: unknown,
  ): Promise<{ ok: boolean; error?: string }> {
    const now = Date.now();
    let bucket = this.attempts.get(client);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + 60000 };
      this.attempts.set(client, bucket);
    }
    if (++bucket.count > 30) return { ok: false, error: 'Too many subscription attempts' };
    if (!input || typeof input !== 'object' || Array.isArray(input))
      return { ok: false, error: 'Invalid subscription' };
    const dto = plainToInstance(SubscribeDto, input);
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    if (errors.length) return { ok: false, error: 'Invalid subscription' };
    try {
      await this.endpoints.authorize(dto.endpointId, dto.managementToken);
    } catch (error) {
      if (!(error instanceof Error) || !('getStatus' in error))
        this.logger.error('Subscription authorization failed');
      return { ok: false, error: 'Invalid or expired management credentials' };
    }
    for (const room of client.rooms) {
      if (room !== client.id) await client.leave(room);
    }
    await client.join(this.room(dto.endpointId));
    return { ok: true };
  }

  private room(id: string): string {
    return `endpoint:${id}`;
  }
}
