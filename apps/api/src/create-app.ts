import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/exception.filter';
import { APP_CONFIG, AppConfig } from './config';
import { json } from 'express';
import { captureRawBody } from './captures/raw-body.middleware';

export async function createApp(logging = true): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: logging ? ['log', 'warn', 'error'] : false,
  });
  const config = app.get<AppConfig>(APP_CONFIG);
  app.set('trust proxy', false);
  app.disable('x-powered-by');
  app.use('/h', captureRawBody);
  app.use('/api', json({ limit: '16kb' }));
  app.enableCors({
    origin: config.frontendOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  const swaggerConfig = new DocumentBuilder()
    .setTitle('HookLens')
    .setVersion('1.0')
    .addBearerAuth(undefined, 'management')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  return app;
}
