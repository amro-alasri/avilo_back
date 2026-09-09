import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateSubscriptionDto } from './dto/billing.dto';
import { CreateAdminSubscriptionDto, UpdateAdminSubscriptionDto } from './dto/admin-subscription.dto';
import { PaginationDto } from '../../core/pagination/pagination.dto';
import { MailService } from '../mail/mail.service';
import { format, differenceInDays } from 'date-fns';

const PLAN_PRICES = {
  free: 0,
  starter: 2900,      // $29.00
  professional: 9900, // $99.00
  enterprise: 29900   // $299.00
};

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  // =========================================================================
  // 1. Overlapping Date Prevention Engine
  // =========================================================================

  /**
   * Verifies that the requested subscription dates do not overlap with any
   * existing active or pending subscription for the given tenant.
   * Overlap condition: (existingStart <= newEnd) AND (existingEnd >= newStart OR existingEnd IS NULL)
   */
  async checkDateOverlap(tenantId: string, startDateStr: string, endDateStr: string, excludeSubId?: string) {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new BadRequestException('صيغة التواريخ غير صحيحة / Invalid date format');
    }

    if (end <= start) {
      throw new BadRequestException('تاريخ انتهاء الاشتراك يجب أن يكون بعد تاريخ البدء / End date must be strictly after start date');
    }

    const overlapping = await this.prisma.subscription.findFirst({
      where: {
        tenantId,
        status: { in: ['active', 'pending'] },
        ...(excludeSubId ? { id: { not: excludeSubId } } : {}),
        AND: [
          { startDate: { lte: end } },
          {
            OR: [
              { endDate: { gte: start } },
              { endDate: null },
            ],
          },
        ],
      },
      include: {
        tenant: { select: { name: true, slug: true } },
      },
    });

    if (overlapping) {
      const existingStart = format(new Date(overlapping.startDate), 'yyyy-MM-dd');
      const existingEnd = overlapping.endDate ? format(new Date(overlapping.endDate), 'yyyy-MM-dd') : 'مفتوح (Open-ended)';
      throw new ConflictException(
        `تتعارض فترة الاشتراك المحددة (${format(start, 'yyyy-MM-dd')} إلى ${format(end, 'yyyy-MM-dd')}) مع اشتراك نشط حالياً للشركة للفترة من (${existingStart} إلى ${existingEnd}) لخطة (${overlapping.plan}). يرجى اختيار فترة غير متقاطعة.`
      );
    }
  }

  // =========================================================================
  // 2. SuperAdmin Subscriptions Management
  // =========================================================================

  /**
   * Create a new subscription for a tenant with feature entitlements and quota limits.
   * Also verifies non-overlapping dates and sends an email notification.
   */
  async createAdminSubscription(dto: CreateAdminSubscriptionDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
      include: {
        settings: true,
        users: { take: 1, orderBy: { createdAt: 'asc' } },
      },
    });

    if (!tenant) {
      throw new NotFoundException('الشركة غير موجودة / Tenant not found');
    }

    // 1. Strict overlap check
    await this.checkDateOverlap(dto.tenantId, dto.startDate, dto.endDate);

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    const now = new Date();

    // Determine initial status based on start date
    let status = dto.status || 'active';
    if (!dto.status) {
      if (startDate > now) {
        status = 'pending';
      } else if (endDate < now) {
        status = 'expired';
      } else {
        status = 'active';
      }
    }

    // 2. Database transaction
    const subscription = await this.prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.create({
        data: {
          tenantId: dto.tenantId,
          plan: dto.plan,
          status,
          billingCycle: dto.billingCycle || 'monthly',
          startDate,
          endDate,
          price: dto.price ?? 0,
          currency: dto.currency || 'USD',
          maxEmployees: dto.maxEmployees,
          maxLocations: dto.maxLocations,
          hasPayroll: dto.hasPayroll,
          hasLeaves: dto.hasLeaves,
          hasVoiceBiometrics: dto.hasVoiceBiometrics,
          hasFaceBiometrics: dto.hasFaceBiometrics,
          features: {
            maxEmployees: dto.maxEmployees,
            maxLocations: dto.maxLocations,
            hasPayroll: dto.hasPayroll,
            hasLeaves: dto.hasLeaves,
            hasVoiceBiometrics: dto.hasVoiceBiometrics,
            hasFaceBiometrics: dto.hasFaceBiometrics,
          },
        },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
              domain: true,
              contactEmail: true,
              contactPhone: true,
            },
          },
        },
      });

      // Synchronize tenant active plan if this subscription is active
      if (status === 'active') {
        await tx.tenant.update({
          where: { id: dto.tenantId },
          data: {
            plan: dto.plan,
            status: 'active',
          },
        });
      }

      return sub;
    });

    // 3. Automated Email Notification
    let emailDispatched = false;
    let emailError: string | undefined;

    if (dto.sendEmail !== false) {
      const emailRes = await this.dispatchSubscriptionEmail(subscription);
      emailDispatched = emailRes.success;
      emailError = emailRes.error;
    }

    return {
      ...subscription,
      emailDispatched,
      emailError,
    };
  }

  /**
   * SuperAdmin: List all subscriptions with tenant details, filters, and pagination.
   */
  async findAllAdminSubscriptions(query: {
    page?: number;
    limit?: number;
    search?: string;
    tenantId?: string;
    status?: string;
    plan?: string;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.tenantId) {
      where.tenantId = query.tenantId;
    }

    if (query.status && query.status !== 'all') {
      where.status = query.status;
    }

    if (query.plan && query.plan !== 'all') {
      where.plan = query.plan;
    }

    if (query.search && query.search.trim() !== '') {
      const s = query.search.trim();
      where.OR = [
        { tenant: { name: { contains: s, mode: 'insensitive' } } },
        { tenant: { slug: { contains: s, mode: 'insensitive' } } },
        { tenant: { contactEmail: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.subscription.count({ where }),
      this.prisma.subscription.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
              domain: true,
              contactEmail: true,
              contactPhone: true,
            },
          },
        },
      }),
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

  /**
   * SuperAdmin: Get details of a single subscription.
   */
  async findAdminSubscriptionById(id: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            domain: true,
            contactEmail: true,
            contactPhone: true,
          },
        },
      },
    });

    if (!sub) throw new NotFoundException('Subscription not found');
    return sub;
  }

  /**
   * SuperAdmin: Update subscription details with non-overlapping date verification.
   */
  async updateAdminSubscription(id: string, dto: UpdateAdminSubscriptionDto) {
    const current = await this.findAdminSubscriptionById(id);

    const startDateStr = dto.startDate || current.startDate.toISOString();
    const endDateStr = dto.endDate || (current.endDate ? current.endDate.toISOString() : new Date().toISOString());

    // Check overlap if dates or status are changing
    if (dto.startDate || dto.endDate || dto.status === 'active') {
      await this.checkDateOverlap(current.tenantId, startDateStr, endDateStr, id);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.update({
        where: { id },
        data: {
          ...(dto.plan ? { plan: dto.plan } : {}),
          ...(dto.billingCycle ? { billingCycle: dto.billingCycle } : {}),
          ...(dto.startDate ? { startDate: new Date(dto.startDate) } : {}),
          ...(dto.endDate ? { endDate: new Date(dto.endDate) } : {}),
          ...(dto.price !== undefined ? { price: dto.price } : {}),
          ...(dto.currency ? { currency: dto.currency } : {}),
          ...(dto.maxEmployees !== undefined ? { maxEmployees: dto.maxEmployees } : {}),
          ...(dto.maxLocations !== undefined ? { maxLocations: dto.maxLocations } : {}),
          ...(dto.hasPayroll !== undefined ? { hasPayroll: dto.hasPayroll } : {}),
          ...(dto.hasLeaves !== undefined ? { hasLeaves: dto.hasLeaves } : {}),
          ...(dto.hasVoiceBiometrics !== undefined ? { hasVoiceBiometrics: dto.hasVoiceBiometrics } : {}),
          ...(dto.hasFaceBiometrics !== undefined ? { hasFaceBiometrics: dto.hasFaceBiometrics } : {}),
          ...(dto.status ? { status: dto.status } : {}),
        },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              slug: true,
              domain: true,
              contactEmail: true,
              contactPhone: true,
            },
          },
        },
      });

      // Update tenant plan if active
      if (updated.status === 'active') {
        await tx.tenant.update({
          where: { id: current.tenantId },
          data: { plan: updated.plan, status: 'active' },
        });
      } else if (updated.status === 'cancelled' || updated.status === 'expired') {
        // Find if another active subscription exists
        const anotherActive = await tx.subscription.findFirst({
          where: { tenantId: current.tenantId, status: 'active', id: { not: id } },
          orderBy: { createdAt: 'desc' },
        });
        if (anotherActive) {
          await tx.tenant.update({
            where: { id: current.tenantId },
            data: { plan: anotherActive.plan },
          });
        } else {
          await tx.tenant.update({
            where: { id: current.tenantId },
            data: { plan: 'free' },
          });
        }
      }

      return updated;
    });
  }

  /**
   * SuperAdmin: Cancel a subscription.
   */
  async cancelAdminSubscription(id: string) {
    const sub = await this.findAdminSubscriptionById(id);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.update({
        where: { id },
        data: {
          status: 'cancelled',
          endDate: new Date(),
        },
      });

      // Check if tenant has another active subscription
      const otherActive = await tx.subscription.findFirst({
        where: { tenantId: sub.tenantId, status: 'active', id: { not: id } },
        orderBy: { createdAt: 'desc' },
      });

      await tx.tenant.update({
        where: { id: sub.tenantId },
        data: {
          plan: otherActive ? otherActive.plan : 'free',
        },
      });

      return updated;
    });
  }

  /**
   * SuperAdmin: Resend subscription confirmation and login details email.
   */
  async resendSubscriptionEmail(id: string) {
    const sub = await this.findAdminSubscriptionById(id);
    const emailRes = await this.dispatchSubscriptionEmail(sub);
    if (!emailRes.success) {
      throw new BadRequestException(`فشل إرسال البريد: ${emailRes.error}`);
    }
    return { success: true, message: 'تم إرسال بريد تفاصيل الاشتراك بنجاح' };
  }

  // =========================================================================
  // 3. Automated Notification Email Generator
  // =========================================================================

  /**
   * Dispatches a beautiful, comprehensive HTML email containing subscription
   * plan details, feature quotas, and system login credentials.
   */
  async dispatchSubscriptionEmail(sub: any): Promise<{ success: boolean; error?: string }> {
    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: sub.tenantId },
        include: {
          settings: true,
          users: {
            take: 1,
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!tenant) {
        return { success: false, error: 'Tenant not found' };
      }

      const recipientEmail = tenant.contactEmail || tenant.users[0]?.email;
      if (!recipientEmail) {
        this.logger.warn(`No recipient email found for tenant ${tenant.name} (${tenant.id})`);
        return { success: false, error: 'No contact email or admin account found for this company' };
      }

      const emailConfig = (tenant.settings?.emailSettings as any) || undefined;
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4444';
      const loginUrl = `${frontendUrl}/login`;

      const startDateStr = format(new Date(sub.startDate), 'yyyy-MM-dd');
      const endDateStr = sub.endDate ? format(new Date(sub.endDate), 'yyyy-MM-dd') : 'دائم / Open-ended';
      const daysTotal = sub.endDate ? Math.max(1, differenceInDays(new Date(sub.endDate), new Date(sub.startDate))) : 365;

      const planName = sub.plan.toUpperCase();
      const adminUser = tenant.users[0];

      const subject = `🎉 تفعيل اشتراك شركة ${tenant.name} - منصة Avilo HR`;

      const html = `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
            .container { max-width: 620px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
            .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
            .badge { display: inline-block; padding: 4px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 9999px; color: #93c5fd; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 8px; }
            .content { padding: 28px 24px; }
            .section-title { font-size: 15px; font-weight: 700; color: #0f172a; margin: 20px 0 12px 0; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px; }
            .info-grid { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            .info-grid td { padding: 10px 12px; border-bottom: 1px solid #f1f5f9; font-size: 14px; }
            .info-label { color: #64748b; font-weight: 600; width: 40%; }
            .info-value { color: #0f172a; font-weight: 500; }
            .features-box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 20px; }
            .feature-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; border-bottom: 1px dashed #e2e8f0; }
            .feature-row:last-child { border-bottom: none; }
            .login-card { background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 1px solid #bfdbfe; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
            .btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; text-align: center; margin-top: 12px; }
            .footer { background-color: #f1f5f9; padding: 18px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <span class="badge">Avilo Cloud Platform</span>
              <h1 style="margin: 0; font-size: 24px; font-weight: 800;">تم تفعيل اشتراككم بنجاح 🎉</h1>
              <p style="margin: 8px 0 0 0; color: #94a3b8; font-size: 14px;">مرحباً بكم بشركة <strong>${tenant.name}</strong> في منصة Avilo</p>
            </div>

            <div class="content">
              <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-top: 0;">
                يسعدنا إبلاغكم بأنه تم إعداد وتفعيل مساحة العمل الخاصة بشركتكم وتخصيص باقة الاشتراك المعتمدة بكافة الميزات والحصص التراخيصية المطلوبة.
              </p>

              <!-- تفاصيل الاشتراك -->
              <div class="section-title">📋 تفاصيل الاشتراك والفترة الزمنية</div>
              <table class="info-grid">
                <tr>
                  <td class="info-label">اسم الباقة المعتمدة:</td>
                  <td class="info-value"><strong>${planName}</strong></td>
                </tr>
                <tr>
                  <td class="info-label">تاريخ البداية:</td>
                  <td class="info-value">${startDateStr}</td>
                </tr>
                <tr>
                  <td class="info-label">تاريخ الانتهاء:</td>
                  <td class="info-value">${endDateStr}</td>
                </tr>
                <tr>
                  <td class="info-label">إجمالي مدة الصلاحية:</td>
                  <td class="info-value">${daysTotal} يوم</td>
                </tr>
                <tr>
                  <td class="info-label">دورة الفوترة:</td>
                  <td class="info-value">${sub.billingCycle === 'yearly' ? 'سنوي' : 'شهري'}</td>
                </tr>
              </table>

              <!-- الميزات والحصص المتاحة -->
              <div class="section-title">⚡ الميزات والحصص المشمولة بالاشتراك</div>
              <div class="features-box">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 6px 0; font-size: 13px; color: #475569;">👥 الحد الأقصى للموظفين:</td>
                    <td style="padding: 6px 0; font-size: 13px; font-weight: 700; text-align: left; color: #0f172a;">${sub.maxEmployees} موظف</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; font-size: 13px; color: #475569;">📍 الحد الأقصى للفروع والمواقع:</td>
                    <td style="padding: 6px 0; font-size: 13px; font-weight: 700; text-align: left; color: #0f172a;">${sub.maxLocations} فرع</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; font-size: 13px; color: #475569;">💵 نظام مسير الرواتب والأجور (Payroll):</td>
                    <td style="padding: 6px 0; font-size: 13px; font-weight: 700; text-align: left; color: ${sub.hasPayroll ? '#16a34a' : '#dc2626'};">
                      ${sub.hasPayroll ? 'مفعل ومشمول ✅' : 'غير مشمول ❌'}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; font-size: 13px; color: #475569;">📅 نظام إدارة الإجازات والطلبات:</td>
                    <td style="padding: 6px 0; font-size: 13px; font-weight: 700; text-align: left; color: ${sub.hasLeaves ? '#16a34a' : '#dc2626'};">
                      ${sub.hasLeaves ? 'مفعل ومشمول ✅' : 'غير مشمول ❌'}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; font-size: 13px; color: #475569;">🎙️ التحقق عبر بصمة الصوت (Voice Biometrics):</td>
                    <td style="padding: 6px 0; font-size: 13px; font-weight: 700; text-align: left; color: ${sub.hasVoiceBiometrics ? '#16a34a' : '#dc2626'};">
                      ${sub.hasVoiceBiometrics ? 'مفعل ومشمول ✅' : 'غير مشمول ❌'}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; font-size: 13px; color: #475569;">👤 التحقق عبر بصمة الوجه (Face Biometrics):</td>
                    <td style="padding: 6px 0; font-size: 13px; font-weight: 700; text-align: left; color: ${sub.hasFaceBiometrics ? '#16a34a' : '#dc2626'};">
                      ${sub.hasFaceBiometrics ? 'مفعل ومشمول ✅' : 'غير مشمول ❌'}
                    </td>
                  </tr>
                </table>
              </div>

              <!-- آلية وبيانات الدخول للنظام -->
              <div class="section-title">🔑 بيانات وآلية الدخول للنظام</div>
              <div class="login-card">
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 4px 0; font-size: 13px; color: #1e40af; font-weight: 600;">معرف الشركة (Workspace Slug):</td>
                    <td style="padding: 4px 0; font-size: 14px; font-family: monospace; font-weight: 700; color: #1e3a8a;">${tenant.slug}</td>
                  </tr>
                  <tr>
                    <td style="padding: 4px 0; font-size: 13px; color: #1e40af; font-weight: 600;">البريد الإلكتروني الإداري:</td>
                    <td style="padding: 4px 0; font-size: 13px; font-family: monospace; color: #1e3a8a;">${adminUser?.email || recipientEmail}</td>
                  </tr>
                  ${tenant.domain ? `
                  <tr>
                    <td style="padding: 4px 0; font-size: 13px; color: #1e40af; font-weight: 600;">النطاق المخصص:</td>
                    <td style="padding: 4px 0; font-size: 13px; color: #1e3a8a;">${tenant.domain}</td>
                  </tr>
                  ` : ''}
                </table>

                <div style="margin-top: 14px; font-size: 13px; color: #1e3a8a; line-height: 1.6;">
                  <strong>خطوات تسجيل الدخول للوحة التحكم:</strong>
                  <ol style="margin: 4px 0 0 0; padding-right: 20px;">
                    <li>انقر على الزر أدناه للانتقال إلى بوابة الدخول.</li>
                    <li>أدخل معرف الشركة: <strong>${tenant.slug}</strong></li>
                    <li>أدخل البريد الإلكتروني وكلمة المرور الخاصة بمسؤول النظام.</li>
                  </ol>
                </div>

                <div style="text-align: center; margin-top: 16px;">
                  <a href="${loginUrl}" class="btn" target="_blank">الانتقال إلى لوحة تحكم الشركة</a>
                </div>
              </div>

              <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px; font-size: 12px; color: #92400e; line-height: 1.5;">
                🔒 <strong>تنبيه أمان:</strong> يرجى الحفاظ على سرية بيانات الدخول. يمكنكم دوماً الاطلاع على استهلاك الميزات والأيام المتبقية للاشتراك من خلال صفحة <strong>الإشتراك والفوترة</strong> في لوحة التحكم.
              </div>
            </div>

            <div class="footer">
              هذه الرسالة مرسلة آلياً من نظام إدارة منصة Avilo HR.<br>
              في حال وجود أي استفسار، يرجى التواصل مع الدعم الفني للنظام.
            </div>
          </div>
        </body>
        </html>
      `;

      const sendRes = await this.mailService.sendEmail(recipientEmail, subject, html, emailConfig);
      if (sendRes.success) {
        this.logger.log(`Subscription confirmation email sent to ${recipientEmail}`);
      } else {
        this.logger.warn(`Failed to send subscription confirmation email: ${sendRes.error}`);
      }
      return sendRes;
    } catch (err: any) {
      this.logger.error(`Error in dispatchSubscriptionEmail: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  // =========================================================================
  // 4. Tenant-Facing Subscriptions Hub & History
  // =========================================================================

  /**
   * Tenant: Get live overview of active subscription, remaining days,
   * quota limits and current resource consumption (employees & branches).
   */
  async getTenantOverview(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        subscriptions: {
          where: { status: 'active' },
          orderBy: { startDate: 'desc' },
          take: 1,
        },
      },
    });

    if (!tenant) throw new NotFoundException('Tenant not found');

    const activeSub = tenant.subscriptions[0] || null;

    // Count current active employees (exclude terminated)
    const activeEmployeesCount = await this.prisma.employee.count({
      where: {
        tenantId,
        status: { not: 'terminated' },
      },
    });

    // Count current branches
    const branchesCount = await this.prisma.branch.count({
      where: { tenantId },
    });

    const now = new Date();
    let remainingDays = 0;
    let totalDays = 30;
    let isExpiringSoon = false;

    if (activeSub && activeSub.endDate) {
      remainingDays = Math.max(0, differenceInDays(new Date(activeSub.endDate), now));
      totalDays = Math.max(1, differenceInDays(new Date(activeSub.endDate), new Date(activeSub.startDate)));
      isExpiringSoon = remainingDays <= 14;
    }

    const maxEmployees = activeSub?.maxEmployees ?? 10;
    const maxLocations = activeSub?.maxLocations ?? 1;

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        plan: tenant.plan,
      },
      subscription: activeSub,
      quotas: {
        employees: {
          used: activeEmployeesCount,
          max: maxEmployees,
          percent: Math.min(100, Math.round((activeEmployeesCount / maxEmployees) * 100)),
          isExceeded: activeEmployeesCount > maxEmployees,
        },
        locations: {
          used: branchesCount,
          max: maxLocations,
          percent: Math.min(100, Math.round((branchesCount / maxLocations) * 100)),
          isExceeded: branchesCount > maxLocations,
        },
      },
      features: {
        hasPayroll: activeSub ? activeSub.hasPayroll : true,
        hasLeaves: activeSub ? activeSub.hasLeaves : true,
        hasVoiceBiometrics: activeSub ? activeSub.hasVoiceBiometrics : false,
        hasFaceBiometrics: activeSub ? activeSub.hasFaceBiometrics : false,
      },
      period: {
        remainingDays,
        totalDays,
        percentRemaining: totalDays > 0 ? Math.min(100, Math.round((remainingDays / totalDays) * 100)) : 100,
        isExpiringSoon,
      },
    };
  }

  /**
   * Tenant: Get history of all past and current subscriptions.
   */
  async getTenantHistory(tenantId: string) {
    const subscriptions = await this.prisma.subscription.findMany({
      where: { tenantId },
      orderBy: { startDate: 'desc' },
    });

    return subscriptions;
  }

  // =========================================================================
  // 5. Existing Invoices & Backward Compatible Methods
  // =========================================================================

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
