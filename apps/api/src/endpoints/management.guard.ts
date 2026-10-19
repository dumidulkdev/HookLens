import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { Request, Response } from 'express';
import { EndpointsService } from './endpoints.service';

@Injectable()
export class ManagementGuard implements CanActivate {
  constructor(private readonly endpoints: EndpointsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    context.switchToHttp().getResponse<Response>().setHeader('Cache-Control', 'no-store');
    const id = request.params.id;
    if (typeof id !== 'string' || !isUUID(id)) throw new BadRequestException('Invalid endpoint ID');
    const authorization = request.headers.authorization;
    if (!authorization || !/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization)) {
      throw new UnauthorizedException('A management bearer token is required');
    }
    await this.endpoints.authorize(id, authorization.slice(7));
    return true;
  }
}
