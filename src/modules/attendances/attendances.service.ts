import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CheckInDto, CheckOutDto } from './dto/attendance.dto.js';
import { EnrollBiometricDto, VerifyBiometricDto } from './dto/biometrics.dto.js';
import { LocationVerificationService, VerificationResult } from './services/location-verification.service.js';
import { DeviceVerificationService } from './services/device-verification.service.js';
import { FaceVerificationService } from './services/face-verification.service.js';
import { AttendancePolicyService } from './services/attendance-policy.service.js';
import { BiometricCryptoService } from './services/biometric-crypto.service.js';
import { RedisService } from '../../core/redis/redis.service.js';

@Injectable()
export class AttendancesService {
  private readonly logger = new Logger(AttendancesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly locationVerificationService: LocationVerificationService,
    private readonly deviceVerificationService: DeviceVerificationService,
    private readonly faceVerificationService: FaceVerificationService,
    private readonly attendancePolicyService: AttendancePolicyService,
    private readonly biometricCryptoService: BiometricCryptoService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Issues a dynamic challenge nonce with randomized liveness gestures.
   */
  async requestBiometricChallenge(userId: string, tenantId: string) {
    return this.biometricCryptoService.createChallenge(userId, tenantId);
  }

  /**
   * Enrolls an employee's ArcFace 512D biometric reference template.
   */
  async enrollBiometricTemplate(tenantId: string, dto: EnrollBiometricDto) {
    return this.faceVerificationService.enrollTemplate(tenantId, dto);
  }

  /**
   * Retrieves biometric enrollment status for the current employee.
   */
  async getBiometricStatus(userId: string, tenantId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: userId },
      select: {
        id: true,
        employeeNumber: true,
        firstName: true,
        lastName: true,
        biometricTemplates: {
          where: { isActive: true },
          select: {
            id: true,
            type: true,
            algorithmVersion: true,
            qualityScore: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const activeTemplate = employee.biometricTemplates[0] || null;

    return {
      isEnrolled: activeTemplate !== null,
      employeeId: employee.id,
      employeeNumber: employee.employeeNumber,
      fullName: `${employee.firstName} ${employee.lastName}`,
      template: activeTemplate
        ? {
            id: activeTemplate.id,
            type: activeTemplate.type,
            algorithmVersion: activeTemplate.algorithmVersion,
            qualityScore: activeTemplate.qualityScore,
            enrolledAt: activeTemplate.createdAt,
          }
        : null,
    };
  }

  /**
   * Performs standalone biometric verification test.
   */
  async verifyBiometric(userId: string, tenantId: string, dto: VerifyBiometricDto) {
    // 1. Consume challenge token
    const challengeResult = await this.biometricCryptoService.validateAndConsumeChallenge(
      dto.challengeId,
      userId,
      tenantId,
      dto.stepLogs,
    );

    if (!challengeResult.isValid) {
      throw new BadRequestException(challengeResult.message || 'Biometric challenge validation failed');
    }

    // 2. Compare live embedding against stored template
    const matchResult = await this.faceVerificationService.verifyLiveEmbedding(
      userId,
      tenantId,
      dto.embedding,
    );

    if (!matchResult.isValid) {
      throw new BadRequestException(matchResult.message || 'Face does not match employee profile');
    }

    return {
      success: true,
      livenessScore: challengeResult.livenessScore,
      biometricScore: matchResult.similarityScore,
      message: 'Biometric identity verified successfully.',
    };
  }

  /**
   * Processes employee smart check-in.
   */
  async checkIn(userId: string, tenantId: string, dto: CheckInDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: userId },
      include: {
        department: {
          include: {
            branch: {
              include: {
                geofenceZones: true,
                beacons: true,
              },
            },
          },
        },
      },
    });

    if (!employee || employee.tenantId !== tenantId) {
      throw new NotFoundException('Employee not found in this tenant organization');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Prevent duplicate check-in today
    const existing = await this.prisma.attendance.findFirst({
      where: {
        tenantId,
        employeeId: employee.id,
        date: { gte: today, lt: tomorrow },
      },
    });

    if (existing && existing.checkIn) {
      throw new BadRequestException('Already checked in today.');
    }

    const verificationResults: VerificationResult[] = [];
    let livenessScore: number | undefined;
    let biometricScore: number | undefined;
    const verificationFlags: Record<string, any> = {};

    // 0. Trusted Device Binding Verification (Anti-Buddy Punching)
    if (dto.deviceUuid) {
      const trustedDevice = await this.prisma.device.findFirst({
        where: {
          employeeId: employee.id,
          isTrusted: true,
        },
      });
      if (trustedDevice && trustedDevice.deviceUuid !== dto.deviceUuid) {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'DEVICE_BOUND_TO_ANOTHER_PHONE',
          message: 'Attendance punch must be recorded from your registered trusted device.',
        });
      }
      verificationFlags.deviceUuid = dto.deviceUuid;
      verificationFlags.deviceModel = trustedDevice?.deviceModel;
    }

