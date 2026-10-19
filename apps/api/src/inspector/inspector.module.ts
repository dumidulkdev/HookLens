import { Module } from '@nestjs/common';
import { EndpointsModule } from '../endpoints/endpoints.module';
import { InspectorGateway } from './inspector.gateway';

@Module({ imports: [EndpointsModule], providers: [InspectorGateway] })
export class InspectorModule {}
