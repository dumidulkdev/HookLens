import { Controller, Delete, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ManagementGuard } from '../endpoints/management.guard';
import {
  DeletedRequestsDto,
  HistoryQueryDto,
  RequestDetailDto,
  RequestPageDto,
} from './requests.dto';
import { RequestsService } from './requests.service';
import { ApiErrorDto } from '../common/error.dto';

@ApiTags('Request management')
@ApiResponse({ status: 500, type: ApiErrorDto, description: 'Unexpected service error' })
@ApiBearerAuth('management')
@ApiResponse({ status: 400, description: 'Invalid ID or pagination/filter input' })
@ApiResponse({ status: 401, description: 'Missing or invalid management token' })
@ApiResponse({ status: 404, description: 'Expired endpoint or unknown captured request' })
@UseGuards(ManagementGuard)
@Controller('api/endpoints/:id/requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Delete()
  @ApiOperation({ summary: 'Clear the captured request history' })
  @ApiOkResponse({ type: DeletedRequestsDto })
  clear(@Param('id') id: string): Promise<DeletedRequestsDto> {
    return this.requests.clear(id);
  }

  @Get()
  @ApiOperation({ summary: 'List captured request summaries, newest first' })
  @ApiOkResponse({ type: RequestPageDto })
  history(@Param('id') id: string, @Query() query: HistoryQueryDto): Promise<RequestPageDto> {
    return this.requests.history(id, query);
  }

  @Get(':requestId')
  @ApiOperation({ summary: 'Inspect captured headers, query parameters, and raw body' })
  @ApiOkResponse({ type: RequestDetailDto })
  detail(
    @Param('id') id: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
  ): Promise<RequestDetailDto> {
    return this.requests.detail(id, requestId);
  }
}
