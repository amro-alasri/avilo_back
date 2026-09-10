import { Injectable, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';

export type SubFeatureKey =
  | 'hasPayroll'
  | 'hasLeaves'
  | 'hasVoiceBiometrics'
  | 'hasFaceBiometrics';

const FEATURE_NAMES: Record<SubFeatureKey, string> = {
  hasPayroll: 'Payroll Management',
  hasLeaves: 'Leave Management',
  hasVoiceBiometrics: 'Voice Biometrics Verification',
  hasFaceBiometrics: 'Face Biometrics Verification',
};

@Injectable()
export class SubscriptionPolicyService {
  private readonly logger = new Logger(SubscriptionPolicyService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Retrieves the currently active subscription for a tenant.
   * If no active subscription exists, returns null.
   */
  async getActiveSubscription(tenantId: string) {
    if (!tenantId) return null;
    return this.prisma.subscription.findFirst({
      where: {
        tenantId,
        status: 'active',
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Asserts that the tenant has an active subscription and employee capacity has not been exceeded.
   */
  async assertCanAddEmployee(tenantId: string): Promise<void> {
    const sub = await this.getActiveSubscription(tenantId);
    if (!sub) {
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_REQUIRED',
        message:
          'Your company workspace does not have an active subscription license. Adding employees is locked until a subscription plan is assigned by your system administrator.',
      });
    }

    const maxEmployees = sub.maxEmployees ?? 10;
    const currentActiveEmployees = await this.prisma.employee.count({
      where: {
        tenantId,
        status: { not: 'terminated' },
      },
    });

    if (currentActiveEmployees >= maxEmployees) {
      throw new BadRequestException({
        code: 'EMPLOYEE_QUOTA_EXCEEDED',
        max: maxEmployees,
        current: currentActiveEmployees,
        message: `Employee seat quota reached (${currentActiveEmployees}/${maxEmployees} employees). Please upgrade your subscription plan or contact your administrator to add more employees.`,
      });
    }
  }

  /**
   * Asserts that the tenant has an active subscription and location/branch capacity has not been exceeded.
   */
  async assertCanAddBranch(tenantId: string): Promise<void> {
    const sub = await this.getActiveSubscription(tenantId);
    if (!sub) {
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_REQUIRED',
        message:
          'Your company workspace does not have an active subscription license. Adding branches is locked until a subscription plan is assigned by your system administrator.',
      });
    }

    const maxLocations = sub.maxLocations ?? 1;
    const currentBranches = await this.prisma.branch.count({
      where: { tenantId },
    });

    if (currentBranches >= maxLocations) {
      throw new BadRequestException({
        code: 'LOCATION_QUOTA_EXCEEDED',
        max: maxLocations,
        current: currentBranches,
        message: `Branch location quota reached (${currentBranches}/${maxLocations} branches). Please upgrade your subscription plan or contact your administrator to register additional locations.`,
      });
    }
  }

  /**
   * Asserts that a specific subscription module feature is included and enabled in the tenant plan.
   */
  async assertHasFeature(tenantId: string, feature: SubFeatureKey): Promise<void> {
    const sub = await this.getActiveSubscription(tenantId);
    const featureLabel = FEATURE_NAMES[feature] || feature;

    if (!sub) {
      throw new ForbiddenException({
        code: 'SUBSCRIPTION_REQUIRED',
        feature,
        message: `Your company workspace does not have an active subscription license. The ${featureLabel} module is locked.`,
      });
    }

    const isEnabled = Boolean(sub[feature]);
    if (!isEnabled) {
      throw new ForbiddenException({
        code: 'FEATURE_NOT_INCLUDED',
        feature,
        message: `The ${featureLabel} module is not included in your company's active subscription tier. Please contact your administrator to upgrade.`,
      });
    }
  }
}
