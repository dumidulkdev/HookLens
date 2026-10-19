import { IsUUID, Matches } from 'class-validator';

export class SubscribeDto {
  @IsUUID() endpointId!: string;
  @Matches(/^[A-Za-z0-9_-]{43}$/) managementToken!: string;
}
