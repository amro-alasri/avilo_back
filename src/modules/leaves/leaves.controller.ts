import { Controller, Post, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { LeavesService } from './leaves.service';
import { CreateLeaveRequestDto, UpdateLeaveStatusDto } from './dto/leave.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { TenantGuard } from '../../core/guards/tenant.guard';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { TenantId } from '../../core/decorators/tenant-id.decorator';

@UseGuards(JwtAuthGuard, TenantGuard)
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
