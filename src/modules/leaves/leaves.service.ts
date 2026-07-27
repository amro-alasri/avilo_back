import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateLeaveRequestDto, UpdateLeaveStatusDto } from './dto/leave.dto';

@Injectable()
export class LeavesService {
  constructor(private readonly prisma: PrismaService) {}

  async getLeaveTypes(tenantId: string) {
    return this.prisma.leaveType.findMany({
      where: { tenantId },
    });
  }

  async getMyBalances(userId: string, tenantId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: userId },
    });

    if (!employee || employee.tenantId !== tenantId) {
      throw new NotFoundException('Employee not found');
    }

    const currentYear = new Date().getFullYear();

    return this.prisma.leaveBalance.findMany({
      where: {
        tenantId,
        employeeId: employee.id,
        year: currentYear,
      },
      include: {
        leaveType: true,
      },
    });
  }

  async createLeaveRequest(userId: string, tenantId: string, dto: CreateLeaveRequestDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: userId },
    });

    if (!employee || employee.tenantId !== tenantId) {
      throw new NotFoundException('Employee not found');
    }

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);

    if (startDate > endDate) {
      throw new BadRequestException('Start date must be before end date');
    }

    // Very naive total days calculation (including weekends for simplicity in this version)
    // In production, we'd check against their actual schedule
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    return this.prisma.leaveRequest.create({
      data: {
        tenantId,
        employeeId: employee.id,
        leaveTypeId: dto.leaveTypeId,
        startDate,
        endDate,
        totalDays: diffDays,
        reason: dto.reason,
      },
    });
  }

  async updateLeaveStatus(requestId: string, tenantId: string, reviewerUserId: string, dto: UpdateLeaveStatusDto) {
    const reviewer = await this.prisma.employee.findUnique({
      where: { id: reviewerUserId },
    });

    if (!reviewer || reviewer.tenantId !== tenantId) {
      throw new NotFoundException('Reviewer not found');
    }

    const request = await this.prisma.leaveRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.tenantId !== tenantId) {
      throw new NotFoundException('Leave request not found');
    }

    if (request.status !== 'pending') {
      throw new BadRequestException('Leave request is already processed');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.leaveRequest.update({
        where: { id: requestId },
        data: {
          status: dto.status as any,
          reviewerId: reviewer.id,
          reviewNotes: dto.reviewNotes,
        },
      });

      // If approved, update the balance
      if (dto.status === 'approved') {
        const currentYear = new Date(request.startDate).getFullYear();
        
        const balance = await tx.leaveBalance.findUnique({
          where: {
            employeeId_leaveTypeId_year: {
              employeeId: request.employeeId,
              leaveTypeId: request.leaveTypeId,
              year: currentYear,
            }
          }
        });

        if (balance) {
          await tx.leaveBalance.update({
            where: { id: balance.id },
            data: {
              usedDays: {
                increment: request.totalDays,
              },
            },
          });
        }
      }

      return updated;
    });
  }
}
