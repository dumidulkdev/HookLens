import { Module } from '@nestjs/common';
import { EndpointsController } from './endpoints.controller';
import { EndpointsService } from './endpoints.service';
import { ManagementGuard } from './management.guard';
import { ExpirationService } from './expiration.service';

@Module({
  controllers: [EndpointsController],
  providers: [EndpointsService, ManagementGuard, ExpirationService],
  exports: [EndpointsService, ManagementGuard],
})
export class EndpointsModule {}
