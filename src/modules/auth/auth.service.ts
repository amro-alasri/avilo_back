import { Injectable, UnauthorizedException, Inject, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../database/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';
import * as argon2 from 'argon2';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { authenticator } from 'otplib';
import * as qrcode from 'qrcode';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  async login(loginDto: LoginDto, tenantSlug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!tenant) throw new UnauthorizedException('Tenant not found');
    if (tenant.status !== 'active' && tenant.status !== 'trial') {
      throw new UnauthorizedException('Tenant account is not active');
    }

    const user = await this.prisma.user.findUnique({
      where: {
        email_tenantId: { email: loginDto.email, tenantId: tenant.id },
      },
      include: {
        roles: { include: { role: true } },
      },
    });

    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.status !== 'active') throw new UnauthorizedException('User account is suspended or inactive');

    const isPasswordValid = await argon2.verify(user.password, loginDto.password);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');

    const roles = user.roles.map((r) => r.role.name);
    const permissionsSet = new Set<string>();
    user.roles.forEach(r => {
       const perms = r.role.permissions as string[];
       perms.forEach(p => permissionsSet.add(p));
    });

    if (user.mfaEnabled) {
      // 2FA is required, issue a temp token valid for 5 minutes
      const tempPayload = {
        sub: user.id,
        tenantId: tenant.id,
        isTemp: true,
      };
      
      const tempToken = this.jwtService.sign(tempPayload, { expiresIn: '5m' });
      return {
        mfaRequired: true,
        tempToken,
      };
    }

    return this.generateTokens(user.id, user.email, tenant.id, roles, Array.from(permissionsSet), {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles,
    });
  }

  async authenticateWithTwoFactor(tempToken: string, code: string) {
    try {
      const payload = this.jwtService.verify(tempToken);
      if (!payload.isTemp) throw new UnauthorizedException('Invalid token type');

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { roles: { include: { role: true } } },
      });

      if (!user || !user.mfaSecret) throw new UnauthorizedException('2FA not configured properly');

      const isCodeValid = authenticator.verify({
        token: code,
        secret: user.mfaSecret,
      });

      if (!isCodeValid) throw new UnauthorizedException('Invalid 2FA code');

      const roles = user.roles.map((r) => r.role.name);
      const permissionsSet = new Set<string>();
      user.roles.forEach(r => {
         const perms = r.role.permissions as string[];
         perms.forEach(p => permissionsSet.add(p));
      });

      return this.generateTokens(user.id, user.email, user.tenantId, roles, Array.from(permissionsSet), {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles,
      });
    } catch (e) {
      throw new UnauthorizedException('Invalid 2FA verification');
    }
  }

  async generateTwoFactorAuthSecret(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { tenant: true } });
    if (!user) throw new UnauthorizedException();

    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(user.email, `Avilo HR (${user.tenant.name})`, secret);

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret },
    });

    const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);
    
    return {
      secret,
      qrCodeDataUrl,
    };
  }

  async turnOnTwoFactorAuth(userId: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfaSecret) throw new BadRequestException('MFA not initialized');

    const isCodeValid = authenticator.verify({
      token: code,
      secret: user.mfaSecret,
    });

    if (!isCodeValid) {
      throw new UnauthorizedException('Invalid authentication code');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: true },
    });

    return { success: true };
  }

  async disableTwoFactorAuth(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaEnabled: false, mfaSecret: null },
    });
    return { success: true };
  }

  private async generateTokens(userId: string, email: string, tenantId: string, roles: string[], permissions: string[], userObj: any) {
    const payload = {
      sub: userId,
      email,
      tenantId,
      roles,
      permissions,
    };

    const accessToken = this.jwtService.sign(payload);
    
    const refreshToken = this.jwtService.sign(payload, { 
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRY', '7d') as any
    });

    await this.cacheManager.set(`refresh_token:${userId}`, refreshToken, 7 * 24 * 60 * 60 * 1000);

    return {
      accessToken,
      refreshToken,
      user: userObj
    };
  }

  async refreshToken(token: string) {
    try {
      const payload = this.jwtService.verify(token);
      
      const storedToken = await this.cacheManager.get(`refresh_token:${payload.sub}`);
      
      if (!storedToken || storedToken !== token) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const newPayload = {
        sub: payload.sub,
        email: payload.email,
        tenantId: payload.tenantId,
        roles: payload.roles,
        permissions: payload.permissions,
      };

      const newAccessToken = this.jwtService.sign(newPayload);
      const newRefreshToken = this.jwtService.sign(newPayload, {
         expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRY', '7d') as any
      });

      await this.cacheManager.set(`refresh_token:${payload.sub}`, newRefreshToken, 7 * 24 * 60 * 60 * 1000);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch (e) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    await this.cacheManager.del(`refresh_token:${userId}`);
    return { success: true };
  }
}
