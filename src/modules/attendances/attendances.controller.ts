import { Controller, Post, Get, Body, Query, UseGuards, Sse, MessageEvent, BadRequestException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AttendancesService } from './attendances.service.js';
import { CheckInDto, CheckOutDto } from './dto/attendance.dto.js';
import { EnrollBiometricDto, VerifyBiometricDto, RequestChallengeDto } from './dto/biometrics.dto.js';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard.js';
import { TenantGuard } from '../../core/guards/tenant.guard.js';
import { CurrentUser } from '../../core/decorators/current-user.decorator.js';
import { TenantId } from '../../core/decorators/tenant-id.decorator.js';
import { RedisService } from '../../core/redis/redis.service.js';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('attendances')
export class AttendancesController {
  constructor(
    private readonly attendancesService: AttendancesService,
    private readonly redis: RedisService,
  ) {}

  @Post('check-in')
  async checkIn(@CurrentUser('userId') userId: string, @TenantId() tenantId: string, @Body() dto: CheckInDto) {
    return this.attendancesService.checkIn(userId, tenantId, dto);
  }

  @Post('check-out')
  async checkOut(@CurrentUser('userId') userId: string, @TenantId() tenantId: string, @Body() dto: CheckOutDto) {
    return this.attendancesService.checkOut(userId, tenantId, dto);
  }

  // --- Biometric Endpoints ---

  @Get('biometrics/status')
  async getBiometricStatus(
    @CurrentUser('userId') userId: string,
    @TenantId() tenantId: string,
  ) {
    return this.attendancesService.getBiometricStatus(userId, tenantId);
  }

  @Post('biometrics/challenge')
  async requestChallenge(
    @CurrentUser('userId') userId: string,
    @TenantId() tenantId: string,
    @Body() _dto: RequestChallengeDto,
  ) {
    return this.attendancesService.requestBiometricChallenge(userId, tenantId);
  }

  @Post('biometrics/enroll')
  async enrollBiometric(
    @CurrentUser('userId') userId: string,
    @TenantId() tenantId: string,
    @Body() dto: EnrollBiometricDto,
  ) {
    const targetEmployeeId = dto.employeeId || userId;
    return this.attendancesService.enrollBiometricTemplate(tenantId, {
      ...dto,
      employeeId: targetEmployeeId,
    });
  }

  @Post('biometrics/verify')
  async verifyBiometric(
    @CurrentUser('userId') userId: string,
    @TenantId() tenantId: string,
    @Body() dto: VerifyBiometricDto,
  ) {
    return this.attendancesService.verifyBiometric(userId, tenantId, dto);
  }

  // --- Tablet Kiosk Station Endpoints ---

  @Post('kiosk/lookup')
  async kioskLookup(@TenantId() tenantId: string, @Body('employeeNumber') employeeNumber: string) {
    if (!employeeNumber) {
      throw new BadRequestException('Employee number is required');
    }
    return this.attendancesService.kioskLookup(tenantId, employeeNumber);
  }

  @Post('kiosk/punch')
  async kioskPunch(
    @TenantId() tenantId: string,
    @Body()
    body: {
      kioskDeviceId: string;
      employeeNumber: string;
      embedding: number[];
      isCheckOut?: boolean;
    },
  ) {
    if (!body.kioskDeviceId || !body.employeeNumber || !body.embedding) {
      throw new BadRequestException('kioskDeviceId, employeeNumber, and embedding are required');
    }
    return this.attendancesService.kioskPunch(
      tenantId,
      body.kioskDeviceId,
      body.employeeNumber,
      body.embedding,
      body.isCheckOut ?? false,
    );
  }

  // --- Real-Time SSE Stream Endpoint ---

  @Sse('stream/live')
  streamLiveAttendance(@TenantId() tenantId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const redisSub = this.redis.getClient().duplicate();

      redisSub.subscribe('attendance:live', (err) => {
        if (err) {
          subscriber.error(err);
        }
      });

      redisSub.on('message', (_channel: string, message: string) => {
        try {
          const parsed = JSON.parse(message);
          if (parsed.tenantId === tenantId) {
            subscriber.next({
              data: parsed,
              type: 'attendance_update',
            });
          }
        } catch {
          // ignore parsing error
        }
      });

      return () => {
        redisSub.unsubscribe('attendance:live').catch(() => {});
        redisSub.quit().catch(() => {});
      };
    });
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
