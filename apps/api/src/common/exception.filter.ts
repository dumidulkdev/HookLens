import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    let message: string | string[] = 'Internal server error';
    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      message = typeof body === 'string' ? body : (body as { message: string | string[] }).message;
    } else {
      // Deliberately omit exception messages, URLs, headers, and bodies: drivers may include secrets.
      this.logger.error('Unhandled request failure');
    }
    response
      .status(status)
      .json({ statusCode: status, message, timestamp: new Date().toISOString() });
  }
}
