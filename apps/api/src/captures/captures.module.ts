import { Module } from '@nestjs/common';
import { CapturesController } from './captures.controller';
import { CapturesService } from './captures.service';
import { EndpointsModule } from '../endpoints/endpoints.module';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';

@Module({
  imports: [EndpointsModule],
  controllers: [CapturesController, RequestsController],
  providers: [CapturesService, RequestsService],
  exports: [CapturesService],
})
export class CapturesModule {}
