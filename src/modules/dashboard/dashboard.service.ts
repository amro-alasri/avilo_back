import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getOverviewStats(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      totalEmployees,
      presentTodayCount,
      onLeaveCount,
      activeBranches,
      recentActivity
    ] = await Promise.all([
      // Total Employees
      this.prisma.user.count({
        where: { tenantId, status: 'active' },
      }),
      // Present Today
      this.prisma.attendance.count({
        where: {
          tenantId,
          checkIn: { gte: today, lt: tomorrow },
        },
      }),
      // On Leave
      this.prisma.leaveRequest.count({
        where: {
          tenantId,
          status: 'approved',
          startDate: { lte: today },
          endDate: { gte: today },
        },
      }),
      // Active Branches
      this.prisma.branch.count({
        where: { tenantId },
      }),
      // Recent Activity
      this.prisma.attendance.findMany({
        where: { tenantId },
        orderBy: { checkIn: 'desc' },
        take: 4,
        include: {
          employee: {
            include: {
              user: {
                select: { firstName: true, lastName: true },
              },
            },
          },
        },
      })
    ]);

    // Format recent activity
    const activityFormatted = recentActivity.map((record) => ({
      id: record.id,
      message: `${record.employee.user.firstName} ${record.employee.user.lastName} checked in`,
      time: record.checkIn,
      branch: 'Main Branch', // Could be fetched from shift/branch
    }));

    return {
      stats: {
        totalEmployees,
        presentToday: presentTodayCount,
        onLeave: onLeaveCount,
        activeBranches,
      },
      recentActivity: activityFormatted,
    };
  }
}
