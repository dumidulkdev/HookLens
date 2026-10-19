import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from './config';
import { createApp } from './create-app';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = app.get<AppConfig>(APP_CONFIG);
  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
}

void bootstrap().catch(() => {
  Logger.error('Startup failed. Check configuration and database connectivity.', 'Bootstrap');
  process.exitCode = 1;
});
