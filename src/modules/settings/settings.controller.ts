import { Controller, Get, Post, Patch, Body, Request, UseGuards, BadRequestException } from '@nestjs/common';
import { SettingsService } from './settings.service.js';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard.js';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('email')
  getEmailConfig(@Request() req) {
    const tenantId = req.user.tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context is required');
    return this.settingsService.getEmailConfigForClient(tenantId);
  }

  @Post('email')
  updateEmailConfig(@Request() req, @Body() data: any) {
    const tenantId = req.user.tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context is required');
    return this.settingsService.updateEmailConfig(tenantId, data);
  }

  @Post('email/test')
  testEmailConfig(@Request() req, @Body() body: { config: any; recipientEmail: string }) {
    const tenantId = req.user.tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context is required');
    if (!body.recipientEmail) throw new BadRequestException('Recipient email is required for test');
    return this.settingsService.testEmailConfig(tenantId, body.config, body.recipientEmail);
  }

  @Get('preferences')
  getPreferences(@Request() req) {
    const tenantId = req.user.tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context is required');
    return this.settingsService.getPreferences(tenantId);
  }

  @Patch('preferences')
  updatePreferences(@Request() req, @Body() data: any) {
    const tenantId = req.user.tenantId;
    if (!tenantId) throw new BadRequestException('Tenant context is required');
    return this.settingsService.updatePreferences(tenantId, data);
  }
}
