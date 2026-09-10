import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { EncryptionUtil } from '../../core/utils/encryption.util.js';
import { MailService, EmailConfig } from '../mail/mail.service.js';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private prisma: PrismaService,
    private mailService: MailService,
  ) {}

  /**
   * Retrieves email configuration for a tenant with sensitive secrets masked.
   */
  async getEmailConfigForClient(tenantId: string): Promise<Record<string, any>> {
    const raw = await this.getRawEmailConfig(tenantId);
    return {
      ...raw,
      MS_CLIENT_SECRET: raw.MS_CLIENT_SECRET ? '••••••••' : '',
      SMTP_PASSWORD: raw.SMTP_PASSWORD ? '••••••••' : '',
      hasMsSecret: Boolean(raw.MS_CLIENT_SECRET),
      hasSmtpPassword: Boolean(raw.SMTP_PASSWORD),
    };
  }

  /**
   * Retrieves raw decrypted email configuration for sending or testing.
   * If tenant has not configured custom email settings, it falls back to the system
   * tenant (SuperAdmin) configuration, and finally to process.env.
   */
  async getRawEmailConfig(tenantId: string): Promise<EmailConfig> {
    const settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
      select: { emailSettings: true },
    });

    let stored: any = (settings?.emailSettings as any) || {};

    // Check if this tenant has custom credentials defined
    const hasCustomConfig = Boolean(
      (stored.EMAIL_PROVIDER === 'smtp' && (stored.SMTP_HOST || stored.SMTP_USER)) ||
      (stored.EMAIL_PROVIDER === 'microsoft_graph' && (stored.MS_CLIENT_ID || stored.MS_TENANT_ID)) ||
      stored.MS_CLIENT_ID ||
      stored.SMTP_HOST
    );

    // If tenant does not have their own credentials, fallback to the 'system' tenant
    if (!hasCustomConfig) {
      try {
        const systemTenant = await this.prisma.tenant.findUnique({
          where: { slug: 'system' },
          select: { id: true, settings: { select: { emailSettings: true } } },
        });

        if (systemTenant && systemTenant.id !== tenantId && systemTenant.settings?.emailSettings) {
          const sysStored: any = systemTenant.settings.emailSettings;
          if (sysStored.MS_CLIENT_ID || sysStored.SMTP_HOST || sysStored.MS_TENANT_ID) {
            stored = sysStored;
          }
        }
      } catch (err: any) {
        this.logger.warn(`Could not load system tenant fallback email settings: ${err.message}`);
      }
    }

    const decrypted: EmailConfig = { ...stored };

    if (stored.MS_CLIENT_SECRET) {
      try {
        decrypted.MS_CLIENT_SECRET = EncryptionUtil.decrypt(stored.MS_CLIENT_SECRET);
      } catch {
        decrypted.MS_CLIENT_SECRET = stored.MS_CLIENT_SECRET;
      }
    }

    if (stored.SMTP_PASSWORD) {
      try {
        decrypted.SMTP_PASSWORD = EncryptionUtil.decrypt(stored.SMTP_PASSWORD);
      } catch {
        decrypted.SMTP_PASSWORD = stored.SMTP_PASSWORD;
      }
    }

    // Fallbacks to environment variables if not set in tenant settings
    const env = process.env;
    return {
      EMAIL_PROVIDER: decrypted.EMAIL_PROVIDER || env.EMAIL_PROVIDER || 'microsoft_graph',
      MS_TENANT_ID: decrypted.MS_TENANT_ID || env.MS_TENANT_ID || '',
      MS_CLIENT_ID: decrypted.MS_CLIENT_ID || env.MS_CLIENT_ID || '',
      MS_CLIENT_SECRET: decrypted.MS_CLIENT_SECRET || env.MS_CLIENT_SECRET || '',
      MS_SENDER_EMAIL: decrypted.MS_SENDER_EMAIL || env.MS_SENDER_EMAIL || '',
      MS_SENDER_NAME: decrypted.MS_SENDER_NAME || env.MS_SENDER_NAME || '',
      SMTP_HOST: decrypted.SMTP_HOST || env.SMTP_HOST || '',
      SMTP_PORT: decrypted.SMTP_PORT || env.SMTP_PORT || 587,
      SMTP_USER: decrypted.SMTP_USER || env.SMTP_USER || '',
      SMTP_PASSWORD: decrypted.SMTP_PASSWORD || env.SMTP_PASSWORD || '',
      SMTP_FROM: decrypted.SMTP_FROM || env.SMTP_FROM || '',
      SMTP_SECURE: decrypted.SMTP_SECURE ?? env.SMTP_SECURE ?? 'false',
    };
  }

  /**
   * Updates tenant email configuration with AES-256 encryption on secrets.
   */
  async updateEmailConfig(tenantId: string, data: any): Promise<{ success: boolean }> {
    const existingRaw = await this.getRawEmailConfig(tenantId);
    const sanitized: any = { ...data };

    // Handle Microsoft Client Secret
    let msSecret = (data.MS_CLIENT_SECRET || '').trim();
    if (!msSecret || msSecret === '••••••••' || msSecret.startsWith('••••')) {
      // Keep existing
      msSecret = existingRaw.MS_CLIENT_SECRET || '';
    }
    if (msSecret) {
      sanitized.MS_CLIENT_SECRET = EncryptionUtil.encrypt(msSecret);
    } else {
      sanitized.MS_CLIENT_SECRET = '';
    }

    // Handle SMTP Password
    let smtpPass = (data.SMTP_PASSWORD || '').trim();
    if (!smtpPass || smtpPass === '••••••••' || smtpPass.startsWith('••••')) {
      // Keep existing
      smtpPass = existingRaw.SMTP_PASSWORD || '';
    }
    if (smtpPass) {
      sanitized.SMTP_PASSWORD = EncryptionUtil.encrypt(smtpPass);
    } else {
      sanitized.SMTP_PASSWORD = '';
    }

    // Clean up helper flags
    delete sanitized.hasMsSecret;
    delete sanitized.hasSmtpPassword;

    await this.prisma.tenantSettings.upsert({
      where: { tenantId },
      update: {
        emailSettings: sanitized,
      },
      create: {
        tenantId,
        emailSettings: sanitized,
      },
    });

    return { success: true };
  }

  /**
   * Tests email configuration by sending a verification message.
   */
  async testEmailConfig(
    tenantId: string,
    submittedConfig: any,
    recipientEmail: string,
  ): Promise<{ success: boolean; error?: string; message?: string }> {
    const existingRaw = await this.getRawEmailConfig(tenantId);
    const resolvedConfig: EmailConfig = { ...submittedConfig };

    // If client secret is masked, use stored decrypted secret
    if (
      !resolvedConfig.MS_CLIENT_SECRET ||
      resolvedConfig.MS_CLIENT_SECRET === '••••••••' ||
      resolvedConfig.MS_CLIENT_SECRET.startsWith('••••')
    ) {
      resolvedConfig.MS_CLIENT_SECRET = existingRaw.MS_CLIENT_SECRET;
    }

    // If SMTP password is masked, use stored decrypted password
    if (
      !resolvedConfig.SMTP_PASSWORD ||
      resolvedConfig.SMTP_PASSWORD === '••••••••' ||
      resolvedConfig.SMTP_PASSWORD.startsWith('••••')
    ) {
      resolvedConfig.SMTP_PASSWORD = existingRaw.SMTP_PASSWORD;
    }

    return this.mailService.testConnection(resolvedConfig, recipientEmail);
  }

  /**
   * Retrieves company preferences (timezone, currency, language, etc.)
   */
  async getPreferences(tenantId: string) {
    let settings = await this.prisma.tenantSettings.findUnique({
      where: { tenantId },
    });

    if (!settings) {
      settings = await this.prisma.tenantSettings.create({
        data: { tenantId },
      });
    }

    return settings;
  }

  /**
   * Updates company preferences
   */
  async updatePreferences(tenantId: string, data: any) {
    return this.prisma.tenantSettings.upsert({
      where: { tenantId },
      update: {
        timezone: data.timezone,
        currency: data.currency,
        dateFormat: data.dateFormat,
        language: data.language,
        logoUrl: data.logoUrl,
        primaryColor: data.primaryColor,
      },
      create: {
        tenantId,
        timezone: data.timezone || 'UTC',
        currency: data.currency || 'USD',
        dateFormat: data.dateFormat || 'YYYY-MM-DD',
        language: data.language || 'en',
        logoUrl: data.logoUrl,
        primaryColor: data.primaryColor,
      },
    });
  }
}
