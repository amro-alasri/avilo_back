import { Module } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { PrismaModule } from '../../database/prisma.module';
import { MailModule } from '../mail/mail.module';
import { SettingsModule } from '../settings/settings.module';
import { SubscriptionPolicyService } from './subscription-policy.service';

@Module({
  imports: [PrismaModule, MailModule, SettingsModule],
  controllers: [BillingController],
  providers: [BillingService, SubscriptionPolicyService],
  exports: [BillingService, SubscriptionPolicyService],
})
export class BillingModule {}
