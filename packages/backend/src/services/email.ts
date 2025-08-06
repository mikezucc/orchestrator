import sgMail from '@sendgrid/mail';

class EmailService {
  private isConfigured: boolean = false;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const apiKey = process.env.SENDGRID_API_KEY;
    
    if (apiKey && apiKey !== 'your-actual-sendgrid-api-key-here') {
      sgMail.setApiKey(apiKey);
      this.isConfigured = true;
      console.log('✅ SendGrid email service configured');
    } else {
      console.warn('⚠️ SendGrid not configured. Emails will be logged to console.');
      console.warn('Please set SENDGRID_API_KEY in your .env file');
    }
  }

  async sendEmail(to: string, subject: string, html: string, text?: string) {
    const from = {
      email: process.env.SENDGRID_FROM_EMAIL || 'noreply@onfacet.dev',
      name: process.env.SENDGRID_FROM_NAME || 'Facet Build'
    };

    if (!this.isConfigured) {
      console.log('📧 Email (dev mode):');
      console.log(`To: ${to}`);
      console.log(`From: ${from.email}`);
      console.log(`Subject: ${subject}`);
      console.log(`Content: ${text || 'HTML email'}`);
      console.log('---');
      return;
    }

    try {
      await sgMail.send({
        to,
        from,
        subject,
        html,
        text,
      });
      console.log(`✅ Email sent successfully to ${to}`);
    } catch (error: any) {
      console.error('Failed to send email:', error);
      // Log more details in development
      if (error.response) {
        console.error('SendGrid error response:', error.response.body);
      }
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

  async sendTeamInvitation(email: string, inviterName: string, organizationName: string, invitationUrl: string, role: string, isNewUser: boolean = false) {
    const subject = `You've been invited to join ${organizationName} on DevBox Orchestrator`;
    
    const actionText = isNewUser ? 'Get Started' : 'Go to Login';
    const introText = isNewUser 
      ? `<strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> on DevBox Orchestrator as a <span class="role-badge">${role}</span>.`
      : `<strong>${inviterName}</strong> has added you to <strong>${organizationName}</strong> on DevBox Orchestrator as a <span class="role-badge">${role}</span>.`;
    
    const instructionText = isNewUser
      ? `<p>An account has been created for you with this email address. Click the button below to log in and complete your account setup.</p>
         <p><strong>Important:</strong> You'll need to set up two-factor authentication during your first login.</p>`
      : `<p>You can now access ${organizationName} by logging in with your existing account.</p>`;
    
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
            .info-box { background-color: #e8f4f8; border-left: 4px solid #007bff; padding: 15px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Team Invitation</h1>
            </div>
            <div class="content">
              <p>${introText}</p>
              <p>DevBox Orchestrator helps teams manage virtual machines and development environments in Google Cloud Platform.</p>
              ${instructionText}
              <p style="text-align: center; margin: 30px 0;">
                <a href="${invitationUrl}" class="button">${actionText}</a>
              </p>
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 4px;">
                ${invitationUrl}
              </p>
              ${isNewUser ? '<div class="info-box"><strong>Note:</strong> Your account has been created but you will need to verify your email and set up two-factor authentication when you first log in.</div>' : ''}
            </div>
            <div class="footer">
              <p>If you don't know ${inviterName} or weren't expecting this invitation, you can safely ignore this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `You've been invited to join ${organizationName} on DevBox Orchestrator

${isNewUser 
  ? `${inviterName} has invited you to join ${organizationName} as a ${role}.` 
  : `${inviterName} has added you to ${organizationName} as a ${role}.`}

DevBox Orchestrator helps teams manage virtual machines and development environments in Google Cloud Platform.

${isNewUser 
  ? 'An account has been created for you. You will need to set up two-factor authentication during your first login.' 
  : 'You can now access the organization by logging in with your existing account.'}

${actionText} by clicking the link below:

${invitationUrl}

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

  async sendOTPEmail(email: string, otp: string) {
    const subject = 'Your Login Code - DevBox Orchestrator';
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f8f9fa; padding: 20px; text-align: center; }
            .content { padding: 20px; }
            .otp-code { background-color: #f0f8ff; padding: 20px; text-align: center; margin: 20px 0; border-radius: 8px; }
            .otp-code h2 { color: #007bff; letter-spacing: 8px; margin: 0; font-size: 36px; }
            .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Your Login Code</h1>
            </div>
            <div class="content">
              <p>Use the following code to complete your login to DevBox Orchestrator:</p>
              <div class="otp-code">
                <h2>${otp}</h2>
              </div>
              <p>This code will expire in <strong>5 minutes</strong>.</p>
              <p>For security reasons, do not share this code with anyone.</p>
            </div>
            <div class="footer">
              <p>If you didn't request this code, please ignore this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `Your Login Code - DevBox Orchestrator

Use the following code to complete your login to DevBox Orchestrator:

${otp}

This code will expire in 5 minutes.

For security reasons, do not share this code with anyone.

If you didn't request this code, please ignore this email.`;

    await this.sendEmail(email, subject, html, text);

    // Log OTP in development for easy testing
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔐 OTP for ${email}: ${otp}`);
    }
  }
}

export const emailService = new EmailService();