import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { SchedulesService } from './schedules.service';
import { CreateScheduleDto } from './dto/schedule.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { TenantGuard } from '../../core/guards/tenant.guard';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { TenantId } from '../../core/decorators/tenant-id.decorator';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('schedules')
export class SchedulesController {
  constructor(private readonly schedulesService: SchedulesService) {}

  @Post()
  async createSchedule(@TenantId() tenantId: string, @Body() dto: CreateScheduleDto) {
    return this.schedulesService.createSchedule(tenantId, dto);
  }

  @Get('my-schedule')
  async getMySchedule(@CurrentUser('userId') userId: string, @TenantId() tenantId: string) {
    return this.schedulesService.getMySchedule(userId, tenantId);
  }
}