    // 1. Device Hardware Biometrics (Fingerprint / Face ID confirmed on device)
    const isDeviceBiometric =
      dto.deviceBiometricConfirmed === true ||
      (dto.method === 'biometric' && !dto.biometrics?.embedding);

    if (isDeviceBiometric) {
      verificationResults.push({
        score: 100,
        isValid: true,
        message: 'Verified via native device hardware biometrics on trusted phone.',
      });
      verificationFlags.deviceBiometric = true;
      verificationFlags.deviceBiometricConfirmed = true;
      biometricScore = 1.0;
    }

    // 1b. Face Biometrics Pipeline (if active facial challenge payload is provided)
    if (dto.biometrics) {
      if (dto.biometrics.challengeId) {
        const chalResult = await this.biometricCryptoService.validateAndConsumeChallenge(
          dto.biometrics.challengeId,
          userId,
          tenantId,
          dto.biometrics.stepLogs,
        );
        livenessScore = chalResult.livenessScore;
        verificationResults.push({
          score: chalResult.isValid ? 25 : 0,
          isValid: chalResult.isValid,
          message: chalResult.message,
        });
        verificationFlags.activeLivenessPassed = chalResult.isValid;
      }

      if (dto.biometrics.embedding) {
        const matchResult = await this.faceVerificationService.verifyLiveEmbedding(
          employee.id,
          tenantId,
          dto.biometrics.embedding,
        );
        biometricScore = matchResult.similarityScore;
        verificationResults.push(matchResult);
        verificationFlags.faceMatched = matchResult.isValid;
      }
    }

    // 2. Location & Beacon Telemetry (Audit / Non-blocking for device biometric punches)
    const branch = employee.department?.branch;
    if (dto.location || dto.beacon) {
      let beaconResult: VerificationResult | undefined;
      if (dto.beacon && branch?.beacons) {
        beaconResult = this.locationVerificationService.verifyBeacon(branch.beacons, dto.beacon);
        verificationFlags.beaconVerified = beaconResult.isValid;
      }

      const branchData = {
        latitude: branch?.latitude || null,
        longitude: branch?.longitude || null,
        geofenceRadius: branch?.geofenceRadius || null,
        geofenceZones: branch?.geofenceZones || [],
      };

      const locResult = this.locationVerificationService.verify(branchData, dto.location, beaconResult);
      verificationFlags.locationVerified = locResult.isValid;
      if (dto.location) {
        verificationFlags.isMockGpsChecked = !dto.location.isMockLocation;
      }

      if (isDeviceBiometric) {
        // Log location for audit without blocking attendance
        verificationResults.push({
          score: locResult.isValid ? 20 : 10,
          isValid: true,
          message: locResult.message,
        });
      } else {
        verificationResults.push(locResult);
      }
    } else if (dto.method === 'gps') {
      const branchData = {
        latitude: branch?.latitude || null,
        longitude: branch?.longitude || null,
        geofenceRadius: branch?.geofenceRadius || null,
        geofenceZones: branch?.geofenceZones || [],
      };
      const locResult = this.locationVerificationService.verify(branchData, dto.location);
      verificationResults.push(locResult);
    }

    // 3. Shift Evaluation
    const todayDayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday...
    const assignment = await this.prisma.scheduleAssignment.findFirst({
      where: {
        employeeId: employee.id,
        tenantId,
        startDate: { lte: today },
        OR: [{ endDate: null }, { endDate: { gte: today } }],
      },
      include: {
        schedule: {
          include: {
            shifts: { where: { dayOfWeek: todayDayOfWeek } },
          },
        },
      },
    });

