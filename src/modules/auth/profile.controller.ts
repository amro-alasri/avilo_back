import { Controller, Get, Put, Body, Request, UseGuards, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard.js';
import { PrismaService } from '../../database/prisma.service.js';
import * as argon2 from 'argon2';

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private prisma: PrismaService) {}

  @Get('me')
  async getProfile(@Request() req) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        status: true,
        mfaEnabled: true,
        createdAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            domain: true,
            plan: true,
            status: true,
            settings: true,
          },
        },
        roles: {
          select: {
            role: {
              select: {
                id: true,
                name: true,
                permissions: true,
              },
            },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User profile not found');
    return user;
  }

  @Put('update')
  async updateProfile(
    @Request() req,
    @Body() body: { firstName?: string; lastName?: string; email?: string },
  ) {
    const { firstName, lastName, email } = body;

    if (email) {
      const existing = await this.prisma.user.findFirst({
        where: {
          email,
          tenantId: req.user.tenantId,
          id: { not: req.user.userId },
        },
      });
      if (existing) {
        throw new BadRequestException('Email is already registered by another account in this organization');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: req.user.userId },
      data: {
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        ...(email ? { email } : {}),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        mfaEnabled: true,
      },
    });

    return updated;
  }

  @Put('password')
  async updatePassword(
    @Request() req,
    @Body() body: { currentPassword?: string; newPassword?: string },
  ) {
    const { currentPassword, newPassword } = body;
    if (!currentPassword || !newPassword) {
      throw new BadRequestException('Current password and new password are required');
    }
    if (newPassword.length < 6) {
      throw new BadRequestException('New password must be at least 6 characters long');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, password: true },
    });

    if (!user) throw new NotFoundException('User not found');

    const isValid = await argon2.verify(user.password, currentPassword);
    if (!isValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    const hashedPassword = await argon2.hash(newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    return { success: true, message: 'Password updated successfully' };
  }
}
