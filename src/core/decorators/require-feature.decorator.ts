import { SetMetadata } from '@nestjs/common';
import type { SubFeatureKey } from '../../modules/billing/subscription-policy.service.js';

export const REQUIRE_FEATURE_KEY = 'require_feature';
export const RequireFeature = (feature: SubFeatureKey) => SetMetadata(REQUIRE_FEATURE_KEY, feature);
