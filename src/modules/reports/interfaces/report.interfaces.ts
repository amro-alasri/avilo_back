export interface OverviewStats {
  totalEmployees: number;
  activeEmployees: number;
  todayPresentCount: number;
  todayAbsentCount: number;
  attendanceRate: number;        // percentage, 2 decimal places
  pendingLeaveRequests: number;
  currentMonthPayrollCost: number; // in cents
  employeeGrowthRate: number;    // percentage vs last month
}

export interface AttendanceTrendPoint {
  date: string;       // ISO date string YYYY-MM-DD
  present: number;
  absent: number;
  late: number;
}

export interface PayrollCostByDepartment {
  departmentId: string;
  departmentName: string;
  totalCost: number;   // in cents
  employeeCount: number;
  averageSalary: number; // in cents
}

export interface DemographicBreakdown {
  byGender: { gender: string; count: number }[];
  byContractType: { type: string; count: number }[];
  byDepartment: { department: string; count: number }[];
}
