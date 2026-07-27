import { Controller, Post, Body, HttpCode, HttpStatus, Headers, Request, UseGuards, Get } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { Public } from '../../core/decorators/public.decorator.js';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() loginDto: LoginDto, @Headers('x-tenant-slug') tenantSlug: string) {
    return this.authService.login(loginDto, tenantSlug);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refreshToken(@Body('refreshToken') refreshToken: string) {
    return this.authService.refreshToken(refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Request() req) {
    return this.authService.logout(req.user.userId);
  }

  // 2FA Endpoints

  @UseGuards(JwtAuthGuard)
  @Post('2fa/generate')
  async generateTwoFactorAuth(@Request() req) {
    // We use req.user.sub or req.user.userId based on our payload. Wait, our payload has sub.
    // the JwtAuthGuard returns user with whatever validate returns.
    // Wait, the new jwt strategy returns { userId, email, tenantId, roles, permissions }
    // Let me check jwt.strategy.ts!
    return this.authService.generateTwoFactorAuthSecret(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/turn-on')
  @HttpCode(HttpStatus.OK)
  async turnOnTwoFactorAuth(@Request() req, @Body('code') code: string) {
    return this.authService.turnOnTwoFactorAuth(req.user.userId, code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  async disableTwoFactorAuth(@Request() req) {
    return this.authService.disableTwoFactorAuth(req.user.userId);
  }

  @Public()
  @Post('2fa/authenticate')
  @HttpCode(HttpStatus.OK)
  async authenticateWithTwoFactor(
    @Body('tempToken') tempToken: string,
    @Body('code') code: string,
  ) {
    return this.authService.authenticateWithTwoFactor(tempToken, code);
  }
}

