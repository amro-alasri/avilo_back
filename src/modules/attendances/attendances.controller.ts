import { Controller, Post, Get, Body, Query, UseGuards } from '@nestjs/common';
import { AttendancesService } from './attendances.service';
import { CheckInDto, CheckOutDto } from './dto/attendance.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard';
import { TenantGuard } from '../../core/guards/tenant.guard';
import { CurrentUser } from '../../core/decorators/current-user.decorator';
import { TenantId } from '../../core/decorators/tenant-id.decorator';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('attendances')
export class AttendancesController {
  constructor(private readonly attendancesService: AttendancesService) {}

  @Post('check-in')
  async checkIn(@CurrentUser('userId') userId: string, @TenantId() tenantId: string, @Body() dto: CheckInDto) {
    return this.attendancesService.checkIn(userId, tenantId, dto);
  }

  @Post('check-out')
  async checkOut(@CurrentUser('userId') userId: string, @TenantId() tenantId: string, @Body() dto: CheckOutDto) {
    return this.attendancesService.checkOut(userId, tenantId, dto);
  }

  @Get('me/today')
  async getMyTodayAttendance(@CurrentUser('userId') userId: string, @TenantId() tenantId: string) {
    return this.attendancesService.getMyTodayAttendance(userId, tenantId);
  }

  @Get()
  async findAll(
    @TenantId() tenantId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '10',
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.attendancesService.findAll(tenantId, +page, +limit, startDate, endDate);
  }
}
