import { ApiProperty } from '@nestjs/swagger';

export class CreatedEndpointDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'http://localhost:3000/h/4o6Vde42FmYDoGkTWV6zKA' })
  webhookUrl!: string;

  @ApiProperty({ description: 'Secret bearer token, returned once. Store in sessionStorage only.' })
  managementToken!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;
}
