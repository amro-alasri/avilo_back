import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { TenantsService } from './tenants.service.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import { PaginationDto } from '../../core/pagination/pagination.dto.js';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../core/guards/roles.guard.js';
import { Roles } from '../../core/decorators/roles.decorator.js';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  // Usually this endpoint is either public (for self-signup) or protected by a global superadmin auth
  // We'll leave it public for the sake of easy provisioning initially, 
  // but in reality it should have captcha + rate limit or be admin-only
  create(@Body() createTenantDto: CreateTenantDto) {
    return this.tenantsService.create(createTenantDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SuperAdmin') // Only system level admins can list all tenants
  @Get()
  findAll(@Query() paginationDto: PaginationDto) {
    return this.tenantsService.findAll(paginationDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SuperAdmin')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SuperAdmin')
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTenantDto: UpdateTenantDto) {
    return this.tenantsService.update(id, updateTenantDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SuperAdmin')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tenantsService.remove(id);
  }
}
