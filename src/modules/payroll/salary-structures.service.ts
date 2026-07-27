import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateSalaryStructureDto } from './dto/salary-structure.dto';
import { PaginationDto } from '../../core/pagination/pagination.dto';

@Injectable()
export class SalaryStructuresService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateSalaryStructureDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
    });

    if (!employee || employee.tenantId !== tenantId) {
      throw new NotFoundException('Employee not found');
    }

    return this.prisma.$transaction(async (tx) => {
      const structure = await tx.salaryStructure.create({
        data: {
          tenantId,
          employeeId: dto.employeeId,
          effectiveDate: new Date(dto.effectiveDate),
          baseSalary: dto.baseSalary, // stored in cents
          currency: dto.currency,
        },
      });

      if (dto.components && dto.components.length > 0) {
        await tx.salaryComponent.createMany({
          data: dto.components.map((c) => ({
            salaryStructureId: structure.id,
            name: c.name,
            type: c.type,
            amountType: c.amountType,
            amount: c.amount,
          })),
        });
      }

      return tx.salaryStructure.findUnique({
        where: { id: structure.id },
        include: { components: true },
      });
    });
  }

  async findByEmployee(tenantId: string, employeeId: string) {
    const structures = await this.prisma.salaryStructure.findMany({
      where: { tenantId, employeeId },
      include: { components: true },
      orderBy: { effectiveDate: 'desc' },
    });
    return structures;
  }

  async findAll(tenantId: string, pagination: PaginationDto) {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.salaryStructure.findMany({
        where: { tenantId },
        include: { 
          components: true,
          employee: {
            select: { firstName: true, lastName: true }
          }
        },
        skip,
        take: limit,
        orderBy: { effectiveDate: 'desc' },
      }),
      this.prisma.salaryStructure.count({ where: { tenantId } }),
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
