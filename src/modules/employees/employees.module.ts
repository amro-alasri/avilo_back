import { Module } from '@nestjs/common';
import { EmployeesService } from './employees.service.js';
import { EmployeesController } from './employees.controller.js';
import { PrismaModule } from '../../database/prisma.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { BillingModule } from '../billing/billing.module.js';

@Module({
  imports: [PrismaModule, SettingsModule, BillingModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
