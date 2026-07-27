import { Controller, Post, Get, Delete, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { BillingService } from './billing.service';
import { CreateSubscriptionDto } from './dto/billing.dto';
import { JwtAuthGuard } from '../../core/guards/jwt-auth.guard.js';
import { PaginationDto } from '../../core/pagination/pagination.dto';

@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

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
