import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

class EmailService {
  private transporter: Transporter | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    if (process.env.SMTP_HOST && process.env.SMTP_PORT) {
      this.transporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else {
      // Development fallback - console log emails
      console.warn('Email service not configured. Emails will be logged to console.');
    }
  }

  async sendEmail(to: string, subject: string, html: string, text?: string) {
    const from = process.env.SMTP_FROM || 'noreply@devbox-orchestrator.com';

    if (!this.transporter) {
      console.log('📧 Email (dev mode):');
      console.log(`To: ${to}`);
      console.log(`Subject: ${subject}`);
      console.log(`Content: ${text || 'HTML email'}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject,
        html,
        text,
      });
    } catch (error) {
      console.error('Failed to send email:', error);
      throw new Error('Failed to send email');
    }
  }

  async sendVerificationEmail(email: string, verificationUrl: string) {
    const subject = 'Verify your DevBox Orchestrator account';
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f8f9fa; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to DevBox Orchestrator</h1>
            </div>
            <div class="content">
              <p>Thank you for signing up! Please verify your email address to complete your registration.</p>
              <p style="text-align: center; margin: 30px 0;">
                <a href="${verificationUrl}" class="button">Verify Email Address</a>
              </p>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 4px;">
                ${verificationUrl}
              </p>
              <p>This link will expire in 24 hours.</p>
            </div>
            <div class="footer">
              <p>If you didn't create an account, you can safely ignore this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `Welcome to DevBox Orchestrator!

Thank you for signing up! Please verify your email address by clicking the link below:

${verificationUrl}

This link will expire in 24 hours.

If you didn't create an account, you can safely ignore this email.`;

    await this.sendEmail(email, subject, html, text);
  }

  async sendTeamInvitation(email: string, inviterName: string, organizationName: string, invitationUrl: string, role: string) {
    const subject = `You've been invited to join ${organizationName} on DevBox Orchestrator`;
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f8f9fa; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #28a745; color: white; text-decoration: none; border-radius: 4px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
            .role-badge { display: inline-block; padding: 4px 12px; background-color: #e9ecef; border-radius: 4px; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Team Invitation</h1>
            </div>
            <div class="content">
              <p><strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> on DevBox Orchestrator as a <span class="role-badge">${role}</span>.</p>
              <p>DevBox Orchestrator helps teams manage virtual machines and development environments in Google Cloud Platform.</p>
              <p style="text-align: center; margin: 30px 0;">
                <a href="${invitationUrl}" class="button">Accept Invitation</a>
              </p>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 4px;">
                ${invitationUrl}
              </p>
              <p>This invitation will expire in 7 days.</p>
            </div>
            <div class="footer">
              <p>If you don't know ${inviterName} or weren't expecting this invitation, you can safely ignore this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `You've been invited to join ${organizationName} on DevBox Orchestrator

${inviterName} has invited you to join ${organizationName} as a ${role}.

DevBox Orchestrator helps teams manage virtual machines and development environments in Google Cloud Platform.

Accept the invitation by clicking the link below:

${invitationUrl}

This invitation will expire in 7 days.

If you don't know ${inviterName} or weren't expecting this invitation, you can safely ignore this email.`;

    await this.sendEmail(email, subject, html, text);
  }

  async sendTOTPSetupComplete(email: string) {
    const subject = 'Two-factor authentication enabled';
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f8f9fa; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Two-Factor Authentication Enabled</h1>
            </div>
            <div class="content">
              <p>Two-factor authentication has been successfully enabled for your DevBox Orchestrator account.</p>
              <p>From now on, you'll need to enter a code from your authenticator app when signing in.</p>
              <p><strong>Important:</strong> Make sure to keep your authenticator app safe and consider saving backup codes in a secure location.</p>
            </div>
            <div class="footer">
              <p>If you didn't enable two-factor authentication, please contact support immediately.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `Two-Factor Authentication Enabled

Two-factor authentication has been successfully enabled for your DevBox Orchestrator account.

From now on, you'll need to enter a code from your authenticator app when signing in.

Important: Make sure to keep your authenticator app safe and consider saving backup codes in a secure location.

If you didn't enable two-factor authentication, please contact support immediately.`;

    await this.sendEmail(email, subject, html, text);
  }
}

export const emailService = new EmailService();