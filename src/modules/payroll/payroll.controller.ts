import { Controller, Post, Get, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { SalaryStructuresService } from './salary-structures.service';
import { CreatePayrollRunDto } from './dto/payroll.dto';
import { CreateSalaryStructureDto } from './dto/salary-structure.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard.js';
import { RequireFeatureGuard } from '../../core/guards/require-feature.guard.js';
import { RequireFeature } from '../../core/decorators/require-feature.decorator.js';
import { PaginationDto } from '../../core/pagination/pagination.dto';

@UseGuards(JwtAuthGuard, RequireFeatureGuard)
@RequireFeature('hasPayroll')
@Controller('payroll')
export class PayrollController {
  constructor(
    private readonly payrollService: PayrollService,
    private readonly salaryStructuresService: SalaryStructuresService,
  ) {}

  // Salary Structures
  @Post('salary-structures')
  createSalaryStructure(@Request() req, @Body() dto: CreateSalaryStructureDto) {
    return this.salaryStructuresService.create(req.user.tenantId, dto);
  }

  @Get('salary-structures')
  findAllSalaryStructures(@Request() req, @Query() pagination: PaginationDto) {
    return this.salaryStructuresService.findAll(req.user.tenantId, pagination);
  }

  @Get('salary-structures/employee/:employeeId')
  findSalaryStructureByEmployee(@Request() req, @Param('employeeId') employeeId: string) {
    return this.salaryStructuresService.findByEmployee(req.user.tenantId, employeeId);
  }

  // Payroll Runs
  @Post('runs')
  createRun(@Request() req, @Body() dto: CreatePayrollRunDto) {
    return this.payrollService.createRun(req.user.tenantId, dto);
  }

  @Post('runs/:id/process')
  processRun(@Request() req, @Param('id') id: string) {
    return this.payrollService.processRun(req.user.tenantId, id);
  }

  @Get('runs')
  findAllRuns(@Request() req, @Query() pagination: PaginationDto) {
    return this.payrollService.findAll(req.user.tenantId, pagination);
  }

  @Get('runs/:id')
  findRunById(@Request() req, @Param('id') id: string) {
    return this.payrollService.findOne(req.user.tenantId, id);
  }

  // Payslips
  @Get('payslips/:id')
  getPayslip(@Request() req, @Param('id') id: string) {
    return this.payrollService.getPayslip(req.user.tenantId, id);
  }
}
