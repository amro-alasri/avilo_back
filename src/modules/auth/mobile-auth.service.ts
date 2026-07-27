import { Injectable, UnauthorizedException, BadRequestException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service.js';
import * as argon2 from 'argon2';
import { ConfigService } from '@nestjs/config';
import { RegisterEmployeeDto } from './dto/register-employee.dto.js';
import { LoginDto } from './dto/login.dto.js';

@Injectable()
export class MobileAuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async mobileLogin(loginDto: LoginDto, tenantSlug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
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
      throw new UnauthorizedException('حسابك قيد المراجعة. يرجى الانتظار حتى يتم الموافقة عليه.');
    }
    
    if (employee.status !== 'active') {
      throw new UnauthorizedException('Employee account is suspended or inactive');
    }

    const isPasswordValid = await argon2.verify(employee.password, loginDto.password);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');

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
        employeeNumber: employee.employeeNumber,
      }
    };
  }

  async mobileRegister(dto: RegisterEmployeeDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.tenantSlug },
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
      message: 'تم التسجيل بنجاح. حسابك قيد المراجعة.',
      user: {
        id: employee.id,
        email: employee.email,
        firstName: employee.firstName,
        lastName: employee.lastName,
      }
    };
  }
}
