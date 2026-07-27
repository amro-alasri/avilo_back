import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportQueryDto } from './dto/report-query.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { TenantGuard } from '../../core/guards/tenant.guard';
import { RolesGuard } from '../../core/guards/roles.guard';
import { Roles } from '../../core/decorators/roles.decorator';
import { TenantId } from '../../core/decorators/tenant-id.decorator';

@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Roles('Super Admin', 'HR Manager', 'Admin')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('overview')
  getOverview(@TenantId() tenantId: string) {
    return this.reportsService.getOverview(tenantId);
  }

  @Get('attendance')
  getAttendanceTrends(@TenantId() tenantId: string, @Query() query: ReportQueryDto) {
    return this.reportsService.getAttendanceTrends(tenantId, query.days);
  }

  @Get('payroll-costs')
  getPayrollByDepartment(@TenantId() tenantId: string) {
    return this.reportsService.getPayrollByDepartment(tenantId);
  }

  @Get('demographics')
  getDemographics(@TenantId() tenantId: string) {
    return this.reportsService.getDemographics(tenantId);
  }
}
