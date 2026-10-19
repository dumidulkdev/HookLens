import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Header,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { CreatedEndpointDto } from './endpoints.dto';
import { EndpointsService } from './endpoints.service';
import { ManagementGuard } from './management.guard';
import { ApiErrorDto } from '../common/error.dto';

@ApiTags('Endpoints')
@ApiResponse({
  status: 400,
  type: ApiErrorDto,
  description: 'Invalid ID, malformed JSON, or unexpected input fields',
})
@ApiResponse({ status: 413, type: ApiErrorDto, description: 'Management JSON exceeds 16 KiB' })
@ApiResponse({
  status: 500,
  type: ApiErrorDto,
  description: 'Unexpected service error; no internal details are returned',
})
@Controller('api/endpoints')
export class EndpointsController {
  constructor(private readonly endpoints: EndpointsService) {}

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(ManagementGuard)
  @ApiBearerAuth('management')
  @ApiOperation({ summary: 'Delete the endpoint and all its captures' })
  @ApiNoContentResponse()
  @ApiResponse({ status: 401, description: 'Missing or invalid management token' })
  @ApiResponse({ status: 404, description: 'Expired endpoint' })
  remove(@Param('id') id: string): Promise<void> {
    return this.endpoints.remove(id);
  }

  @Post()
  @Header('Cache-Control', 'no-store')
  @UseGuards(RateLimitGuard)
  @ApiOperation({
    summary: 'Create a temporary webhook inbox. The management token is returned only once.',
  })
  @ApiCreatedResponse({ type: CreatedEndpointDto })
  @ApiResponse({ status: 429, description: 'Creation rate limit exceeded' })
  create(@Body() input: unknown): Promise<CreatedEndpointDto> {
    if (
      input !== undefined &&
      (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length)
    )
      throw new BadRequestException('Endpoint creation does not accept input fields');
    return this.endpoints.create();
  }
}
