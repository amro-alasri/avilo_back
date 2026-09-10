import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_FEATURE_KEY } from '../decorators/require-feature.decorator.js';
import { SubscriptionPolicyService, SubFeatureKey } from '../../modules/billing/subscription-policy.service.js';

@Injectable()
export class RequireFeatureGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private subscriptionPolicyService: SubscriptionPolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<SubFeatureKey>(REQUIRE_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredFeature) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const tenantId = request.user?.tenantId || (request.headers['x-tenant-id'] as string);

    // SuperAdmin users bypass company feature locks
    const roles: string[] = request.user?.roles || [];
    if (roles.includes('SuperAdmin')) {
      return true;
    }

    if (!tenantId) {
      return false;
    }

    await this.subscriptionPolicyService.assertHasFeature(tenantId, requiredFeature);
    return true;
  }
}
