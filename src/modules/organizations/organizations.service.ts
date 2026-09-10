import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateOrganizationDto } from './dto/create-organization.dto.js';
import { CreateBranchDto } from './dto/create-branch.dto.js';
import { CreateDepartmentDto } from './dto/create-department.dto.js';
import { SubscriptionPolicyService } from '../billing/subscription-policy.service.js';

@Injectable()
export class OrganizationsService {
  constructor(
    private prisma: PrismaService,
    private subscriptionPolicyService: SubscriptionPolicyService,
  ) {}

  // --- Organizations ---
  async createOrg(tenantId: string, dto: CreateOrganizationDto) {
    return this.prisma.organization.create({
      data: {
        tenantId,
        name: dto.name,
      },
    });
  }

  async findAllOrgs(tenantId: string) {
    return this.prisma.organization.findMany({
      where: { tenantId },
      include: { branches: true },
    });
  }

  // --- Branches ---
  async createBranch(tenantId: string, dto: CreateBranchDto) {
    // 1. Enforce Subscription Quota (Maximum Locations / Branches Limit)
    await this.subscriptionPolicyService.assertCanAddBranch(tenantId);

    const org = await this.prisma.organization.findUnique({
      where: { id: dto.orgId },
    });
    
    if (!org || org.tenantId !== tenantId) {
       throw new NotFoundException('Organization not found in this tenant');
    }

    return this.prisma.branch.create({
      data: {
        tenantId,
        orgId: dto.orgId,
        name: dto.name,
        address: dto.location,
        latitude: dto.latitude,
        longitude: dto.longitude,
        geofenceRadius: dto.geofenceRadius,
      },
    });
  }

  async findAllBranches(tenantId: string, orgId?: string) {
    const where: any = { tenantId };
    if (orgId) where.orgId = orgId;

    return this.prisma.branch.findMany({
      where,
      include: { departments: true },
    });
  }

  // --- Departments ---
  async createDepartment(tenantId: string, dto: CreateDepartmentDto) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: dto.branchId },
    });

    if (!branch || branch.tenantId !== tenantId) {
       throw new NotFoundException('Branch not found in this tenant');
    }

    return this.prisma.department.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        name: dto.name,
        managerId: dto.managerId,
      },
    });
  }

  async findAllDepartments(tenantId: string, branchId?: string) {
    const where: any = { tenantId };
    if (branchId) where.branchId = branchId;

    return this.prisma.department.findMany({
      where,
    });
  }

  async updateBranch(tenantId: string, id: string, dto: any) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, tenantId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    return this.prisma.branch.update({
      where: { id },
      data: {
        name: dto.name,
        address: dto.location ?? dto.address,
        latitude: dto.latitude,
        longitude: dto.longitude,
        geofenceRadius: dto.geofenceRadius,
      },
    });
  }

  async deleteBranch(tenantId: string, id: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, tenantId },
    });
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }
    return this.prisma.branch.delete({
      where: { id },
    });
  }
}
