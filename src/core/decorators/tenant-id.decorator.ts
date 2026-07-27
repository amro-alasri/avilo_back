import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const TenantId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    
    // First try to get it from the authenticated user's JWT payload
    if (request.user?.tenantId) {
      return request.user.tenantId;
    }
    
    // Fallback to custom header (useful for public endpoints like tenant lookup)
    const headerTenantId = request.headers['x-tenant-id'];
    return headerTenantId;
  },
);
