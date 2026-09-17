import { Controller, Get, Post, Body, Patch, Delete, Param, Query, UseGuards } from '@nestjs/common';
import { EmployeesService } from './employees.service.js';
import { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { UpdateEmployeeDto } from './dto/update-employee.dto.js';
import { PaginationDto } from '../../core/pagination/pagination.dto.js';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard.js';
import { TenantGuard } from '../../core/guards/tenant.guard.js';
import { TenantId } from '../../core/decorators/tenant-id.decorator.js';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  create(@TenantId() tenantId: string, @Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(tenantId, dto);
  }

  @Get()
  findAll(@TenantId() tenantId: string, @Query() paginationDto: PaginationDto) {
    return this.employeesService.findAll(tenantId, paginationDto);
  }

  @Get(':id')
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.employeesService.findOne(tenantId, id);
  }

  @Patch(':id')
  update(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeesService.update(tenantId, id, dto);
  }

  @Delete(':id/biometrics')
  resetBiometrics(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.employeesService.resetBiometricTemplate(tenantId, id);
  }

  @Delete(':id')
  remove(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.employeesService.remove(tenantId, id);
  }
}
