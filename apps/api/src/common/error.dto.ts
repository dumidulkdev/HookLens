import { ApiProperty } from '@nestjs/swagger';

export class ApiErrorDto {
  @ApiProperty({ example: 401 }) statusCode!: number;
  @ApiProperty({
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Invalid management credentials',
  })
  message!: string | string[];
  @ApiProperty({ format: 'date-time' }) timestamp!: string;
}
