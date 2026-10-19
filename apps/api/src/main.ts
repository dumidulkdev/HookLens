import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from './config';
import { createApp } from './create-app';

function safeStartupDetail(error: unknown): string {
  const detail = error instanceof Error ? error.message : 'Unknown startup failure';
  let safeDetail = detail.replace(/postgres(?:ql)?:\/\/[^\s@/]+@/gi, 'postgresql://[redacted]@');
  const password = process.env.POSTGRES_PASSWORD;
  if (password) {
    safeDetail = safeDetail.replaceAll(password, '[redacted]');
    try {
      const encoded = new URL('postgresql://localhost');
      encoded.password = password;
      if (encoded.password !== password)
        safeDetail = safeDetail.replaceAll(encoded.password, '[redacted]');
    } catch {
      // Preserve the original startup error if URL parsing is unavailable.
    }
  }
  return safeDetail;
}

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = app.get<AppConfig>(APP_CONFIG);
  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
  Logger.log(`[API] [READY] Listening at ${config.publicBaseUrl}`, 'Startup');
}

void bootstrap().catch((error: unknown) => {
  const name = error instanceof Error ? error.name : 'UnknownError';
  Logger.error(`[API] [ERROR] Startup failed (${name}): ${safeStartupDetail(error)}`, 'Bootstrap');
  process.exitCode = 1;
});
