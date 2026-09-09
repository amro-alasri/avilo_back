import { Injectable, ConflictException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { CreateEmployeeDto } from './dto/create-employee.dto.js';
import { UpdateEmployeeDto } from './dto/update-employee.dto.js';
import { PaginationDto } from '../../core/pagination/pagination.dto.js';
import { PaginatedResponse } from '../../core/pagination/paginated-response.js';
import { MailService } from '../mail/mail.service.js';
import { SettingsService } from '../settings/settings.service.js';
import * as argon2 from 'argon2';

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
    private settingsService: SettingsService,
  ) {}

  async create(tenantId: string, dto: CreateEmployeeDto) {
    const existingEmployee = await this.prisma.employee.findUnique({
      where: {
        tenantId_email: {
          email: dto.email,
          tenantId,
        },
      },
    });

    if (existingEmployee) {
      throw new ConflictException('Employee with this email already exists in the company');
    }

    // Determine initial password (user-provided or auto-generated secure password)
    const initialPassword =
      dto.password && dto.password.trim().length >= 6
        ? dto.password.trim()
        : `Avilo#${Math.floor(100000 + Math.random() * 900000)}`;

    const hashedPassword = await argon2.hash(initialPassword);

    const employee = await this.prisma.employee.create({
      data: {
        tenantId,
        email: dto.email,
        password: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        employeeNumber: dto.employeeNumber,
        jobTitle: dto.jobTitle,
        joinDate: new Date(dto.joinDate),
        departmentId: dto.departmentId,
        branchId: dto.branchId,
        status: (dto.status as any) || 'active',
        birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
        gender: dto.gender as any,
        phone: dto.phone,
      },
    });

    // Send credentials email for mobile app access if enabled
    let emailDispatched = false;
    let emailError: string | undefined;

    if (dto.sendWelcomeEmail !== false) {
      try {
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true, slug: true },
        });

        const companyName = tenant?.name || 'Avilo Company';
        const companySlug = tenant?.slug || '';
        const emailConfig = await this.settingsService.getRawEmailConfig(tenantId);

        const subject = `مرحباً بك في ${companyName} - بيانات الدخول لتطبيق Avilo`;
        const html = `
          <div dir="rtl" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 620px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; color: #1e293b;">
            <div style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); padding: 24px; text-align: center; color: #ffffff;">
              <h1 style="margin: 0; font-size: 22px; font-weight: 700;">${companyName}</h1>
              <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">نظام Avilo لإدارة شؤون الموظفين</p>
            </div>
            
            <div style="padding: 24px 28px;">
              <h2 style="font-size: 18px; color: #0f172a; margin-top: 0;">أهلاً بك، ${dto.firstName} ${dto.lastName} 👋</h2>
              <p style="font-size: 14px; line-height: 1.6; color: #334155;">
                يسعدنا إعلامك بأنه تم إنشاء وتفعيل حسابك كموظف في <strong>${companyName}</strong>. يمكنك الآن تسجيل الدخول عبر تطبيق الهاتف الذكي (<strong>Avilo Mobile App</strong>) باستخدام بيانات الاعتماد الموضحة أدناه:
              </p>

              <!-- Credentials Box -->
              <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 18px; margin: 20px 0;">
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-weight: 600; width: 140px;">كود الشركة (Company Code):</td>
                    <td style="padding: 6px 0;">
                      <span style="font-family: monospace; font-size: 15px; font-weight: 700; background: #e0f2fe; color: #0369a1; padding: 3px 8px; border-radius: 6px; border: 1px solid #bae6fd;">
                        ${companySlug}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-weight: 600;">البريد الإلكتروني (Email):</td>
                    <td style="padding: 6px 0; font-family: monospace; font-weight: 600; color: #0f172a;">${dto.email}</td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-weight: 600;">كلمة المرور المؤقتة:</td>
                    <td style="padding: 6px 0;">
                      <span style="font-family: monospace; font-size: 15px; font-weight: 700; background: #fef3c7; color: #92400e; padding: 3px 8px; border-radius: 6px; border: 1px solid #fde68a;">
                        ${initialPassword}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 6px 0; color: #64748b; font-weight: 600;">رقم الموظف الوظيفي:</td>
                    <td style="padding: 6px 0; font-family: monospace; color: #334155;">${dto.employeeNumber}</td>
                  </tr>
                </table>
              </div>

              <!-- Steps to Log In -->
              <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px; margin-bottom: 20px;">
                <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #1e40af;">خطوات تسجيل الدخول للتطبيق:</h4>
                <ol style="margin: 0; padding-right: 20px; font-size: 13px; color: #1e3a8a; line-height: 1.6;">
                  <li>افتح تطبيق <strong>Avilo</strong> على هاتفك الذكي.</li>
                  <li>أدخل كود الشركة: <strong>${companySlug}</strong></li>
                  <li>أدخل بريدك الإلكتروني وكلمة المرور المؤقتة واضغط تسجيل الدخول.</li>
                </ol>
              </div>

              <!-- Security Notice -->
              <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 12px; color: #92400e; line-height: 1.5;">
                🔒 <strong>تنبيه أمني:</strong> هذه البيانات مخصصة حصرياً لتطبيق الهاتف الذكي لتسجيل الحضور، تقديم الإجازات، ومتابعة قسائم الرواتب. هذا الحساب لا يملك صلاحية الدخول إلى لوحة تحكم الويب الإدارية. يُنصح بتغيير كلمة المرور فور أول تسجيل دخول لضمان أمان حسابك.
              </div>
            </div>

            <div style="background-color: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
              هذه الرسالة تم إنشاؤها وإرسالها تلقائياً عبر منصة Avilo HR.
            </div>
          </div>
        `;

        const sendResult = await this.mailService.sendEmail(dto.email, subject, html, emailConfig);
        if (sendResult.success) {
          emailDispatched = true;
          this.logger.log(`Credentials email dispatched to employee: ${dto.email}`);
        } else {
          emailError = sendResult.error;
          this.logger.warn(`Failed to dispatch credentials email: ${sendResult.error}`);
        }
      } catch (err: any) {
        emailError = err.message;
        this.logger.error(`Error sending employee welcome email: ${err.message}`);
      }
    }

    return {
      ...employee,
      initialPassword,
      emailDispatched,
      emailError,
    };
  }

  async findAll(tenantId: string, paginationDto: PaginationDto) {
    const { page = 1, limit = 10, search } = paginationDto;
    const skip = (page - 1) * limit;

    const where: any = { tenantId };
    
    if (search) {
      where.OR = [
        { employeeNumber: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.employee.count({ where }),
      this.prisma.employee.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          employeeNumber: true,
          status: true,
          createdAt: true,
          departmentId: true,
          branchId: true,
          department: {
            select: { id: true, name: true, branch: { select: { id: true, name: true } } },
          },
          branch: {
            select: { id: true, name: true }
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return new PaginatedResponse(data, total, page, limit);
  }

  async findOne(tenantId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        employeeNumber: true,
        status: true,
        createdAt: true,
        jobTitle: true,
        joinDate: true,
        birthDate: true,
        gender: true,
        phone: true,
        departmentId: true,
        branchId: true,
        department: true,
        branch: true,
      },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return employee;
  }

  async update(tenantId: string, id: string, dto: UpdateEmployeeDto) {
    const employee = await this.findOne(tenantId, id);

    return this.prisma.employee.update({
      where: { id },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        employeeNumber: dto.employeeNumber,
        jobTitle: dto.jobTitle,
        joinDate: dto.joinDate ? new Date(dto.joinDate) : undefined,
        departmentId: dto.departmentId,
        branchId: dto.branchId,
        status: dto.status as any,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        gender: dto.gender as any,
        phone: dto.phone,
      },
    });
  }

  async remove(tenantId: string, id: string) {
    const employee = await this.findOne(tenantId, id);

    return this.prisma.employee.delete({
      where: { id: employee.id },
    });
  }
}
