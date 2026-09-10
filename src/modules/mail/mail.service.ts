import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import * as crypto from 'crypto';
import { escapeHtml } from '../../core/utils/security.util.js';

interface MsTokenCache {
  token: string;
  expiresAt: number;
  credentialHash: string;
}

export interface EmailConfig {
  EMAIL_PROVIDER?: string;
  MS_TENANT_ID?: string;
  MS_CLIENT_ID?: string;
  MS_CLIENT_SECRET?: string;
  MS_SENDER_EMAIL?: string;
  MS_SENDER_NAME?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: number | string;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  SMTP_FROM?: string;
  SMTP_SECURE?: boolean | string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private msTokenCache: MsTokenCache | null = null;

  /**
   * Main entry point to dispatch email notifications.
   * Dynamically selects between Microsoft Graph OAuth 2.0 and Standard SMTP.
   */
  async sendEmail(
    to: string,
    subject: string,
    html: string,
    customConfig?: EmailConfig,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const config = this.resolveConfig(customConfig);
      const provider = (config.EMAIL_PROVIDER || '').trim().toLowerCase();

      const isMicrosoftGraph =
        provider === 'microsoft_graph' ||
        (!provider && Boolean(config.MS_TENANT_ID && config.MS_CLIENT_ID));

      if (isMicrosoftGraph) {
        return await this.sendViaMicrosoftGraph(to, subject, html, config);
      }

      return await this.sendViaSmtp(to, subject, html, config);
    } catch (error: any) {
      this.logger.error(`Error in sendEmail dispatcher: ${error.message}`);
      return { success: false, error: error.message || 'Unknown email dispatch error' };
    }
  }

  /**
   * Tests connection and sends a test email to verify credentials
   */
  async testConnection(
    customConfig: EmailConfig,
    testRecipient: string,
  ): Promise<{ success: boolean; error?: string; message?: string }> {
    const config = this.resolveConfig(customConfig);
    const provider = (config.EMAIL_PROVIDER || '').trim().toLowerCase();
    const isMicrosoftGraph =
      provider === 'microsoft_graph' ||
      (!provider && Boolean(config.MS_TENANT_ID && config.MS_CLIENT_ID));

    const subject = `[Avilo Test Email] Verification at ${new Date().toLocaleTimeString()}`;
    const safeProvider = escapeHtml(isMicrosoftGraph ? 'Microsoft Graph API (OAuth 2.0)' : 'Standard SMTP');
    const safeSender = escapeHtml(isMicrosoftGraph ? config.MS_SENDER_EMAIL : (config.SMTP_FROM || config.SMTP_USER));
    const safeTimestamp = escapeHtml(new Date().toISOString());

    const html = `
      <div style="font-family: sans-serif; padding: 20px; color: #1e293b; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0284c7; margin-top: 0;">Avilo Email Service Test</h2>
        <p>Congratulations! Your email service configuration in <strong>Avilo</strong> is working properly.</p>
        <div style="background: #f8fafc; padding: 12px; border-radius: 6px; font-size: 13px; margin: 15px 0;">
          <p style="margin: 4px 0;"><strong>Delivery Provider:</strong> ${safeProvider}</p>
          <p style="margin: 4px 0;"><strong>Sender:</strong> ${safeSender}</p>
          <p style="margin: 4px 0;"><strong>Timestamp:</strong> ${safeTimestamp}</p>
        </div>
        <p style="color: #64748b; font-size: 12px;">This is an automated test message sent from the Avilo Management Dashboard.</p>
      </div>
    `;

    const res = await this.sendEmail(testRecipient, subject, html, config);
    if (!res.success) {
      return { success: false, error: res.error };
    }
    return {
      success: true,
      message: `Test email successfully dispatched to ${testRecipient}`,
    };
  }

  /**
   * Merges customConfig with environment variables fallback
   */
  private resolveConfig(customConfig?: EmailConfig): EmailConfig {
    const env = process.env;
    return {
      EMAIL_PROVIDER: customConfig?.EMAIL_PROVIDER || env.EMAIL_PROVIDER || 'microsoft_graph',
      MS_TENANT_ID: customConfig?.MS_TENANT_ID || env.MS_TENANT_ID || '',
      MS_CLIENT_ID: customConfig?.MS_CLIENT_ID || env.MS_CLIENT_ID || '',
      MS_CLIENT_SECRET: customConfig?.MS_CLIENT_SECRET || env.MS_CLIENT_SECRET || '',
      MS_SENDER_EMAIL: customConfig?.MS_SENDER_EMAIL || env.MS_SENDER_EMAIL || '',
      MS_SENDER_NAME: customConfig?.MS_SENDER_NAME || env.MS_SENDER_NAME || 'Avilo System',
      SMTP_HOST: customConfig?.SMTP_HOST || env.SMTP_HOST || '',
      SMTP_PORT: customConfig?.SMTP_PORT || env.SMTP_PORT || 587,
      SMTP_USER: customConfig?.SMTP_USER || env.SMTP_USER || '',
      SMTP_PASSWORD: customConfig?.SMTP_PASSWORD || env.SMTP_PASSWORD || '',
      SMTP_FROM: customConfig?.SMTP_FROM || env.SMTP_FROM || '',
      SMTP_SECURE: customConfig?.SMTP_SECURE ?? env.SMTP_SECURE ?? 'false',
    };
  }

  /**
   * Dispatches email via Microsoft Graph API OAuth 2.0 (Client Credentials Grant).
   */
  private async sendViaMicrosoftGraph(
    to: string,
    subject: string,
    html: string,
    config: EmailConfig,
  ): Promise<{ success: boolean; error?: string }> {
    const tenantId = (config.MS_TENANT_ID || '').trim();
    const clientId = (config.MS_CLIENT_ID || '').trim();
    const clientSecret = (config.MS_CLIENT_SECRET || '').trim();
    const senderEmail = (config.MS_SENDER_EMAIL || '').trim();
    const senderName = (config.MS_SENDER_NAME || '').trim();

    if (!tenantId || !clientId || !clientSecret || !senderEmail) {
      this.logger.warn('Microsoft Graph email configuration is incomplete.');
      return {
        success: false,
        error:
          'Microsoft Graph configuration is incomplete (Tenant ID, Client ID, Client Secret, or Sender Email is missing in Settings).',
      };
    }

    try {
      // 1. Obtain OAuth 2.0 Access Token
      const accessToken = await this.getMicrosoftGraphAccessToken(tenantId, clientId, clientSecret);

      // 2. Prepare Send Endpoint & Payload
      const sendUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`;

      const senderRecipient = {
        emailAddress: {
          address: senderEmail,
          ...(senderName ? { name: senderName } : {}),
        },
      };

      const payload = {
        message: {
          subject,
          body: {
            contentType: 'HTML',
            content: html,
          },
          toRecipients: [
            {
              emailAddress: {
                address: to.trim(),
              },
            },
          ],
          from: senderRecipient,
          sender: senderRecipient,
        },
        saveToSentItems: 'true',
      };

      this.logger.log(`Sending email via Microsoft Graph to ${to} from "${senderName || senderEmail}" <${senderEmail}>`);

      const response = await fetch(sendUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 202 || response.status === 200) {
        this.logger.log(`Email sent successfully via Microsoft Graph to ${to}`);
        return { success: true };
      }

      const respData: any = await response.json().catch(() => null);
      let errorCode = 'HTTP_' + response.status;
      let errorMsg = `Microsoft Graph request failed with status ${response.status}`;

      if (respData?.error) {
        errorCode = respData.error.code || errorCode;
        errorMsg = respData.error.message || errorMsg;
      }

      this.logger.error(`Microsoft Graph send error (${response.status || errorCode}): ${errorMsg}`);

      if (response.status === 401 || errorCode === 'invalid_client' || errorCode === 'InvalidAuthenticationToken') {
        this.msTokenCache = null;
      }

      let userFacingError = `Microsoft Graph Error [${errorCode}]: ${errorMsg}`;
      if (response.status === 401 || errorCode === 'invalid_client') {
        userFacingError = `Microsoft Graph Authentication Failed (401): ${errorMsg}. Please ensure you are using the Client Secret "Value" (not Secret ID) and valid Client ID in Settings.`;
      } else if (response.status === 403 || errorCode === 'ErrorAccessDenied') {
        userFacingError = `Access Denied (403): The application does not have permission to send mail as ${senderEmail}. Ensure Mail.Send permissions or Exchange Online Application Access Policy are configured for this mailbox.`;
      } else if (response.status === 404 || errorCode === 'ErrorItemNotFound') {
        userFacingError = `Mailbox Not Found (404): Sender account ${senderEmail} does not exist in your Microsoft 365 tenant.`;
      }

      return { success: false, error: userFacingError };
    } catch (error: any) {
      this.logger.error(`Microsoft Graph dispatch exception: ${error.message}`);
      return { success: false, error: error.message || 'Failed to dispatch email via Microsoft Graph' };
    }
  }

  /**
   * Retrieves or refreshes Microsoft Graph OAuth 2.0 access token using client_credentials grant.
   */
  private async getMicrosoftGraphAccessToken(
    tenantId: string,
    clientId: string,
    clientSecret: string,
  ): Promise<string> {
    const now = Date.now();

    const credentialHash = crypto
      .createHash('sha256')
      .update(`${tenantId}:${clientId}:${clientSecret}`)
      .digest('hex');

    if (
      this.msTokenCache &&
      this.msTokenCache.credentialHash === credentialHash &&
      this.msTokenCache.expiresAt > now + 60000
    ) {
      return this.msTokenCache.token;
    }

    const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('scope', 'https://graph.microsoft.com/.default');
    params.append('grant_type', 'client_credentials');

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const errJson: any = await res.json().catch(() => null);
      const errorMsg = errJson?.error_description || errJson?.error || `HTTP ${res.status}`;
      throw new Error(`Microsoft OAuth Token Error: ${errorMsg}`);
    }

    const data: any = await res.json();
    if (!data?.access_token) {
      throw new Error('No access_token returned by Microsoft OAuth endpoint.');
    }

    const expiresInSeconds = Number(data.expires_in) || 3599;
    this.msTokenCache = {
      token: data.access_token,
      expiresAt: now + expiresInSeconds * 1000,
      credentialHash,
    };

    return this.msTokenCache.token;
  }

  /**
   * Dispatches email via standard SMTP (Gmail, custom SMTP).
   */
  private async sendViaSmtp(
    to: string,
    subject: string,
    html: string,
    config: EmailConfig,
  ): Promise<{ success: boolean; error?: string }> {
    const host = (config.SMTP_HOST || '').trim();
    const portStr = (config.SMTP_PORT || '').toString().trim();
    const port = portStr ? parseInt(portStr, 10) : 587;
    const user = (config.SMTP_USER || '').trim();
    const pass = (config.SMTP_PASSWORD || '').trim();
    const from = (config.SMTP_FROM || '').trim() || user;
    const senderName = (config.MS_SENDER_NAME || 'Avilo System').trim();
    const fromAddress = senderName ? `"${senderName}" <${from}>` : from;

    if (!host || !user || !pass) {
      this.logger.warn('SMTP configuration is missing.');
      return { success: false, error: 'SMTP configuration is not set up in Settings (Host, User, or Password missing).' };
    }

    let secure = config.SMTP_SECURE === 'true' || config.SMTP_SECURE === true;
    if (port === 465) {
      secure = true;
    } else if (port === 587 || port === 25) {
      secure = false;
    }

    try {
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        requireTLS: port === 587 || secure === false,
        auth: {
          user,
          pass,
        },
        tls: {
          rejectUnauthorized: false,
        },
      });

      const info = await transporter.sendMail({
        from: fromAddress,
        to,
        subject,
        html,
      });

      this.logger.log(`Email sent successfully via SMTP to ${to}: ${info.messageId}`);
      return { success: true };
    } catch (error: any) {
      this.logger.error(`Failed to send email via SMTP to ${to}: ${error.message}`);

      let errorMessage = `Failed to send email via SMTP to ${to}: ${error.message}`;
      if (error.message?.includes('wrong version number')) {
        errorMessage =
          'SSL/TLS configuration mismatch. For Port 587, STARTTLS is used (secure should be false). For Port 465, direct SSL is used (secure should be true).';
      } else if (
        error.message?.includes('Invalid login') ||
        error.message?.includes('Username and Password not accepted') ||
        error.message?.includes('535-5.7.8')
      ) {
        errorMessage = 'Authentication failed: Invalid SMTP credentials or Google App Password required.';
      } else if (error.code === 'ETIMEDOUT' || error.message?.includes('ETIMEDOUT')) {
        errorMessage = 'Connection timeout: Network issue or the SMTP server is unreachable.';
      } else if (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
        errorMessage = 'Connection refused: Port is blocked or SMTP server is down.';
      }

      return { success: false, error: errorMessage };
    }
  }
}
