import nodemailer from 'nodemailer';

// Try to use Resend if available, fallback to nodemailer
let resendClient: any = null;
try {
    const { Resend } = require('resend');
    if (process.env.RESEND_API_KEY) {
        resendClient = new Resend(process.env.RESEND_API_KEY);
        console.log('📧 Using Resend HTTP API for emails');
    }
} catch (e) {
    // resend not installed, will use nodemailer
}

// In-memory OTP store: email -> { code, expiresAt }
const otpStore = new Map<string, { code: string; expiresAt: number }>();

// Generate a 6-digit OTP
export function generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// Store OTP for email (5 min expiry)
export function storeOTP(email: string): string {
    const code = generateOTP();
    otpStore.set(email, { code, expiresAt: Date.now() + 5 * 60 * 1000 });
    return code;
}

// Verify OTP
export function verifyOTP(email: string, code: string): boolean {
    const entry = otpStore.get(email);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
        otpStore.delete(email);
        return false;
    }
    if (entry.code !== code) return false;
    otpStore.delete(email); // One-time use
    return true;
}

// HTML template for OTP email
function getOtpHtml(code: string): string {
    return `
    <div style="font-family: -apple-system, sans-serif; max-width: 400px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #6C5CE7; text-align: center;">⚡ PairOn Verification</h2>
      <p style="color: #444; text-align: center;">Your verification code is:</p>
      <div style="background: #f5f3ff; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #6C5CE7;">${code}</span>
      </div>
      <p style="color: #888; text-align: center; font-size: 13px;">This code expires in 5 minutes. Do not share it.</p>
    </div>
  `;
}

// ===== Send via Resend (HTTP API — works on Render, Railway, etc.) =====
async function sendViaResend(email: string, code: string): Promise<void> {
    const { data, error } = await resendClient.emails.send({
        from: 'PairOn <onboarding@resend.dev>',
        to: [email],
        subject: 'PairOn - Your Verification Code',
        html: getOtpHtml(code),
    });

    if (error) {
        console.error('❌ Resend error:', error);
        throw new Error('Failed to send verification email');
    }
    console.log(`✅ OTP sent via Resend. ID: ${data?.id}`);
}

// ===== Send via Nodemailer (SMTP — works locally, NOT on Render free tier) =====
let transporter: nodemailer.Transporter | null = null;

async function getTransporter(): Promise<nodemailer.Transporter> {
    if (transporter) return transporter;

    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (smtpUser && smtpPass) {
        console.log(`📧 Setting up Gmail SMTP for ${smtpUser}...`);
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: smtpUser, pass: smtpPass },
        });
    } else {
        console.log('📧 No email credentials. Using Ethereal test email.');
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: { user: testAccount.user, pass: testAccount.pass },
        });
    }
    return transporter;
}

async function sendViaNodemailer(email: string, code: string): Promise<void> {
    const transport = await getTransporter();
    const fromAddress = process.env.SMTP_USER || 'noreply@pairon.dev';

    const sendPromise = transport.sendMail({
        from: `"PairOn" <${fromAddress}>`,
        to: email,
        subject: 'PairOn - Your Verification Code',
        html: getOtpHtml(code),
    });

    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Email send timeout (10s). SMTP may be blocked.')), 10000)
    );

    const info = await Promise.race([sendPromise, timeoutPromise]) as any;
    console.log(`✅ OTP sent via SMTP. MessageId: ${info?.messageId}`);

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) console.log('📧 Preview:', previewUrl);
}

// ===== Main send function: tries Resend first, falls back to SMTP =====
export async function sendOTPEmail(email: string, code: string): Promise<void> {
    console.log(`📧 Sending OTP to ${email}...`);

    try {
        if (resendClient) {
            await sendViaResend(email, code);
        } else {
            await sendViaNodemailer(email, code);
        }
    } catch (error: any) {
        console.error('❌ Failed to send OTP:', error?.message || error);
        throw new Error('Failed to send verification email. Please try again.');
    }
}
