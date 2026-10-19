import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InspectorEvents } from '../common/inspector-events';

export const CLEANUP_INTERVAL_MS = 60_000;

@Injectable()
export class ExpirationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExpirationService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: InspectorEvents,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.cleanupExpired().catch(() => this.logger.error('Endpoint cleanup failed'));
    }, CLEANUP_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  async cleanupExpired(): Promise<string[]> {
    if (this.running) return [];
    this.running = true;
    try {
      const deleted = await this.prisma.$queryRaw<Array<{ id: string }>>`
        DELETE FROM "WebhookEndpoint" WHERE "expiresAt" <= clock_timestamp() RETURNING "id"
      `;
      for (const row of deleted)
        this.events.emit('endpoint:expired', { endpointId: row.id, reason: 'expired' });
      return deleted.map((row) => row.id);
    } finally {
      this.running = false;
    }
  }
}
