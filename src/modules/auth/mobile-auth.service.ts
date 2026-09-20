import { Injectable, UnauthorizedException, BadRequestException, ForbiddenException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service.js';
import * as argon2 from 'argon2';
import { ConfigService } from '@nestjs/config';
import { RegisterEmployeeDto } from './dto/register-employee.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { BiometricLoginDto } from './dto/biometric-login.dto.js';

@Injectable()
export class MobileAuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async mobileLogin(loginDto: LoginDto, tenantSlug: string) {
    const cleanSlug = tenantSlug ? tenantSlug.trim() : '';
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        OR: [
          { slug: { equals: cleanSlug, mode: 'insensitive' } },
          { id: cleanSlug },
          { domain: { equals: cleanSlug, mode: 'insensitive' } },
          { name: { equals: cleanSlug, mode: 'insensitive' } },
        ],
      },
    });

    if (!tenant) throw new UnauthorizedException('Tenant not found');
    if (tenant.status !== 'active' && tenant.status !== 'trial') {
      throw new UnauthorizedException('Tenant account is not active');
    }

    const employee = await this.prisma.employee.findUnique({
      where: {
        tenantId_email: { email: loginDto.email, tenantId: tenant.id },
      },
    });

    if (!employee) throw new UnauthorizedException('Invalid credentials');
    
    if (employee.status === 'pending') {
      throw new UnauthorizedException('Your account is pending review. Please wait for company administrator approval.');
    }
    
    if (employee.status !== 'active') {
      throw new UnauthorizedException('Employee account is suspended or inactive');
    }

    const isPasswordValid = await argon2.verify(employee.password, loginDto.password);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');

    // --- Strict 1-Employee = 1-Device Binding Policy ---
    if (loginDto.deviceUuid) {
      const existingDevice = await this.prisma.device.findFirst({
        where: {
          employeeId: employee.id,
          isTrusted: true,
        },
      });

      if (existingDevice) {
        if (existingDevice.deviceUuid !== loginDto.deviceUuid) {
          throw new ForbiddenException({
            statusCode: 403,
            error: 'DEVICE_BOUND_TO_ANOTHER_PHONE',
            message: `This account is linked to another device (${existingDevice.deviceModel || 'Registered Device'}). Login from a new device is restricted to prevent tampering. Please contact HR to unlink your previous device.`,
            registeredDeviceModel: existingDevice.deviceModel,
            boundAt: existingDevice.createdAt,
          });
        } else {
          // Update device telemetry
          await this.prisma.device.update({
            where: { id: existingDevice.id },
            data: {
              deviceModel: loginDto.deviceModel || existingDevice.deviceModel,
              osVersion: loginDto.osVersion || existingDevice.osVersion,
              appVersion: loginDto.appVersion || existingDevice.appVersion,
            },
          });
        }
      } else {
        // First login: Register this device as the employee's official trusted device
        await this.prisma.device.upsert({
          where: {
            tenantId_deviceUuid: {
              tenantId: tenant.id,
              deviceUuid: loginDto.deviceUuid,
            },
          },
          update: {
            employeeId: employee.id,
            deviceModel: loginDto.deviceModel || 'Trusted Smartphone',
            platform: loginDto.platform || 'android',
            osVersion: loginDto.osVersion,
            appVersion: loginDto.appVersion,
            isTrusted: true,
          },
          create: {
            tenantId: tenant.id,
            employeeId: employee.id,
            deviceUuid: loginDto.deviceUuid,
            deviceModel: loginDto.deviceModel || 'Trusted Smartphone',
            platform: loginDto.platform || 'android',
            osVersion: loginDto.osVersion,
            appVersion: loginDto.appVersion,
            isTrusted: true,
          },
        });
      }
    }

    // Mobile specific token payload
    const payload = {
      sub: employee.id, // ID refers to Employee ID now!
      email: employee.email,
      tenantId: tenant.id,
      userType: 'employee',
      roles: ['employee'],
      permissions: [],
    };

    const accessToken = this.jwtService.sign(payload);
    
    return {
      accessToken,
      user: {
        id: employee.id,
        email: employee.email,
        firstName: employee.firstName,
        lastName: employee.lastName,
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        employeeNumber: employee.employeeNumber,
      }
    };
  }

  async biometricLogin(dto: BiometricLoginDto) {
    const cleanSlug = dto.tenantSlug ? dto.tenantSlug.trim() : '';
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        OR: [
          { slug: { equals: cleanSlug, mode: 'insensitive' } },
          { id: cleanSlug },
          { domain: { equals: cleanSlug, mode: 'insensitive' } },
          { name: { equals: cleanSlug, mode: 'insensitive' } },
        ],
      },
    });

    if (!tenant) throw new UnauthorizedException('Tenant not found');
    if (tenant.status !== 'active' && tenant.status !== 'trial') {
      throw new UnauthorizedException('Tenant account is not active');
    }

    const employee = await this.prisma.employee.findUnique({
      where: {
        tenantId_email: { email: dto.email, tenantId: tenant.id },
      },
      include: {
        devices: {
          where: { isTrusted: true },
        },
      },
    });

    if (!employee) throw new UnauthorizedException('Employee not found');
    if (employee.status !== 'active') {
      throw new UnauthorizedException('Employee account is inactive or suspended');
    }

    // Verify that this device is registered and trusted for this employee
    const trustedDevice = employee.devices.find((d) => d.deviceUuid === dto.deviceUuid);
    if (!trustedDevice) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'UNTRUSTED_DEVICE',
        message: 'Current device is not linked to this account. Please sign in with your password first to bind your trusted device.',
      });
    }

    // Update last active telemetry on device
    await this.prisma.device.update({
      where: { id: trustedDevice.id },
      data: {
        osVersion: dto.osVersion || trustedDevice.osVersion,
        appVersion: dto.appVersion || trustedDevice.appVersion,
        deviceModel: dto.deviceModel || trustedDevice.deviceModel,
      },
    });

    // Mobile specific token payload
    const payload = {
      sub: employee.id,
      email: employee.email,
      tenantId: tenant.id,
      userType: 'employee',
      roles: ['employee'],
      permissions: [],
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      user: {
        id: employee.id,
        email: employee.email,
        firstName: employee.firstName,
        lastName: employee.lastName,
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        employeeNumber: employee.employeeNumber,
      },
    };
  }

  async mobileRegister(dto: RegisterEmployeeDto) {
    const cleanSlug = dto.tenantSlug ? dto.tenantSlug.trim() : '';
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        OR: [
          { slug: { equals: cleanSlug, mode: 'insensitive' } },
          { id: cleanSlug },
          { domain: { equals: cleanSlug, mode: 'insensitive' } },
          { name: { equals: cleanSlug, mode: 'insensitive' } },
        ],
      },
    });

    if (!tenant) throw new UnauthorizedException('Company not found');

    const existingEmployee = await this.prisma.employee.findUnique({
      where: {
        tenantId_email: { email: dto.email, tenantId: tenant.id },
      },
    });

    if (existingEmployee) throw new BadRequestException('Email already in use for this company');

    const hashedPassword = await argon2.hash(dto.password);
    const empNumber = `EMP-${Math.floor(1000 + Math.random() * 9000)}`;

    const employee = await this.prisma.employee.create({
      data: {
        tenantId: tenant.id,
        email: dto.email,
        password: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        employeeNumber: empNumber,
        status: 'pending',
        jobTitle: 'Employee',
        joinDate: new Date(),
      },
    });

    return {
      message: 'Registered successfully. Your account is pending administrator approval.',
      user: {
        id: employee.id,
        email: employee.email,
        firstName: employee.firstName,
        lastName: employee.lastName,
      }
    };
  }
}
