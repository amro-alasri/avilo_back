import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { MobileAuthService } from './mobile-auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterEmployeeDto } from './dto/register-employee.dto.js';
import { Public } from '../../core/decorators/public.decorator.js';

@Public()
@Controller('mobile/auth')
export class MobileAuthController {
  constructor(private readonly mobileAuthService: MobileAuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() loginDto: LoginDto, @Body('tenantSlug') tenantSlug: string) {
    return this.mobileAuthService.mobileLogin(loginDto, tenantSlug);
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterEmployeeDto) {
    return this.mobileAuthService.mobileRegister(dto);
  }
}
