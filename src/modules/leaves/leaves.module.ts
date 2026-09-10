import { Module } from '@nestjs/common';
import { LeavesService } from './leaves.service.js';
import { LeavesController } from './leaves.controller.js';
import { PrismaModule } from '../../database/prisma.module.js';
import { BillingModule } from '../billing/billing.module.js';

@Module({
  imports: [PrismaModule, BillingModule],
  controllers: [LeavesController],
  providers: [LeavesService],
  exports: [LeavesService],
})
export class LeavesModule {}
