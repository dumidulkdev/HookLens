import { Global, Module } from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard';
import { InspectorEvents } from './inspector-events';

@Global()
@Module({
  providers: [RateLimitGuard, InspectorEvents],
  exports: [RateLimitGuard, InspectorEvents],
})
export class CommonModule {}
