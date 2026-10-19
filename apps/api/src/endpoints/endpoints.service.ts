import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { APP_CONFIG, AppConfig } from '../config';
import { PrismaService } from '../prisma/prisma.service';
import { CreatedEndpointDto } from './endpoints.dto';
import { hashToken, verifyToken } from './token';
import { InspectorEvents } from '../common/inspector-events';

export const ENDPOINT_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class EndpointsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly events: InspectorEvents,
  ) {}

  async create(): Promise<CreatedEndpointDto> {
    const slug = randomBytes(16).toString('base64url');
    const managementToken = randomBytes(32).toString('base64url');
    const endpoint = await this.prisma.webhookEndpoint.create({
      data: {
        slug,
        managementTokenHash: hashToken(managementToken),
        expiresAt: new Date(Date.now() + ENDPOINT_TTL_MS),
      },
      select: { id: true, expiresAt: true },
    });
    return {
      id: endpoint.id,
      webhookUrl: `${this.config.publicBaseUrl}/h/${slug}`,
      managementToken,
      expiresAt: endpoint.expiresAt.toISOString(),
    };
  }

  async authorize(id: string, token: string): Promise<void> {
    const endpoint = await this.prisma.webhookEndpoint.findUnique({ where: { id } });
    const matches = verifyToken(token, endpoint?.managementTokenHash ?? '0'.repeat(64));
    if (!endpoint || !matches) throw new UnauthorizedException('Invalid management credentials');
    if (endpoint.expiresAt.getTime() <= Date.now()) throw new NotFoundException('Endpoint expired');
  }

  async remove(id: string): Promise<void> {
    const result = await this.prisma.webhookEndpoint.deleteMany({
      where: { id, expiresAt: { gt: new Date() } },
    });
    if (!result.count) throw new NotFoundException('Endpoint not found');
    this.events.emit('endpoint:expired', { endpointId: id, reason: 'deleted' });
  }
}
