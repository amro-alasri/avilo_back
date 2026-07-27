import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreatePayrollRunDto } from './dto/payroll.dto';
import { PaginationDto } from '../../core/pagination/pagination.dto';

@Injectable()
export class PayrollService {
  constructor(private prisma: PrismaService) {}

  async createRun(tenantId: string, dto: CreatePayrollRunDto) {
    const existing = await this.prisma.payrollRun.findFirst({
      where: {
        tenantId,
        periodMonth: dto.periodMonth,
        periodYear: dto.periodYear,
      },
    });

    if (existing) {
      throw new ConflictException('A payroll run already exists for this period');
    }

    return this.prisma.payrollRun.create({
      data: {
        tenantId,
        periodMonth: dto.periodMonth,
        periodYear: dto.periodYear,
        status: 'draft',
      },
    });
  }

  async processRun(tenantId: string, payrollRunId: string) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: payrollRunId },
    });

    if (!run || run.tenantId !== tenantId) {
      throw new NotFoundException('Payroll run not found');
    }

    if (run.status !== 'draft' && run.status !== 'failed') {
      throw new BadRequestException(`Cannot process payroll run in ${run.status} status`);
    }

    // Process inside transaction
    return this.prisma.$transaction(async (tx) => {
      // 1. Get all active employees for this tenant
      const employees = await tx.employee.findMany({
        where: { tenantId, status: 'active' },
      });

      let runTotalAmount = 0;
      const payslipsToCreate: any[] = [];

      // 2. Compute salary for each employee
      for (const employee of employees) {
        // Find latest effective salary structure
        const structure = await tx.salaryStructure.findFirst({
          where: {
            employeeId: employee.id,
            effectiveDate: { lte: new Date() }, // Effective as of now
          },
          include: { components: true },
          orderBy: { effectiveDate: 'desc' },
        });

        if (!structure) {
          // If no structure, skip this employee or record zero
          continue;
        }

        let totalAllowances = 0;
        let totalDeductions = 0;
        const details: any = {
          baseSalary: structure.baseSalary,
          components: []
        };

        for (const comp of structure.components) {
          let calcAmount = 0;
          if (comp.amountType === 'fixed') {
            calcAmount = comp.amount;
          } else if (comp.amountType === 'percentage') {
            // amount represents percentage e.g. 10 for 10%
            calcAmount = Math.round((structure.baseSalary * comp.amount) / 100);
          }

          details.components.push({
            name: comp.name,
            type: comp.type,
            amountType: comp.amountType,
            value: comp.amount,
            calculated: calcAmount
          });

          if (comp.type === 'allowance') {
            totalAllowances += calcAmount;
          } else {
            totalDeductions += calcAmount;
          }
        }

        const netSalary = structure.baseSalary + totalAllowances - totalDeductions;
        runTotalAmount += netSalary;

        // Note: checking if payslip already exists to avoid unique constraint if re-processing
        const existingPayslip = await tx.payslip.findFirst({
          where: { employeeId: employee.id, payrollRunId: run.id }
        });

        if (existingPayslip) {
          await tx.payslip.update({
            where: { id: existingPayslip.id },
            data: {
              basicSalary: structure.baseSalary,
              totalAllowances,
              totalDeductions,
              netSalary,
              details,
            }
          });
        } else {
          payslipsToCreate.push({
            tenantId,
            employeeId: employee.id,
            payrollRunId: run.id,
            basicSalary: structure.baseSalary,
            totalAllowances,
            totalDeductions,
            netSalary,
            details,
            status: 'generated',
          });
        }
      }

      if (payslipsToCreate.length > 0) {
        await tx.payslip.createMany({ data: payslipsToCreate });
      }

      // Update run status
      const updatedRun = await tx.payrollRun.update({
        where: { id: run.id },
        data: {
          status: 'completed',
          totalAmount: runTotalAmount,
          processDate: new Date(),
        },
      });

      return updatedRun;
    });
  }

  async findAll(tenantId: string, pagination: PaginationDto) {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.payrollRun.findMany({
        where: { tenantId },
        skip,
        take: limit,
        orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
      }),
      this.prisma.payrollRun.count({ where: { tenantId } }),
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

  async findOne(tenantId: string, id: string) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
      include: {
        payslips: {
          include: {
            employee: {
              include: { user: { select: { firstName: true, lastName: true } } }
            }
          }
        }
      }
    });

    if (!run || run.tenantId !== tenantId) throw new NotFoundException('Payroll run not found');
    return run;
  }

  async getPayslip(tenantId: string, payslipId: string) {
    const payslip = await this.prisma.payslip.findUnique({
      where: { id: payslipId },
      include: {
        employee: {
          include: { user: { select: { firstName: true, lastName: true } } }
        },
        payrollRun: true,
      }
    });

    if (!payslip || payslip.tenantId !== tenantId) throw new NotFoundException('Payslip not found');
    return payslip;
  }
}
