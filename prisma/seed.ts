import { PrismaClient } from './generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as argon2 from 'argon2';
import * as dotenv from 'dotenv';

dotenv.config();

export async function seedSuperAdmin(existingPrisma?: any) {
  let prisma = existingPrisma;
  let pool: Pool | null = null;

  if (!prisma) {
    const connectionString = process.env.DATABASE_URL;
    pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
  }

  const superAdminEmail = (process.env.SUPERADMIN_EMAIL || 'superadmin@avilo.com').trim().toLowerCase();
  const rawPassword = process.env.SUPERADMIN_PASSWORD || 'superadmin123';
  const firstName = process.env.SUPERADMIN_FIRST_NAME || 'System';
  const lastName = process.env.SUPERADMIN_LAST_NAME || 'Admin';

  try {
    // 1. Create or ensure the System Tenant
    const systemTenant = await prisma.tenant.upsert({
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

    console.log(`[Seed] System Tenant ID: ${systemTenant.id}`);

    // 2. Create or ensure the SuperAdmin Role
    const superAdminRole = await prisma.role.upsert({
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

    console.log(`[Seed] SuperAdmin Role ID: ${superAdminRole.id}`);

    // 3. Create or ensure the SuperAdmin User
    const hashedPassword = await argon2.hash(rawPassword);

    const superAdmin = await prisma.user.upsert({
      where: { email_tenantId: { email: superAdminEmail, tenantId: systemTenant.id } },
      update: {
        password: hashedPassword,
        status: 'active',
        firstName,
        lastName,
      },
      create: {
        tenantId: systemTenant.id,
        email: superAdminEmail,
        password: hashedPassword,
        firstName,
        lastName,
        status: 'active',
      },
    });

    // 4. Ensure the role is assigned to the user
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: superAdmin.id, roleId: superAdminRole.id } },
      update: {},
      create: {
        userId: superAdmin.id,
        roleId: superAdminRole.id,
      },
    });

    console.log('----------------------------------------------------');
    console.log('[Seed] SuperAdmin workspace provisioned successfully:');
    console.log(`  Tenant Slug : system`);
    console.log(`  Email       : ${superAdminEmail}`);
    console.log(`  Password    : ${rawPassword}`);
    console.log('----------------------------------------------------');

    return { systemTenant, superAdminRole, superAdmin };
  } catch (error) {
    console.error('[Seed] Error seeding SuperAdmin:', error);
    throw error;
  } finally {
    if (pool) {
      await prisma.$disconnect();
      await pool.end();
    }
  }
}

// Execute when run directly via CLI
if (process.argv[1]?.includes('seed')) {
  seedSuperAdmin()
    .then(() => {
      console.log('[Seed] Database initialization complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Seed] Fatal error during seed execution:', err);
      process.exit(1);
    });
}
