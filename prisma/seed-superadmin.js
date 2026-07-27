const { PrismaClient } = require('./generated/prisma/index.js');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const argon2 = require('argon2');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function seedSuperAdmin() {
  try {
    // 1. Create a System Tenant
    const systemTenant = await prisma.tenant.upsert({
      where: { slug: 'system' },
      update: {},
      create: {
        name: 'Avilo System',
        slug: 'system',
        status: 'active',
        plan: 'enterprise'
      }
    });

    console.log('System Tenant ID:', systemTenant.id);

    // 2. Create a Super Admin Role
    const superAdminRole = await prisma.role.upsert({
      where: { name_tenantId: { name: 'SuperAdmin', tenantId: systemTenant.id } },
      update: {},
      create: {
        tenantId: systemTenant.id,
        name: 'SuperAdmin',
        description: 'System Administrator with full access to manage all tenants and companies',
        permissions: ['system_admin', 'manage_tenants', 'manage_subscriptions']
      }
    });

    console.log('Super Admin Role ID:', superAdminRole.id);

    // 3. Create Super Admin User
    const hashedPassword = await argon2.hash('superadmin123');
    const superAdminEmail = 'superadmin@avilo.com';

    const superAdmin = await prisma.user.upsert({
      where: { email_tenantId: { email: superAdminEmail, tenantId: systemTenant.id } },
      update: {
        password: hashedPassword
      },
      create: {
        tenantId: systemTenant.id,
        email: superAdminEmail,
        password: hashedPassword,
        firstName: 'System',
        lastName: 'Admin',
        status: 'active',
      }
    });

    // Ensure the role is assigned
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: superAdmin.id, roleId: superAdminRole.id } },
      update: {},
      create: {
        userId: superAdmin.id,
        roleId: superAdminRole.id
      }
    });

    console.log('Super Admin User created/updated successfully!');
    console.log(`Email: ${superAdminEmail}`);
    console.log(`Password: superadmin123`);
    console.log(`Tenant Slug: system`);

  } catch (error) {
    console.error('Error seeding superadmin:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

seedSuperAdmin();
