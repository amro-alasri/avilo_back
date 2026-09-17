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
      include: {
        departments: true,
        geofenceZones: true,
        beacons: true,
        kioskDevices: true,
      },
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

  // --- Geofence Zones ---
  async addGeofenceZone(
    tenantId: string,
    branchId: string,
    dto: {
      name: string;
      zoneType?: string;
      radiusMeters?: number;
      latitude?: number;
      longitude?: number;
      polygonCoords?: any;
    },
  ) {
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId } });
    if (!branch) throw new NotFoundException('Branch not found');
    return this.prisma.geofenceZone.create({
      data: {
        tenantId,
        branchId,
        name: dto.name,
        zoneType: dto.zoneType || 'circle',
        radiusMeters: dto.radiusMeters,
        latitude: dto.latitude,
        longitude: dto.longitude,
        polygonCoords: dto.polygonCoords,
      },
    });
  }

  async deleteGeofenceZone(tenantId: string, zoneId: string) {
    const zone = await this.prisma.geofenceZone.findFirst({ where: { id: zoneId, tenantId } });
    if (!zone) throw new NotFoundException('Geofence zone not found');
    return this.prisma.geofenceZone.delete({ where: { id: zoneId } });
  }

  // --- Beacons ---
  async addBeacon(
    tenantId: string,
    branchId: string,
    dto: {
      name: string;
      uuid: string;
      major: number;
      minor: number;
      rssiThreshold?: number;
    },
  ) {
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId } });
    if (!branch) throw new NotFoundException('Branch not found');
    return this.prisma.beacon.create({
      data: {
        tenantId,
        branchId,
        name: dto.name,
        uuid: dto.uuid,
        major: dto.major,
        minor: dto.minor,
        rssiThreshold: dto.rssiThreshold ?? -85,
      },
    });
  }

  async deleteBeacon(tenantId: string, beaconId: string) {
    const beacon = await this.prisma.beacon.findFirst({ where: { id: beaconId, tenantId } });
    if (!beacon) throw new NotFoundException('Beacon not found');
    return this.prisma.beacon.delete({ where: { id: beaconId } });
  }

  // --- Kiosk Devices ---
  async getKioskDevices(tenantId: string, branchId?: string) {
    const where: any = { tenantId };
    if (branchId) where.branchId = branchId;
    return this.prisma.kioskDevice.findMany({
      where,
      include: { branch: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addKioskDevice(
    tenantId: string,
    branchId: string,
    dto: {
      name: string;
      deviceUuid: string;
      appVersion?: string;
    },
  ) {
    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId } });
    if (!branch) throw new NotFoundException('Branch not found');
    return this.prisma.kioskDevice.create({
      data: {
        tenantId,
        branchId,
        name: dto.name,
        deviceUuid: dto.deviceUuid,
        appVersion: dto.appVersion ?? '1.0.0',
        status: 'active',
        lastHeartbeatAt: new Date(),
      },
    });
  }

  async deleteKioskDevice(tenantId: string, kioskId: string) {
    const kiosk = await this.prisma.kioskDevice.findFirst({ where: { id: kioskId, tenantId } });
    if (!kiosk) throw new NotFoundException('Kiosk device not found');
    return this.prisma.kioskDevice.delete({ where: { id: kioskId } });
  }
}

