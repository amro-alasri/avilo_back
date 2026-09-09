import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Query } from '@nestjs/common';
import { OrganizationsService } from './organizations.service.js';
import { CreateOrganizationDto } from './dto/create-organization.dto.js';
import { CreateBranchDto } from './dto/create-branch.dto.js';
import { CreateDepartmentDto } from './dto/create-department.dto.js';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard.js';
import { TenantGuard } from '../../core/guards/tenant.guard.js';
import { TenantId } from '../../core/decorators/tenant-id.decorator.js';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgService: OrganizationsService) {}

  @Post()
  createOrg(@TenantId() tenantId: string, @Body() dto: CreateOrganizationDto) {
    return this.orgService.createOrg(tenantId, dto);
  }

  @Get()
  findAllOrgs(@TenantId() tenantId: string) {
    return this.orgService.findAllOrgs(tenantId);
  }

  @Post('branches')
  createBranch(@TenantId() tenantId: string, @Body() dto: CreateBranchDto) {
    return this.orgService.createBranch(tenantId, dto);
  }

  @Get('branches')
  findAllBranches(@TenantId() tenantId: string, @Query('orgId') orgId?: string) {
    return this.orgService.findAllBranches(tenantId, orgId);
  }

  @Patch('branches/:id')
  updateBranch(@TenantId() tenantId: string, @Param('id') id: string, @Body() dto: any) {
    return this.orgService.updateBranch(tenantId, id, dto);
  }

  @Delete('branches/:id')
  deleteBranch(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.orgService.deleteBranch(tenantId, id);
  }

  @Post('departments')
  createDepartment(@TenantId() tenantId: string, @Body() dto: CreateDepartmentDto) {
    return this.orgService.createDepartment(tenantId, dto);
  }

  @Get('departments')
  findAllDepartments(@TenantId() tenantId: string, @Query('branchId') branchId?: string) {
    return this.orgService.findAllDepartments(tenantId, branchId);
  }
}
