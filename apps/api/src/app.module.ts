import { Module } from '@nestjs/common';
import { ConfigModule } from './config.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { EndpointsModule } from './endpoints/endpoints.module';
import { CapturesModule } from './captures/captures.module';
import { InspectorModule } from './inspector/inspector.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    CommonModule,
    HealthModule,
    EndpointsModule,
    CapturesModule,
    InspectorModule,
  ],
})
export class AppModule {}
