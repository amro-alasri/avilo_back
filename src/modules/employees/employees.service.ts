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
    const existingEmployee = await this.prisma.employee.findUnique({
      where: {
        tenantId_email: {
          email: dto.email,
          tenantId,
        },
      },
    });

    if (existingEmployee) {
      throw new ConflictException('Employee with this email already exists in the tenant');
    }

    const defaultPassword = nanoid(10);
    const hashedPassword = await argon2.hash(defaultPassword);

    const employee = await this.prisma.employee.create({
      data: {
        tenantId,
        email: dto.email,
        password: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
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
  }

  async findAll(tenantId: string, paginationDto: PaginationDto) {
    const { page = 1, limit = 10, search } = paginationDto;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };
    
    if (search) {
      where.OR = [
        { employeeNumber: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          employeeNumber: true,
          status: true,
          createdAt: true,
          departmentId: true,
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
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        employeeNumber: true,
        status: true,
        createdAt: true,
        jobTitle: true,
        joinDate: true,
        birthDate: true,
        gender: true,
        phone: true,
        departmentId: true,
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

    return this.prisma.employee.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
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
  }
}
