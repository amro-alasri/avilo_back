import { Injectable, ConflictException, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { UpdateTenantDto } from './dto/update-tenant.dto.js';
import * as argon2 from 'argon2';
import { PaginationDto } from '../../core/pagination/pagination.dto.js';
import { PaginatedResponse } from '../../core/pagination/paginated-response.js';
import { MailService } from '../mail/mail.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { escapeHtml } from '../../core/utils/security.util.js';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private settingsService: SettingsService,
  ) {}

  async create(createTenantDto: CreateTenantDto) {
    const domain =
      createTenantDto.domain && createTenantDto.domain.trim() !== ''
        ? createTenantDto.domain.trim()
        : null;

    const companyEmail = (createTenantDto.contactEmail || createTenantDto.adminEmail || '').trim();
    if (!companyEmail) {
      throw new BadRequestException('Company Email is required');
    }

    const rawPassword = createTenantDto.defaultPassword || createTenantDto.adminPassword;
    if (!rawPassword || rawPassword.length < 6) {
      throw new BadRequestException('Default password is required (minimum 6 characters)');
    }

    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug: createTenantDto.slug },
    });

    if (existingTenant) {
      throw new ConflictException('Tenant with this slug already exists');
    }

    if (domain) {
      const existingDomain = await this.prisma.tenant.findUnique({
        where: { domain },
      });
      if (existingDomain) throw new ConflictException('Domain is already registered');
    }

    const hashedPassword = await argon2.hash(rawPassword);

    // Using transaction to provision everything together
    const tenant = await this.prisma.$transaction(async (tx) => {
      // 1. Create Tenant
      const newTenant = await tx.tenant.create({
        data: {
          name: createTenantDto.name,
          slug: createTenantDto.slug,
          domain: domain,
          contactEmail: companyEmail,
          contactPhone: createTenantDto.contactPhone || null,
          status: 'active',
          plan: (createTenantDto.plan as any) || 'free',
        },
      });

      // 2. Create Settings
      await tx.tenantSettings.create({
        data: { tenantId: newTenant.id },
      });

      // 3. Create Default Organization
      const org = await tx.organization.create({
        data: {
          tenantId: newTenant.id,
          name: `${createTenantDto.name} Org`,
        },
      });

      // 4. Create Default Branch
      await tx.branch.create({
        data: {
          tenantId: newTenant.id,
          orgId: org.id,
          name: 'Main Branch',
        },
      });

      // 5. Create Super Admin Role
      const role = await tx.role.create({
        data: {
          tenantId: newTenant.id,
          name: 'Super Admin',
          permissions: ['*'], // Full access
        },
      });

      // 6. Create Admin User with company email and default password
      const user = await tx.user.create({
        data: {
          tenantId: newTenant.id,
          email: companyEmail,
          password: hashedPassword,
          firstName: createTenantDto.adminFirstName || createTenantDto.name,
          lastName: createTenantDto.adminLastName || 'Admin',
          status: 'active',
        },
      });

      // 7. Assign Role
      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
        },
      });

      return newTenant;
    });

    // Automated Welcome & Credentials Email Notification
    let emailDispatched = false;
    let emailError: string | undefined;

    if (createTenantDto.sendWelcomeEmail !== false) {
      const emailRes = await this.dispatchCompanyWelcomeEmail(tenant, createTenantDto);
      emailDispatched = emailRes.success;
      emailError = emailRes.error;
    }

    return {
      ...tenant,
      emailDispatched,
      emailError,
    };
  }

  /**
   * Dispatches an onboarding credentials email containing system login URL,
   * company slug, admin username, and temporary password.
   */
  async dispatchCompanyWelcomeEmail(
    tenant: any,
    dto: CreateTenantDto,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const emailConfig = await this.settingsService.getRawEmailConfig(tenant.id);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4444';
      const loginUrl = `${frontendUrl}/login`;

      const safeTenantName = escapeHtml(tenant.name);
      const safeSlug = escapeHtml(tenant.slug);
      const companyEmail = (dto.contactEmail || dto.adminEmail || '').trim();
      const rawPassword = dto.defaultPassword || dto.adminPassword || '';
      const safeEmail = escapeHtml(companyEmail);
      const safePassword = escapeHtml(rawPassword);
      const safeDomain = tenant.domain ? escapeHtml(tenant.domain) : null;

      const subject = `🎉 Welcome to Avilo - Workspace Credentials for ${safeTenantName}`;
      const recipientEmail = companyEmail;

      const html = `
        <!DOCTYPE html>
        <html dir="ltr" lang="en">
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b; }
            .container { max-width: 620px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
            .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 32px 24px; text-align: center; color: #ffffff; }
            .badge { display: inline-block; padding: 4px 12px; background: rgba(59, 130, 246, 0.2); border: 1px solid #3b82f6; border-radius: 9999px; color: #93c5fd; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-bottom: 8px; }
            .content { padding: 28px 24px; }
            .section-title { font-size: 15px; font-weight: 700; color: #0f172a; margin: 20px 0 12px 0; border-bottom: 2px solid #f1f5f9; padding-bottom: 6px; }
            .login-card { background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border: 1px solid #bfdbfe; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
            .info-grid { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
            .info-grid td { padding: 8px 10px; font-size: 13px; }
            .info-label { color: #1e40af; font-weight: 600; width: 42%; }
            .info-val { font-family: monospace; font-size: 14px; font-weight: 700; color: #1e3a8a; }
            .btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px; text-align: center; margin-top: 14px; }
            .footer { background-color: #f1f5f9; padding: 18px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <span class="badge">Avilo Cloud Platform</span>
              <h1 style="margin: 0; font-size: 24px; font-weight: 800;">Company Workspace Activated 🎉</h1>
              <p style="margin: 8px 0 0 0; color: #94a3b8; font-size: 14px;">Welcome <strong>${safeTenantName}</strong> to the Avilo Platform</p>
            </div>

            <div class="content">
              <p style="font-size: 14px; line-height: 1.6; color: #334155; margin-top: 0;">
                Hello <strong>${safeTenantName} Administrator</strong>,<br>
                We are delighted to inform you that your company workspace for <strong>${safeTenantName}</strong> has been successfully provisioned on Avilo. You can sign in using your company credentials below to manage branches, invite employees, and configure workforce policies.
              </p>

              <!-- Workspace Credentials Box -->
              <div class="section-title">🔑 Company Login Credentials</div>
              <div class="login-card">
                <table class="info-grid">
                  <tr>
                    <td class="info-label">System Portal URL:</td>
                    <td class="info-val"><a href="${loginUrl}" style="color: #2563eb; text-decoration: underline;">${loginUrl}</a></td>
                  </tr>
                  <tr>
                    <td class="info-label">Company Workspace Code:</td>
                    <td class="info-val">
                      <span style="background: #e0f2fe; color: #0369a1; padding: 2px 8px; border-radius: 6px; border: 1px solid #bae6fd;">
                        ${safeSlug}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td class="info-label">Company Email (Username):</td>
                    <td class="info-val">${safeEmail}</td>
                  </tr>
                  <tr>
                    <td class="info-label">Default Password:</td>
                    <td class="info-val">
                      <span style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 6px; border: 1px solid #fde68a;">
                        ${safePassword}
                      </span>
                    </td>
                  </tr>
                  ${safeDomain ? `
                  <tr>
                    <td class="info-label">Custom Domain:</td>
                    <td class="info-val">${safeDomain}</td>
                  </tr>
                  ` : ''}
                </table>

                <div style="margin-top: 14px; font-size: 13px; color: #1e3a8a; line-height: 1.6;">
                  <strong>Steps to log in:</strong>
                  <ol style="margin: 4px 0 0 0; padding-left: 20px;">
                    <li>Open the system portal link below.</li>
                    <li>Enter your Company Workspace Code: <strong>${safeSlug}</strong></li>
                    <li>Enter your Company Email (<strong>${safeEmail}</strong>) and default password.</li>
                  </ol>
                </div>

                <div style="text-align: center; margin-top: 14px;">
                  <a href="${loginUrl}" class="btn" target="_blank">Sign In to Company Dashboard</a>
                </div>
              </div>

              <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px; font-size: 12px; color: #92400e; line-height: 1.5;">
                🔒 <strong>Security Notice:</strong> Please keep your workspace credentials confidential. We strongly advise updating your default password after logging in by heading to <strong>Settings &gt; Security</strong>.
              </div>
            </div>

            <div class="footer">
              This automated notification was dispatched by the Avilo HR Management Platform.<br>
              For support or inquiries, please reach out to your system administrator.
            </div>
          </div>
        </body>
        </html>
      `;

      const sendRes = await this.mailService.sendEmail(recipientEmail, subject, html, emailConfig);
      if (sendRes.success) {
        this.logger.log(`Company onboarding welcome email sent to ${recipientEmail}`);
      } else {
        this.logger.warn(`Failed to send company onboarding welcome email: ${sendRes.error}`);
      }

      // If contact email is distinct from admin email, also notify contact email
      if (dto.contactEmail && dto.contactEmail !== dto.adminEmail) {
        await this.mailService.sendEmail(dto.contactEmail, subject, html, emailConfig);
      }

      return sendRes;
    } catch (err: any) {
      this.logger.error(`Error in dispatchCompanyWelcomeEmail: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  async findAll(paginationDto: PaginationDto) {
    const { page = 1, limit = 10, search } = paginationDto;
    const skip = (page - 1) * limit;
    
    const where = search ? {
      name: { contains: search, mode: 'insensitive' as any },
    } : {};

    const [total, data] = await Promise.all([
      this.prisma.tenant.count({ where }),
      this.prisma.tenant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return new PaginatedResponse(data, total, page, limit);
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: { settings: true },
    });
    
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async update(id: string, updateTenantDto: UpdateTenantDto) {
    await this.findOne(id); // verify existence

    const domain =
      updateTenantDto.domain !== undefined
        ? updateTenantDto.domain && updateTenantDto.domain.trim() !== ''
          ? updateTenantDto.domain.trim()
          : null
        : undefined;

    if (domain) {
      const existing = await this.prisma.tenant.findFirst({
        where: { domain, id: { not: id } },
      });
      if (existing) throw new ConflictException('Domain already in use');
    }

    const dataToUpdate: any = { ...updateTenantDto };
    if (domain !== undefined) {
      dataToUpdate.domain = domain;
    }

    return this.prisma.tenant.update({
      where: { id },
      data: dataToUpdate,
    });
  }

  async remove(id: string) {
    await this.findOne(id); // verify existence
    return this.prisma.tenant.delete({
      where: { id },
    });
  }

  async verifyBySlug(slug: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        settings: {
          select: {
            logoUrl: true,
            primaryColor: true,
          }
        }
      }
    });

    if (!tenant) throw new NotFoundException('Company not found');
    return tenant;
  }
}
