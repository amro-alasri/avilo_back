import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './database/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';

import { TenantsModule } from './modules/tenants/tenants.module.js';
import { OrganizationsModule } from './modules/organizations/organizations.module.js';
import { EmployeesModule } from './modules/employees/employees.module.js';
import { UploadsModule } from './modules/uploads/uploads.module.js';
import { AttendancesModule } from './modules/attendances/attendances.module';
import { LeavesModule } from './modules/leaves/leaves.module';
import { SchedulesModule } from './modules/schedules/schedules.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { BillingModule } from './modules/billing/billing.module';
import { ReportsModule } from './modules/reports/reports.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),
    PrismaModule,
    AuthModule,
    TenantsModule,
    OrganizationsModule,
    EmployeesModule,
    UploadsModule,
    AttendancesModule,
    LeavesModule,
    SchedulesModule,
    PayrollModule,
    BillingModule,
    ReportsModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
