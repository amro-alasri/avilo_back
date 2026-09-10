import { Controller, Post, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { LeavesService } from './leaves.service.js';
import { CreateLeaveRequestDto, UpdateLeaveStatusDto } from './dto/leave.dto.js';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard.js';
import { TenantGuard } from '../../core/guards/tenant.guard.js';
import { CurrentUser } from '../../core/decorators/current-user.decorator.js';
import { TenantId } from '../../core/decorators/tenant-id.decorator.js';
import { RequireFeatureGuard } from '../../core/guards/require-feature.guard.js';
import { RequireFeature } from '../../core/decorators/require-feature.decorator.js';

@UseGuards(JwtAuthGuard, TenantGuard, RequireFeatureGuard)
@RequireFeature('hasLeaves')
@Controller('leaves')
export class LeavesController {
  constructor(private readonly leavesService: LeavesService) {}

  @Get('types')
  async getLeaveTypes(@TenantId() tenantId: string) {
    return this.leavesService.getLeaveTypes(tenantId);
  }

  @Get('balances')
  async getMyBalances(@CurrentUser('userId') userId: string, @TenantId() tenantId: string) {
    return this.leavesService.getMyBalances(userId, tenantId);
  }

  @Post('requests')
  async createLeaveRequest(@CurrentUser('userId') userId: string, @TenantId() tenantId: string, @Body() dto: CreateLeaveRequestDto) {
    return this.leavesService.createLeaveRequest(userId, tenantId, dto);
  }

  @Patch('requests/:id/status')
  async updateLeaveStatus(
    @Param('id') id: string,
    @TenantId() tenantId: string,
    @CurrentUser('userId') reviewerUserId: string,
    @Body() dto: UpdateLeaveStatusDto,
  ) {
    return this.leavesService.updateLeaveStatus(id, tenantId, reviewerUserId, dto);
  }
}
