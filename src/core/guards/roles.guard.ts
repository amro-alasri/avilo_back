import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles && !requiredPermissions) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      return false;
    }

    const hasRole = () => requiredRoles ? user.roles?.some((role: string) => requiredRoles.includes(role)) : true;
    const hasPermission = () => requiredPermissions ? user.permissions?.some((perm: string) => requiredPermissions.includes(perm)) : true;

    if (requiredRoles && !hasRole()) {
       throw new ForbiddenException('Insufficient role');
    }

    if (requiredPermissions && !hasPermission()) {
       throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
