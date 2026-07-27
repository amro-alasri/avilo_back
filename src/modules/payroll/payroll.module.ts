import { Module } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { SalaryStructuresService } from './salary-structures.service';
import { PayrollController } from './payroll.controller';
import { PrismaModule } from '../../database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PayrollController],
  providers: [PayrollService, SalaryStructuresService],
  exports: [PayrollService, SalaryStructuresService],
})
export class PayrollModule {}
