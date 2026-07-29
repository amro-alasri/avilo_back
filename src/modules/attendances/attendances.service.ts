import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CheckInDto, CheckOutDto } from './dto/attendance.dto.js';
import { LocationVerificationService } from './services/location-verification.service.js';
import { DeviceVerificationService } from './services/device-verification.service.js';
import { FaceVerificationService } from './services/face-verification.service.js';
import { AttendancePolicyService } from './services/attendance-policy.service.js';

@Injectable()
export class AttendancesService {
  private readonly logger = new Logger(AttendancesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly locationVerificationService: LocationVerificationService,
    private readonly deviceVerificationService: DeviceVerificationService,
    private readonly faceVerificationService: FaceVerificationService,
    private readonly attendancePolicyService: AttendancePolicyService,
  ) {}

  async checkIn(userId: string, tenantId: string, dto: CheckInDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: userId },
      include: {
        department: {
          include: {
            branch: true
          }
        }
      }
    });

    if (!employee || employee.tenantId !== tenantId) {
      throw new NotFoundException('Employee not found');
    }

    // Get today's date bounds in UTC
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Check if already checked in today
    const existing = await this.prisma.attendance.findFirst({
      where: {
        tenantId,
        employeeId: employee.id,
        date: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    if (existing) {
      throw new BadRequestException('Already checked in today');
    }

    let confidenceScore = 100;
    let finalStatus = 'present';
    let notes = '';

    // If using GPS method, run the Verification Engine
    if (dto.method === 'gps' && dto.location) {
      const branch = employee.department?.branch;
      if (!branch) {
        this.logger.warn(`Employee ${employee.id} has no branch assigned.`);
      }

      const branchData = {
        latitude: branch?.latitude || null,
        longitude: branch?.longitude || null,
        geofenceRadius: branch?.geofenceRadius || null,
      };

      const locResult = this.locationVerificationService.verify(branchData, dto.location);
      const devResult = this.deviceVerificationService.verify(dto.location);
      // Face verification is stubbed for now (true if face matched, undefined if not provided)
      const faceResult = this.faceVerificationService.verify(undefined); 

      // Evaluate Policy
      const decision = this.attendancePolicyService.evaluate([locResult, devResult, faceResult]);
      
      confidenceScore = decision.totalScore;
      finalStatus = decision.status;
      if (decision.reasons.length > 0) {
        notes = decision.reasons.join(', ');
      }
    }

    return this.prisma.attendance.create({
      data: {
        tenantId,
        employeeId: employee.id,
        date: today,
        checkIn: new Date(),
        checkInMethod: dto.method,
        checkInLocation: dto.location ? (dto.location as any) : undefined,
        status: finalStatus,
        confidenceScore,
        notes: notes || undefined,
      },
    });
  }

  async checkOut(userId: string, tenantId: string, dto: CheckOutDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: userId },
    });

    if (!employee || employee.tenantId !== tenantId) {
      throw new NotFoundException('Employee not found');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const existing = await this.prisma.attendance.findFirst({
      where: {
        tenantId,
        employeeId: employee.id,
        date: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    if (!existing) {
      throw new BadRequestException('No check-in found for today');
    }

    if (existing.checkOut) {
      throw new BadRequestException('Already checked out today');
    }

    let confidenceScore = 100;
    let finalStatus = existing.status; // Keep existing status or update it? We'll just keep it but calculate score
    let notes = existing.notes || '';

    // If using GPS method, run the Verification Engine
    if (dto.method === 'gps' && dto.location) {
      const employeeWithBranch = await this.prisma.employee.findUnique({
        where: { id: userId },
        include: { department: { include: { branch: true } } }
      });
      const branch = employeeWithBranch?.department?.branch;

      const branchData = {
        latitude: branch?.latitude || null,
        longitude: branch?.longitude || null,
        geofenceRadius: branch?.geofenceRadius || null,
      };

      const locResult = this.locationVerificationService.verify(branchData, dto.location);
      const devResult = this.deviceVerificationService.verify(dto.location);
      const faceResult = this.faceVerificationService.verify(undefined); 

      // Evaluate Policy
      const decision = this.attendancePolicyService.evaluate([locResult, devResult, faceResult]);
      
      confidenceScore = decision.totalScore;
      if (decision.reasons.length > 0) {
        notes = notes ? `${notes} | Checkout: ${decision.reasons.join(', ')}` : `Checkout: ${decision.reasons.join(', ')}`;
      }
    }

    return this.prisma.attendance.update({
      where: { id: existing.id },
      data: {
        checkOut: new Date(),
        checkOutMethod: dto.method,
        checkOutLocation: dto.location ? (dto.location as any) : undefined,
        notes: notes || undefined,
        // We could store check-in and check-out scores separately, but for now we just keep the checkIn score
        // or update it to be the average. Let's just update the notes for checkout.
      },
    });
  }

  async getMyTodayAttendance(userId: string, tenantId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: userId },
    });

    if (!employee || employee.tenantId !== tenantId) {
      throw new NotFoundException('Employee not found');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.prisma.attendance.findFirst({
      where: {
        tenantId,
        employeeId: employee.id,
        date: {
          gte: today,
          lt: tomorrow,
        },
      },
    });
  }

  async findAll(tenantId: string, page: number = 1, limit: number = 10, startDate?: string, endDate?: string) {
    const where: any = { tenantId };

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        include: {
          employee: {
            select: { firstName: true, lastName: true }
          }
        },
        skip,
        take: limit,
        orderBy: { date: 'desc' },
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return {
      data,
      meta: {
        totalItems: total,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    };
  }
}
