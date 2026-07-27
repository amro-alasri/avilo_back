import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './database/prisma.service.js';
import helmet from '@fastify/helmet';
import fastifyMultipart from '@fastify/multipart';
import { GlobalExceptionFilter } from './core/filters/global-exception.filter.js';

async function bootstrap() {
  const adapter = new FastifyAdapter({ logger: false });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, { bufferLogs: true });
  const logger = new Logger('Bootstrap');

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: [`'self'`],
        styleSrc: [`'self'`, `'unsafe-inline'`],
        imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
        scriptSrc: [`'self'`, `https: 'unsafe-inline'`],
      },
    },
  });

  await app.register(fastifyMultipart);

  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new GlobalExceptionFilter());

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 5500);

  const dbUrl = configService.get<string>('DATABASE_URL', '');
  let dbName = 'unknown';
  let dbHost = 'unknown';
  let dbConnectionStatus = false;

  try {
    const match = dbUrl.match(/postgresql:\/\/[^@]+@([^/]+)\/([^?]+)/);
    if (match) {
      dbHost = match[1];
      dbName = match[2];
    }
  } catch (_) {}

  try {
    const prisma = app.get(PrismaService);
    await prisma.$queryRaw`SELECT 1`;
    dbConnectionStatus = true;
  } catch (_) {
    dbConnectionStatus = false;
  }

  await app.listen(port, '0.0.0.0');

  const dbStatus = dbConnectionStatus ? 'Connected ✔' : 'Failed to connect ✘';
  const asciiLine = '======================================================';
  logger.log(asciiLine);
  logger.log(`🚀 Avilo SaaS Backend started successfully on port: ${port}`);
  logger.log(`🌐 Server URL        : http://localhost:${port}`);
  logger.log(`🗄️ Database Name     : ${dbName}`);
  logger.log(`🔗 Database Host     : ${dbHost}`);
  logger.log(`🔌 DB Connection     : ${dbStatus}`);
  logger.log(`📅 Started At        : ${new Date().toLocaleString('en-US')}`);
  logger.log(`🔑 Environment       : ${process.env.NODE_ENV || 'development'}`);
  logger.log(asciiLine);
}

bootstrap();
