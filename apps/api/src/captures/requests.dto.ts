import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Prisma } from '../generated/prisma/client';

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

export class HistoryQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 10000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @ApiPropertyOptional({ enum: HTTP_METHODS })
  @IsOptional()
  @IsIn(HTTP_METHODS)
  method?: (typeof HTTP_METHODS)[number];
}

export class RequestSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) endpointId!: string;
  @ApiProperty({ enum: HTTP_METHODS }) method!: string;
  @ApiProperty({ type: String, nullable: true, example: 'application/json' }) contentType!:
    string | null;
  @ApiProperty({ format: 'date-time' }) receivedAt!: string;
  @ApiProperty({ type: String, nullable: true }) sourceIp!: string | null;
}

export class RequestDetailDto extends RequestSummaryDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { 'content-type': 'application/json' },
  })
  headers!: Prisma.JsonValue;
  @ApiProperty({ type: 'object', additionalProperties: true, example: { source: 'demo' } })
  query!: Prisma.JsonValue;
  @ApiProperty({
    description: 'Exact wire bytes encoded as Base64',
    example: 'eyJldmVudCI6ImhlbGxvIn0=',
  })
  bodyBase64!: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Strict UTF-8 for readable textual MIME types; null for binary/encoded bodies',
  })
  bodyText!: string | null;
  @ApiProperty({ example: 17 }) bodySize!: number;
}

export class RequestPageDto {
  @ApiProperty({ type: [RequestSummaryDto] }) items!: RequestSummaryDto[];
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 50 }) limit!: number;
  @ApiProperty({ example: 1 }) total!: number;
  @ApiProperty({ example: false }) hasMore!: boolean;
}
