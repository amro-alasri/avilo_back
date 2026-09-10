import { Module } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { SalaryStructuresService } from './salary-structures.service';
import { PayrollController } from './payroll.controller';
import { PrismaModule } from '../../database/prisma.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [PrismaModule, BillingModule],
  controllers: [PayrollController],
  providers: [PayrollService, SalaryStructuresService],
  exports: [PayrollService, SalaryStructuresService],
})
export class PayrollModule {}
