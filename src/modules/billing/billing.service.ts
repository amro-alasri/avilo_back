import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateSubscriptionDto } from './dto/billing.dto';
import { PaginationDto } from '../../core/pagination/pagination.dto';

const PLAN_PRICES = {
  free: 0,
  starter: 2900,      // $29.00
  professional: 9900, // $99.00
  enterprise: 29900   // $299.00
};

@Injectable()
export class BillingService {
  constructor(private prisma: PrismaService) {}

  async createSubscription(tenantId: string, dto: CreateSubscriptionDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) throw new NotFoundException('Tenant not found');

    return this.prisma.$transaction(async (tx) => {
      // Deactivate any existing active subscriptions
      await tx.subscription.updateMany({
        where: { tenantId, status: 'active' },
        data: { status: 'cancelled', endDate: new Date() },
      });

      // Create new subscription
      const sub = await tx.subscription.create({
        data: {
          tenantId,
          plan: dto.plan as any,
          billingCycle: dto.billingCycle,
          startDate: new Date(dto.startDate),
          status: 'active',
        },
      });

      // Update tenant plan
      await tx.tenant.update({
        where: { id: tenantId },
        data: { plan: dto.plan as any },
      });

      return sub;
    });
  }

  async getSubscription(tenantId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { tenantId, status: 'active' },
      orderBy: { createdAt: 'desc' },
    });
    return sub;
  }

  async cancelSubscription(tenantId: string, subscriptionId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!sub || sub.tenantId !== tenantId) {
      throw new NotFoundException('Subscription not found');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id: subscriptionId },
        data: { status: 'cancelled', endDate: new Date() },
      });

      await tx.tenant.update({
        where: { id: tenantId },
        data: { plan: 'free' },
      });
      return { success: true };
    });
  }

  async generateInvoice(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) throw new NotFoundException('Tenant not found');

    const amount = PLAN_PRICES[tenant.plan] || 0;
    
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14); // 14 days to pay

    const invoice = await this.prisma.invoice.create({
      data: {
        tenantId,
        amount,
        status: amount === 0 ? 'paid' : 'pending',
        dueDate,
      },
    });

    return invoice;
  }

  async listInvoices(tenantId: string, pagination: PaginationDto) {
    const { page = 1, limit = 10 } = pagination;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { tenantId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.invoice.count({ where: { tenantId } }),
    ]);

    return {
      data,
      meta: {
        totalItems: total,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
      },
    };
  }

  async markInvoicePaid(tenantId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice || invoice.tenantId !== tenantId) {
      throw new NotFoundException('Invoice not found');
    }

    if (invoice.status === 'paid') {
      throw new BadRequestException('Invoice is already paid');
    }

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'paid' },
    });
  }
}
