import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

import {
  OverviewStats,
  AttendanceTrendPoint,
  PayrollCostByDepartment,
  DemographicBreakdown
} from './interfaces/report.interfaces';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async getOverview(tenantId: string): Promise<OverviewStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const firstDayOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    
    // We fetch everything in parallel for maximum performance
    const [
      totalEmployees,
      activeEmployees,
      todayAttendances,
      pendingLeaves,
      latestPayroll,
      lastMonthEmployeeCount,
    ] = await Promise.all([
      this.prisma.employee.count({ where: { tenantId } }),
      this.prisma.employee.count({ where: { tenantId, status: 'active' } }),
      
      this.prisma.attendance.groupBy({
        by: ['status'],
        where: { tenantId, date: { gte: today, lt: tomorrow } },
        _count: true,
      }),
      
      this.prisma.leaveRequest.count({ where: { tenantId, status: 'pending' } }),
      
      this.prisma.payrollRun.findFirst({
        where: { tenantId, status: 'completed' },
        orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
        select: { totalAmount: true },
      }),
      
      this.prisma.employee.count({
        where: { tenantId, createdAt: { lt: firstDayOfThisMonth } }
      }),
    ]);

    let present = 0;
    let absent = 0;
    
    for (const group of todayAttendances) {
      if (group.status === 'present' || group.status === 'late') {
        present += group._count;
      } else if (group.status === 'absent') {
        absent += group._count;
      }
    }

    const attendanceRate = activeEmployees > 0 
      ? Math.round((present / activeEmployees) * 10000) / 100 
      : 0;

    let growthRate = 0;
    if (lastMonthEmployeeCount > 0) {
      growthRate = Math.round(((totalEmployees - lastMonthEmployeeCount) / lastMonthEmployeeCount) * 10000) / 100;
    } else if (totalEmployees > 0) {
      growthRate = 100;
    }

    return {
      totalEmployees,
      activeEmployees,
      todayPresentCount: present,
      todayAbsentCount: absent,
      attendanceRate,
      pendingLeaveRequests: pendingLeaves,
      currentMonthPayrollCost: latestPayroll?.totalAmount || 0,
      employeeGrowthRate: growthRate,
    };
  }

  async getAttendanceTrends(tenantId: string, days: number = 30): Promise<AttendanceTrendPoint[]> {
    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - days + 1);

    // Group by Date and Status
    const grouped = await this.prisma.attendance.groupBy({
      by: ['date', 'status'],
      where: {
        tenantId,
        date: { gte: startDate },
      },
      _count: true,
    });

    // Map the grouped data to a continuous timeline
    const trendMap = new Map<string, AttendanceTrendPoint>();
    
    // Initialize map with all dates
    for (let i = 0; i < days; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const iso = d.toISOString().split('T')[0];
      trendMap.set(iso, { date: iso, present: 0, absent: 0, late: 0 });
    }

    // Populate data
    for (const group of grouped) {
      const iso = group.date.toISOString().split('T')[0];
      const point = trendMap.get(iso);
      if (point) {
        if (group.status === 'present') point.present += group._count;
        if (group.status === 'absent') point.absent += group._count;
        if (group.status === 'late') point.late += group._count;
      }
    }

    return Array.from(trendMap.values());
  }

  async getPayrollByDepartment(tenantId: string): Promise<PayrollCostByDepartment[]> {
    // This is an advanced raw SQL query to get accurate results without N+1 problem.
    // We join departments, employees, and the LATEST completed payroll run for the tenant.
    
    return this.prisma.$queryRaw<PayrollCostByDepartment[]>`
      SELECT
        d.id as "departmentId",
        d.name as "departmentName",
        COALESCE(SUM(p.net_salary), 0)::float as "totalCost",
        COUNT(DISTINCT e.id)::int as "employeeCount",
        COALESCE(AVG(p.net_salary), 0)::float as "averageSalary"
      FROM departments d
      LEFT JOIN employees e ON e.department_id = d.id AND e.tenant_id = ${tenantId}
      LEFT JOIN payslips p ON p.employee_id = e.id
        AND p.payroll_run_id = (
          SELECT id FROM payroll_runs
          WHERE tenant_id = ${tenantId} AND status = 'completed'
          ORDER BY period_year DESC, period_month DESC
          LIMIT 1
        )
      WHERE d.tenant_id = ${tenantId}
      GROUP BY d.id, d.name
      ORDER BY "totalCost" DESC
    `;
  }

  async getDemographics(tenantId: string): Promise<DemographicBreakdown> {
    const [genderRaw, contractsRaw, departmentsRaw] = await Promise.all([
      this.prisma.employee.groupBy({
        by: ['gender'],
        where: { tenantId, status: 'active', gender: { not: null } },
        _count: true,
      }),
      
      this.prisma.contract.groupBy({
        by: ['type'],
        where: { tenantId, status: 'active' },
        _count: true,
      }),

      this.prisma.employee.groupBy({
        by: ['departmentId'],
        where: { tenantId, status: 'active', departmentId: { not: null } },
        _count: true,
      }),
    ]);

    // Format genders
    const byGender = genderRaw.map(g => ({
      gender: g.gender as string,
      count: g._count,
    }));

    // Format contracts
    const byContractType = contractsRaw.map(c => ({
      type: c.type.replace('_', ' ').toUpperCase(),
      count: c._count,
    }));

    // Format departments (we need names, so we query them)
    let byDepartment: { department: string; count: number }[] = [];
    if (departmentsRaw.length > 0) {
      const deptIds = departmentsRaw.map(d => d.departmentId);
      const depts = await this.prisma.department.findMany({
        where: { id: { in: deptIds as string[] } },
        select: { id: true, name: true },
      });
      
      byDepartment = departmentsRaw.map(dr => {
        const dName = depts.find(d => d.id === dr.departmentId)?.name || 'Unknown';
        return { department: dName, count: dr._count };
      });
    }

    return {
      byGender,
      byContractType,
      byDepartment,
    };
  }
}
