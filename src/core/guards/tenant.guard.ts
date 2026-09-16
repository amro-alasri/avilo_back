import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';
import { PrismaService } from '../../database/prisma.service.js';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // SuperAdmin users acting globally bypass tenant validation
    const isSuperAdmin = user?.roles?.some((r: string) => r.toLowerCase() === 'superadmin');
    if (isSuperAdmin) {
      return true;
    }

    const tenantId = user?.tenantId || request.headers['x-tenant-id'];

    if (!tenantId || tenantId === 'system') {
      throw new UnauthorizedException('Tenant context is missing');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, status: true },
    });

    if (!tenant) {
      throw new UnauthorizedException('TENANT_NOT_FOUND: Company workspace no longer exists');
    }

    if (tenant.status === 'suspended' || tenant.status === 'cancelled') {
      throw new UnauthorizedException('TENANT_INACTIVE: Company workspace is currently deactivated');
    }

    return true;
  }
}