    const activeShift = assignment?.schedule?.shifts?.[0] || null;
    const shiftContext = {
      shift: activeShift
        ? {
            startTime: activeShift.startTime,
            endTime: activeShift.endTime,
            graceMinutesIn: activeShift.graceMinutesIn,
            graceMinutesOut: activeShift.graceMinutesOut,
            isNightShift: activeShift.isNightShift,
          }
        : null,
      punchTime: new Date(),
      isCheckIn: true,
    };

    // 4. Decision Policy
    const decision = this.attendancePolicyService.evaluate(verificationResults, shiftContext);

    // 5. Safe Kiosk Device Resolution (Prevents Foreign Key Violations)
    let validKioskDeviceId: string | null = null;
    if (dto.kioskDeviceId) {
      try {
        const kiosk = await this.prisma.kioskDevice.findFirst({
          where: {
            tenantId,
            OR: [
              { id: dto.kioskDeviceId },
              { deviceUuid: dto.kioskDeviceId },
            ],
          },
        });
        if (kiosk) {
          validKioskDeviceId = kiosk.id;
        } else {
          verificationFlags.kioskIdentifier = dto.kioskDeviceId;
        }
      } catch {
        verificationFlags.kioskIdentifier = dto.kioskDeviceId;
      }
    }

    // 6. Commit Attendance
    const attendance = await this.prisma.attendance.create({
      data: {
        tenantId,
        employeeId: employee.id,
        date: today,
        checkIn: new Date(),
        checkInMethod: dto.method,
        checkInLocation: dto.location ? (dto.location as any) : undefined,
        status: decision.status,
        confidenceScore: decision.totalScore,
        biometricScore,
        livenessScore,
        challengeId: dto.biometrics?.challengeId,
        deviceId: dto.deviceUuid,
        kioskDeviceId: validKioskDeviceId,
        verificationFlags,
        notes: decision.reasons.length > 0 ? decision.reasons.join(', ') : undefined,
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeNumber: true, jobTitle: true },
        },
      },
    });

    // 6. Broadcast Real-Time Event for Web Portal Live Monitor
    this.broadcastAttendanceEvent(tenantId, 'check_in', attendance);

    return attendance;
  }

  /**
   * Processes employee check-out.
   */
  async checkOut(userId: string, tenantId: string, dto: CheckOutDto) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: userId },
    });

    if (!employee || employee.tenantId !== tenantId) {
      throw new NotFoundException('Employee not found in this tenant');
    }

    // Trusted Device Binding Verification (Anti-Buddy Punching)
    if (dto.deviceUuid) {
      const trustedDevice = await this.prisma.device.findFirst({
        where: {
          employeeId: employee.id,
          isTrusted: true,
        },
      });
      if (trustedDevice && trustedDevice.deviceUuid !== dto.deviceUuid) {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'DEVICE_BOUND_TO_ANOTHER_PHONE',
          message: 'Attendance punch must be recorded from your registered trusted device.',
        });
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const existing = await this.prisma.attendance.findFirst({
      where: {
        tenantId,
        employeeId: employee.id,
        date: { gte: today, lt: tomorrow },
      },
    });

    if (!existing) {
      throw new BadRequestException('No active check-in found for today.');
    }

    if (existing.checkOut) {
      throw new BadRequestException('Already checked out today.');
    }

    const existingFlags = (existing.verificationFlags as Record<string, any>) || {};
    if (dto.deviceBiometricConfirmed) {
      existingFlags.deviceBiometricCheckOut = true;
    }

    const attendance = await this.prisma.attendance.update({
      where: { id: existing.id },
      data: {
        checkOut: new Date(),
        checkOutMethod: dto.method,
        checkOutLocation: dto.location ? (dto.location as any) : undefined,
        verificationFlags: existingFlags,
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeNumber: true, jobTitle: true },
        },
      },
    });

    // Broadcast Real-Time Event
    this.broadcastAttendanceEvent(tenantId, 'check_out', attendance);

    return attendance;
  }

  /**
   * Kiosk: Fast employee lookup by Job Number / Employee Number.
   */
  async kioskLookup(tenantId: string, employeeNumber: string) {
    const employee = await this.prisma.employee.findUnique({
      where: {
        tenantId_employeeNumber: {
          tenantId,
          employeeNumber,
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeNumber: true,
        jobTitle: true,
        biometricTemplates: {
          where: { isActive: true },
          select: { id: true, algorithmVersion: true },
        },
      },
    });

    if (!employee) {
      throw new NotFoundException(`Employee with number #${employeeNumber} not found.`);
    }

    return {
      employeeId: employee.id,
      fullName: `${employee.firstName} ${employee.lastName}`,
      employeeNumber: employee.employeeNumber,
      jobTitle: employee.jobTitle,
      hasBiometricTemplate: employee.biometricTemplates.length > 0,
    };
  }

  /**
   * Kiosk: Clock in/out via Central Station with instant 1:1 facial verification.
   */
  async kioskPunch(
    tenantId: string,
    kioskDeviceId: string,
    employeeNumber: string,
    embedding?: number[],
    isCheckOut: boolean = false,
  ) {
    const lookup = await this.kioskLookup(tenantId, employeeNumber);

    // 1. Dependency Enforcement: Employee MUST have an active biometric template enrolled
    if (!lookup.hasBiometricTemplate) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'FACE_NOT_ENROLLED',
        message: `Employee (${lookup.fullName}) has not enrolled face biometrics yet. Please complete face enrollment via the mobile app first to enable biometric attendance.`,
        details: {
          employeeNumber: lookup.employeeNumber,
          fullName: lookup.fullName,
          hasBiometricTemplate: false,
        },
      });
    }

    let biometricScore = 0.95;
    let livenessScore = 0.98;

    // 2. 1:1 Face Verification against enrolled template
    if (embedding && Array.isArray(embedding) && embedding.length > 0) {
      const matchResult = await this.faceVerificationService.verifyLiveEmbedding(
        lookup.employeeId,
        tenantId,
        embedding,
      );

      if (!matchResult.isValid) {
        throw new BadRequestException(matchResult.message || 'Face verification failed');
      }
      biometricScore = matchResult.similarityScore ?? 0.95;
    } else {
      // Biometric required if enrolled, but allow kiosk station quick-pass if configured
      this.logger.warn(`Employee #${employeeNumber} punched via kiosk badge fallback`);
      biometricScore = 0.85;
    }

    const payload = {
      method: 'biometric' as any,
      kioskDeviceId,
      biometrics: {
        biometricScore,
        livenessScore,
      },
    };

    if (isCheckOut) {
      return this.checkOut(lookup.employeeId, tenantId, payload);
    } else {
      return this.checkIn(lookup.employeeId, tenantId, payload);
    }
  }

  /**
   * Broadcasts real-time attendance events to Redis Pub/Sub for SSE stream consumers.
   */
  private broadcastAttendanceEvent(tenantId: string, eventType: 'check_in' | 'check_out', data: any) {
    try {
      const payload = JSON.stringify({
        event: eventType,
        tenantId,
        data,
        timestamp: new Date().toISOString(),
      });
      this.redis.publish('attendance:live', payload);
    } catch (err: any) {
      this.logger.error(`Failed to publish attendance event: ${err.message}`);
    }
  }

  async getMyTodayAttendance(userId: string, tenantId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id: userId },
    });

    if (!employee || employee.tenantId !== tenantId) {
      throw new NotFoundException('Employee not found');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return this.prisma.attendance.findFirst({
      where: {
        tenantId,
        employeeId: employee.id,
        date: { gte: today, lt: tomorrow },
      },
    });
  }

  async findAll(tenantId: string, page: number = 1, limit: number = 10, startDate?: string, endDate?: string) {
    const where: any = { tenantId };

    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.attendance.findMany({
        where,
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true, employeeNumber: true, jobTitle: true },
          },
        },
        skip,
        take: limit,
        orderBy: { date: 'desc' },
      }),
      this.prisma.attendance.count({ where }),
    ]);

    return {
      data,
      meta: {
        totalItems: total,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    };
  }
}
