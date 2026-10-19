import {
  Controller,
  Header,
  HttpCode,
  Param,
  Req,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  UseGuards,
  HttpException,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { CapturesService } from './captures.service';
import { HTTP_METHODS } from './requests.dto';
import { ApiErrorDto } from '../common/error.dto';

@ApiTags('Public capture')
@ApiResponse({
  status: 405,
  type: ApiErrorDto,
  description: 'Unsupported method (HEAD is not captured)',
})
@ApiResponse({ status: 500, type: ApiErrorDto, description: 'Capture could not be persisted' })
@ApiOkResponse({ schema: { example: { received: true } } })
@ApiResponse({ status: 404, description: 'Unknown or expired endpoint' })
@ApiResponse({ status: 413, description: 'Payload exceeds 256 KiB' })
@ApiResponse({ status: 429, description: 'Capture rate limit exceeded' })
@UseGuards(RateLimitGuard)
@Controller('h')
export class CapturesController {
  constructor(private readonly captures: CapturesService) {}

  @Get(':slug')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Capture a GET webhook' })
  get(@Param('slug') slug: string, @Req() request: Request) {
    return this.store(slug, request);
  }

  @Put(':slug')
  @ApiBody({
    required: false,
    description: 'Uninterpreted wire bytes, up to 256 KiB',
    schema: { type: 'string', format: 'binary' },
  })
  @Header('Cache-Control', 'no-store')
  put(@Param('slug') slug: string, @Req() request: Request) {
    return this.store(slug, request);
  }

  @Patch(':slug')
  @ApiBody({
    required: false,
    description: 'Uninterpreted wire bytes, up to 256 KiB',
    schema: { type: 'string', format: 'binary' },
  })
  @Header('Cache-Control', 'no-store')
  patch(@Param('slug') slug: string, @Req() request: Request) {
    return this.store(slug, request);
  }

  @Delete(':slug')
  @ApiBody({
    required: false,
    description: 'Uninterpreted wire bytes, up to 256 KiB',
    schema: { type: 'string', format: 'binary' },
  })
  @Header('Cache-Control', 'no-store')
  delete(@Param('slug') slug: string, @Req() request: Request) {
    return this.store(slug, request);
  }

  @Post(':slug')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Capture a GET, POST, PUT, PATCH, or DELETE webhook (maximum 256 KiB)' })
  @ApiBody({ required: false, schema: { type: 'string', format: 'binary' } })
  @ApiOkResponse({ schema: { example: { received: true } } })
  @ApiResponse({ status: 404, description: 'Unknown or expired endpoint' })
  @ApiResponse({ status: 413, description: 'Payload exceeds 256 KiB' })
  @ApiResponse({ status: 429, description: 'Capture rate limit exceeded' })
  post(@Param('slug') slug: string, @Req() request: Request) {
    return this.store(slug, request);
  }

  private async store(slug: string, request: Request): Promise<{ received: true }> {
    if (!(HTTP_METHODS as readonly string[]).includes(request.method))
      throw new HttpException('Unsupported capture method', 405);
    await this.captures.capture(slug, request);
    return { received: true };
  }
}
