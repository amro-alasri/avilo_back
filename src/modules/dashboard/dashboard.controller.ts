import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service.js';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard.js';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  getOverviewStats(@Req() req: any) {
    const tenantId = req.user.tenantId;
    return this.dashboardService.getOverviewStats(tenantId);
  }
}
