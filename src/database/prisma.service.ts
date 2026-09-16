import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '../../prisma/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
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
      // Automatically guarantee default SuperAdmin in production & dev
      await this.ensureDefaultSuperAdmin();
    } catch (e: any) {
      this.logger.warn(`[Bootstrap] Initialization notice: ${e.message}`);
    }
  }

  private async ensureDefaultSuperAdmin() {
    const superAdminEmail = (process.env.SUPERADMIN_EMAIL || 'superadmin@avilo.com').trim().toLowerCase();
    const rawPassword = process.env.SUPERADMIN_PASSWORD || 'superadmin123';

    // 1. Ensure System Tenant exists
    const systemTenant = await this.tenant.upsert({
      where: { slug: 'system' },
      update: {},
      create: {
        name: 'Avilo System',
        slug: 'system',
        status: 'active',
        plan: 'enterprise',
        contactEmail: superAdminEmail,
      },
    });

    // 2. Ensure SuperAdmin Role exists
    const superAdminRole = await this.role.upsert({
      where: { name_tenantId: { name: 'SuperAdmin', tenantId: systemTenant.id } },
      update: {
        permissions: ['system_admin', 'manage_tenants', 'manage_subscriptions', 'full_access'],
      },
      create: {
        tenantId: systemTenant.id,
        name: 'SuperAdmin',
        description: 'System Administrator with full access to manage all tenants and companies',
        permissions: ['system_admin', 'manage_tenants', 'manage_subscriptions', 'full_access'],
      },
    });

    // 3. Check if SuperAdmin User exists
    const existingUser = await this.user.findFirst({
      where: { email: superAdminEmail, tenantId: systemTenant.id },
    });

    if (!existingUser) {
      const hashedPassword = await argon2.hash(rawPassword);
      const newUser = await this.user.create({
        data: {
          tenantId: systemTenant.id,
          email: superAdminEmail,
          password: hashedPassword,
          firstName: process.env.SUPERADMIN_FIRST_NAME || 'System',
          lastName: process.env.SUPERADMIN_LAST_NAME || 'Admin',
          status: 'active',
        },
      });

      await this.userRole.upsert({
        where: { userId_roleId: { userId: newUser.id, roleId: superAdminRole.id } },
        update: {},
        create: {
          userId: newUser.id,
          roleId: superAdminRole.id,
        },
      });

      this.logger.log(`[Bootstrap] Default SuperAdmin [${superAdminEmail}] successfully initialized.`);
    } else {
      // Ensure user_role linkage exists
      await this.userRole.upsert({
        where: { userId_roleId: { userId: existingUser.id, roleId: superAdminRole.id } },
        update: {},
        create: {
          userId: existingUser.id,
          roleId: superAdminRole.id,
        },
      });
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }
}
