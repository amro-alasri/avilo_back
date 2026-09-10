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

  const configService = app.get(ConfigService);
  const frontendUrl = configService.get<string>('FRONTEND_URL', 'http://localhost:4444');

  await app.register(helmet, {
    hidePoweredBy: true,
    frameguard: { action: 'deny' },
    xssFilter: true,
    noSniff: true,
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
    origin: (origin, callback) => {
      // Allow requests with no origin (such as mobile apps or internal curl requests)
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        frontendUrl,
        'http://localhost:4444',
        'http://localhost:3000',
        'http://127.0.0.1:4444',
        'http://127.0.0.1:3000',
      ];

      const isAllowed = allowedOrigins.some((allowed) => allowed && (origin === allowed || origin.startsWith(allowed)));
      if (isAllowed || process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      return callback(new Error('Blocked by CORS policy'), false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: false,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
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
