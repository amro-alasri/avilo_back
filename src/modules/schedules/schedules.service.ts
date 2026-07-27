import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateScheduleDto } from './dto/schedule.dto';

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  async createSchedule(tenantId: string, dto: CreateScheduleDto) {
    return this.prisma.schedule.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        shifts: {
          create: dto.shifts.map(shift => ({
            dayOfWeek: shift.dayOfWeek,
            startTime: shift.startTime,
            endTime: shift.endTime,
            isWorkingDay: shift.isWorkingDay,
          })),
        },
      },
      include: {
        shifts: true,
      },
    });
  }

  async getMySchedule(userId: string, tenantId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: userId },
    });

    if (!employee || employee.tenantId !== tenantId) {
      throw new NotFoundException('Employee not found');
    }

    const assignment = await this.prisma.scheduleAssignment.findFirst({
      where: {
        employeeId: employee.id,
        tenantId,
        OR: [
          { endDate: null },
          { endDate: { gte: new Date() } },
        ],
      },
      include: {
        schedule: {
          include: {
            shifts: true,
          },
        },
      },
      orderBy: {
        startDate: 'desc',
      },
    });

    if (!assignment) {
      throw new NotFoundException('No active schedule found for this employee');
    }

    return assignment.schedule;
  }
}
