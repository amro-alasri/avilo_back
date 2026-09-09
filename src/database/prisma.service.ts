import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../../prisma/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;

  constructor(configService: ConfigService) {
    const connectionString = configService.get<string>('DATABASE_URL');
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
    try {
      // Fix any existing tenants that have empty string domain instead of NULL
      await this.tenant.updateMany({
        where: { domain: '' },
        data: { domain: null },
      });
      // Ensure email_settings JSONB column exists on tenant_settings
      await this.$executeRawUnsafe('ALTER TABLE "tenant_settings" ADD COLUMN IF NOT EXISTS "email_settings" JSONB;');
    } catch (_) {}
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
