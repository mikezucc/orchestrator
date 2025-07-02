import { config } from 'dotenv';
import { emailService } from './src/services/email.js';

// Load environment variables
config();

async function testEmailService() {
  console.log('🧪 Testing SendGrid Email Service\n');

  // Check configuration
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SENDGRID_FROM_EMAIL || 'noreply@slopbox.dev';
  
  console.log('Configuration:');
  console.log(`- API Key: ${apiKey ? '✅ Set' : '❌ Not set'}`);
  console.log(`- From Email: ${fromEmail}`);
  console.log(`- From Name: ${process.env.SENDGRID_FROM_NAME || 'Slopbox'}\n`);

  if (!apiKey || apiKey === 'your-actual-sendgrid-api-key-here') {
    console.log('⚠️  Please set SENDGRID_API_KEY in your .env file to test real email sending');
    console.log('📧 Testing in console log mode:\n');
  }

  // Test OTP Email
  console.log('1️⃣  Testing OTP Email...');
  try {
    await emailService.sendOTPEmail('test@example.com', '123456');
    console.log('✅ OTP email test passed\n');
  } catch (error) {
    console.error('❌ OTP email test failed:', error);
  }

  // Test Verification Email
  console.log('2️⃣  Testing Verification Email...');
  try {
    await emailService.sendVerificationEmail(
      'test@example.com',
      'https://slopbox.dev/verify?token=test-token'
    );
    console.log('✅ Verification email test passed\n');
  } catch (error) {
    console.error('❌ Verification email test failed:', error);
  }

  // Test Team Invitation
  console.log('3️⃣  Testing Team Invitation Email...');
  try {
    await emailService.sendTeamInvitation(
      'test@example.com',
      'John Doe',
      'Acme Corp',
      'https://slopbox.dev/invite?token=test-token',
      'Developer'
    );
    console.log('✅ Team invitation email test passed\n');
  } catch (error) {
    console.error('❌ Team invitation email test failed:', error);
  }

  // Test TOTP Setup Complete
  console.log('4️⃣  Testing TOTP Setup Complete Email...');
  try {
    await emailService.sendTOTPSetupComplete('test@example.com');
    console.log('✅ TOTP setup email test passed\n');
  } catch (error) {
    console.error('❌ TOTP setup email test failed:', error);
  }

  console.log('🎉 Email service testing complete!');
  console.log('\nNote: To test actual email sending:');
  console.log('1. Get your SendGrid API key from https://app.sendgrid.com/settings/api_keys');
  console.log('2. Set SENDGRID_API_KEY in your .env file');
  console.log('3. Make sure noreply@slopbox.dev is verified in SendGrid');
  console.log('4. Run this test again with a real email address');
}

testEmailService().catch(console.error);