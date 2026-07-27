import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CheckInDto, CheckOutDto } from './dto/attendance.dto';

@Injectable()
export class AttendancesService {
  constructor(private readonly prisma: PrismaService) {}

  async checkIn(userId: string, tenantId: string, dto: CheckInDto) {
    // Get the employee
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
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

    // Determine status based on schedule (mocked for now, in a real system we fetch schedule)
    // For now we just default to "present"
    const status = 'present'; 

    return this.prisma.attendance.create({
      data: {
        tenantId,
        employeeId: employee.id,
        date: today,
        checkIn: new Date(),
        checkInMethod: dto.method,
        checkInLocation: dto.location ? (dto.location as any) : undefined,
        status,
      },
    });
  }

  async checkOut(userId: string, tenantId: string, dto: CheckOutDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
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

    return this.prisma.attendance.update({
      where: { id: existing.id },
      data: {
        checkOut: new Date(),
        checkOutMethod: dto.method,
        checkOutLocation: dto.location ? (dto.location as any) : undefined,
      },
    });
  }

  async getMyTodayAttendance(userId: string, tenantId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
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
            include: { user: { select: { firstName: true, lastName: true } } }
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
