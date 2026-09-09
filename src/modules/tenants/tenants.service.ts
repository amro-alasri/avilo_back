import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import * as argon2 from 'argon2';
import { PaginationDto } from '../../core/pagination/pagination.dto.js';
import { PaginatedResponse } from '../../core/pagination/paginated-response.js';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async create(createTenantDto: CreateTenantDto) {
    const domain =
      createTenantDto.domain && createTenantDto.domain.trim() !== ''
        ? createTenantDto.domain.trim()
        : null;

    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug: createTenantDto.slug },
    });

    if (existingTenant) {
      throw new ConflictException('Tenant with this slug already exists');
    }

    if (domain) {
      const existingDomain = await this.prisma.tenant.findUnique({
        where: { domain },
      });
      if (existingDomain) throw new ConflictException('Domain is already registered');
    }

    const hashedPassword = await argon2.hash(createTenantDto.adminPassword);

    // Using transaction to provision everything together
    return this.prisma.$transaction(async (tx) => {
      // 1. Create Tenant
      const tenant = await tx.tenant.create({
        data: {
          name: createTenantDto.name,
          slug: createTenantDto.slug,
          domain: domain,
          contactEmail: createTenantDto.contactEmail || createTenantDto.adminEmail,
          contactPhone: createTenantDto.contactPhone || null,
          status: 'trial',
        },
      });

      // 2. Create Settings
      await tx.tenantSettings.create({
        data: { tenantId: tenant.id },
      });

      // 3. Create Default Organization
      const org = await tx.organization.create({
        data: {
          tenantId: tenant.id,
          name: `${createTenantDto.name} Org`,
        },
      });

      // 4. Create Default Branch
      await tx.branch.create({
        data: {
          tenantId: tenant.id,
          orgId: org.id,
          name: 'Main Branch',
        },
      });

      // 5. Create Super Admin Role
      const role = await tx.role.create({
        data: {
          tenantId: tenant.id,
          name: 'Super Admin',
          permissions: ['*'], // Full access
        },
      });

      // 6. Create Admin User
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: createTenantDto.adminEmail,
          password: hashedPassword,
          firstName: createTenantDto.adminFirstName,
          lastName: createTenantDto.adminLastName,
          status: 'active',
        },
      });

      // 7. Assign Role
      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
        },
      });

      return tenant;
    });
  }

  async findAll(paginationDto: PaginationDto) {
    const { page = 1, limit = 10, search } = paginationDto;
    const skip = (page - 1) * limit;
    
    const where = search ? {
      name: { contains: search, mode: 'insensitive' as any },
    } : {};

    const [total, data] = await Promise.all([
      this.prisma.tenant.count({ where }),
      this.prisma.tenant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return new PaginatedResponse(data, total, page, limit);
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: { settings: true },
    });
    
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async update(id: string, updateTenantDto: UpdateTenantDto) {
    await this.findOne(id); // verify existence

    const domain =
      updateTenantDto.domain !== undefined
        ? updateTenantDto.domain && updateTenantDto.domain.trim() !== ''
          ? updateTenantDto.domain.trim()
          : null
        : undefined;

    if (domain) {
      const existing = await this.prisma.tenant.findFirst({
        where: { domain, id: { not: id } },
      });
      if (existing) throw new ConflictException('Domain already in use');
    }

    const dataToUpdate: any = { ...updateTenantDto };
    if (domain !== undefined) {
      dataToUpdate.domain = domain;
    }

    return this.prisma.tenant.update({
      where: { id },
      data: dataToUpdate,
    });
  }

  async remove(id: string) {
    await this.findOne(id); // verify existence
    return this.prisma.tenant.delete({
      where: { id },
    });
  }

  async verifyBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        settings: {
          select: {
            logoUrl: true,
            primaryColor: true,
          }
        }
      }
    });

    if (!tenant) throw new NotFoundException('Company not found');
    return tenant;
  }
}
