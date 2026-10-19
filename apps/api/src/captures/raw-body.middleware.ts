import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

export const BODY_LIMIT_BYTES = 256 * 1024;

/** Read the wire bytes without parsing, decompressing, or trusting Content-Type. */
export function captureRawBody(request: Request, _response: Response, next: NextFunction): void {
  let size = 0;
  let finished = false;
  const chunks: Buffer[] = [];
  const fail = (error: Error): void => {
    if (finished) return;
    finished = true;
    chunks.length = 0;
    next(error);
  };
  request.on('data', (chunk: Buffer) => {
    if (finished) return;
    size += chunk.length;
    if (size > BODY_LIMIT_BYTES) {
      fail(new PayloadTooLargeException('Body exceeds the 256 KiB limit'));
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', () => {
    if (finished) return;
    finished = true;
    request.body = Buffer.concat(chunks, size);
    next();
  });
  request.on('error', () => fail(new BadRequestException('Unable to read request body')));
  request.on('aborted', () => fail(new BadRequestException('Request upload aborted')));
}
