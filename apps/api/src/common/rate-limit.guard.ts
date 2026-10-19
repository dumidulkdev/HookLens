import { CanActivate, ExecutionContext, HttpException, Inject, Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import { APP_CONFIG, AppConfig } from '../config';

const WINDOW_MS = 60_000;
const MAX_BUCKETS = 10_000;

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const capture = request.path.startsWith('/h/');
    const limit = capture ? this.config.captureRateLimit : this.config.createRateLimit;
    const key = `${capture ? 'capture' : 'create'}:${request.socket.remoteAddress ?? 'unknown'}`;
    const now = Date.now();
    for (const [id, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(id);
    }
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= MAX_BUCKETS)
        throw new HttpException('Rate limit capacity reached', 429);
      bucket = { count: 0, resetAt: now + WINDOW_MS };
      this.buckets.set(key, bucket);
    }
    bucket.count++;
    if (bucket.count > limit) {
      response.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      throw new HttpException('Too many requests; try again later', 429);
    }
    return true;
  }
}
