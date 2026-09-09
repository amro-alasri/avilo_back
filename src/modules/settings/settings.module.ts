import { Module } from '@nestjs/common';
import { SettingsService } from './settings.service.js';
import { SettingsController } from './settings.controller.js';
import { MailModule } from '../mail/mail.module.js';

@Module({
  imports: [MailModule],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
