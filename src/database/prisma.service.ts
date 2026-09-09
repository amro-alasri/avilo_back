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
      // Ensure EmployeeStatus enum has suspended and rejected values
      await this.$executeRawUnsafe('ALTER TYPE "EmployeeStatus" ADD VALUE IF NOT EXISTS \'suspended\';');
      await this.$executeRawUnsafe('ALTER TYPE "EmployeeStatus" ADD VALUE IF NOT EXISTS \'rejected\';');

      // Ensure new Tenant columns exist
      await this.$executeRawUnsafe('ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "contact_email" TEXT;');
      await this.$executeRawUnsafe('ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "contact_phone" TEXT;');

      // Ensure new Subscription columns exist
      await this.$executeRawUnsafe('ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "price" DOUBLE PRECISION DEFAULT 0;');
      await this.$executeRawUnsafe('ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "currency" TEXT DEFAULT \'USD\';');
      await this.$executeRawUnsafe('ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "max_employees" INTEGER DEFAULT 10;');
      await this.$executeRawUnsafe('ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "max_locations" INTEGER DEFAULT 1;');
      await this.$executeRawUnsafe('ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "has_payroll" BOOLEAN DEFAULT true;');
      await this.$executeRawUnsafe('ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "has_leaves" BOOLEAN DEFAULT true;');
      await this.$executeRawUnsafe('ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "has_voice_biometrics" BOOLEAN DEFAULT false;');
      await this.$executeRawUnsafe('ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "has_face_biometrics" BOOLEAN DEFAULT false;');
      await this.$executeRawUnsafe('ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "features" JSONB;');
    } catch (_) {}
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
