import { HttpException } from '@nestjs/common';
import { json, NextFunction, Request, Response } from 'express';

const parser = json({ limit: '16kb' });

/** Normalize parser failures before Nest can include a JSON payload excerpt in an error. */
export function managementBody(request: Request, response: Response, next: NextFunction): void {
  parser(request, response, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    const type = error instanceof Error && 'type' in error ? error.type : undefined;
    if (type === 'entity.too.large')
      next(new HttpException('Management request body exceeds 16 KiB', 413));
    else if (type === 'encoding.unsupported' || type === 'charset.unsupported')
      next(new HttpException('Unsupported request encoding', 415));
    else next(new HttpException('Malformed JSON request body', 400));
  });
}
