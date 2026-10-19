import { Module } from '@nestjs/common';
import { EndpointsController } from './endpoints.controller';
import { EndpointsService } from './endpoints.service';
import { ManagementGuard } from './management.guard';

@Module({
  controllers: [EndpointsController],
  providers: [EndpointsService, ManagementGuard],
  exports: [EndpointsService, ManagementGuard],
})
export class EndpointsModule {}
