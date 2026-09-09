import { Controller, Post, Get, Delete, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { BillingService } from './billing.service';
import { CreateSubscriptionDto } from './dto/billing.dto';
import { CreateAdminSubscriptionDto, UpdateAdminSubscriptionDto } from './dto/admin-subscription.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../core/guards/roles.guard.js';
import { Roles } from '../../core/decorators/roles.decorator.js';
import { PaginationDto } from '../../core/pagination/pagination.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  // =========================================================================
  // SuperAdmin Routes
  // =========================================================================

  @Roles('SuperAdmin')
  @Get('admin/subscriptions')
  findAllAdminSubscriptions(@Query() query: any) {
    return this.billingService.findAllAdminSubscriptions(query);
  }

  @Roles('SuperAdmin')
  @Get('admin/subscriptions/:id')
  findAdminSubscriptionById(@Param('id') id: string) {
    return this.billingService.findAdminSubscriptionById(id);
  }

  @Roles('SuperAdmin')
  @Post('admin/subscriptions')
  createAdminSubscription(@Body() dto: CreateAdminSubscriptionDto) {
    return this.billingService.createAdminSubscription(dto);
  }

  @Roles('SuperAdmin')
  @Patch('admin/subscriptions/:id')
  updateAdminSubscription(@Param('id') id: string, @Body() dto: UpdateAdminSubscriptionDto) {
    return this.billingService.updateAdminSubscription(id, dto);
  }

  @Roles('SuperAdmin')
  @Delete('admin/subscriptions/:id')
  cancelAdminSubscription(@Param('id') id: string) {
    return this.billingService.cancelAdminSubscription(id);
  }

  @Roles('SuperAdmin')
  @Post('admin/subscriptions/:id/resend-email')
  resendSubscriptionEmail(@Param('id') id: string) {
    return this.billingService.resendSubscriptionEmail(id);
  }

  // =========================================================================
  // Tenant-Facing Routes (Company Dashboard)
  // =========================================================================

  @Get('tenant/overview')
  getTenantOverview(@Request() req) {
    return this.billingService.getTenantOverview(req.user.tenantId);
  }

  @Get('tenant/history')
  getTenantHistory(@Request() req) {
    return this.billingService.getTenantHistory(req.user.tenantId);
  }

  // =========================================================================
  // Backward-Compatible Routes
  // =========================================================================

  @Post('subscriptions')
  createSubscription(@Request() req, @Body() dto: CreateSubscriptionDto) {
    return this.billingService.createSubscription(req.user.tenantId, dto);
  }

  @Get('subscriptions/active')
  getSubscription(@Request() req) {
    return this.billingService.getSubscription(req.user.tenantId);
  }

  @Delete('subscriptions/:id')
  cancelSubscription(@Request() req, @Param('id') id: string) {
    return this.billingService.cancelSubscription(req.user.tenantId, id);
  }

  @Post('invoices/generate')
  generateInvoice(@Request() req) {
    return this.billingService.generateInvoice(req.user.tenantId);
  }

  @Get('invoices')
  listInvoices(@Request() req, @Query() pagination: PaginationDto) {
    return this.billingService.listInvoices(req.user.tenantId, pagination);
  }

  @Patch('invoices/:id/pay')
  markInvoicePaid(@Request() req, @Param('id') id: string) {
    return this.billingService.markInvoicePaid(req.user.tenantId, id);
  }
}
