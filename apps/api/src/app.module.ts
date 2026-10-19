import { Module } from '@nestjs/common';
import { APP_CONFIG, loadConfig } from './config';
import { HealthModule } from './health/health.module';

@Module({
  imports: [HealthModule],
  providers: [{ provide: APP_CONFIG, useFactory: loadConfig }],
  exports: [APP_CONFIG],
})
export class AppModule {}
