import { Controller, Header, Post, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { CreatedEndpointDto } from './endpoints.dto';
import { EndpointsService } from './endpoints.service';

@ApiTags('Endpoints')
@Controller('api/endpoints')
export class EndpointsController {
  constructor(private readonly endpoints: EndpointsService) {}

  @Post()
  @Header('Cache-Control', 'no-store')
  @UseGuards(RateLimitGuard)
  @ApiOperation({
    summary: 'Create a temporary webhook inbox. The management token is returned only once.',
  })
  @ApiCreatedResponse({ type: CreatedEndpointDto })
  @ApiResponse({ status: 429, description: 'Creation rate limit exceeded' })
  create(): Promise<CreatedEndpointDto> {
    return this.endpoints.create();
  }
}
