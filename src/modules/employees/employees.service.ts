import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { UpdateEmployeeDto } from './dto/update-employee.dto.js';
import { PaginationDto } from '../../core/pagination/pagination.dto.js';
import { PaginatedResponse } from '../../core/pagination/paginated-response.js';
import * as argon2 from 'argon2';
import { nanoid } from 'nanoid';

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateEmployeeDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: {
        email_tenantId: {
          email: dto.email,
          tenantId,
        },
      },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists in the tenant');
    }

    const defaultPassword = nanoid(10);
    const hashedPassword = await argon2.hash(defaultPassword);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          tenantId,
          email: dto.email,
          password: hashedPassword,
          firstName: dto.firstName,
          lastName: dto.lastName,
          status: 'active',
        },
      });

      if (dto.roleId) {
        await tx.userRole.create({
          data: {
            userId: user.id,
            roleId: dto.roleId,
          },
        });
      }

      const employee = await tx.employee.create({
        data: {
          tenantId,
          userId: user.id,
          employeeNumber: dto.employeeNumber,
          jobTitle: dto.jobTitle,
          joinDate: new Date(dto.joinDate),
          departmentId: dto.departmentId,
          status: dto.status as any || 'active',
          birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
          gender: dto.gender as any,
          phone: dto.phone,
        },
      });

      return employee;
    });
  }

  async findAll(tenantId: string, paginationDto: PaginationDto) {
    const { page = 1, limit = 10, search } = paginationDto;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };
    
    if (search) {
      where.OR = [
        { employeeNumber: { contains: search, mode: 'insensitive' } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true, avatarUrl: true },
          },
          department: {
            select: { id: true, name: true, branch: { select: { id: true, name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return new PaginatedResponse(data, total, page, limit);
  }

  async findOne(tenantId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, tenantId },
      include: {
        user: { select: { email: true, firstName: true, lastName: true, avatarUrl: true } },
        department: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return employee;
  }

  async update(tenantId: string, id: string, dto: UpdateEmployeeDto) {
    const employee = await this.findOne(tenantId, id);

    return this.prisma.$transaction(async (tx) => {
      if (dto.firstName || dto.lastName || dto.email) {
        await tx.user.update({
          where: { id: employee.userId },
          data: {
            firstName: dto.firstName,
            lastName: dto.lastName,
            email: dto.email,
          },
        });
      }

      return tx.employee.update({
        where: { id },
        data: {
          employeeNumber: dto.employeeNumber,
          jobTitle: dto.jobTitle,
          joinDate: dto.joinDate ? new Date(dto.joinDate) : undefined,
          departmentId: dto.departmentId,
          status: dto.status as any,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          gender: dto.gender as any,
          phone: dto.phone,
        },
      });
    });
  }
}
