import nodemailer from 'nodemailer';
import { Resend } from 'resend';

// In-memory OTP store: email -> { code, expiresAt }
const otpStore = new Map<string, { code: string; expiresAt: number }>();

// Initialize Resend if API key is available
const resendClient = process.env.RESEND_API_KEY
    ? new Resend(process.env.RESEND_API_KEY)
    : null;

if (resendClient) {
    console.log('📧 Using Resend HTTP API for emails');
} else {
    console.log('📧 No RESEND_API_KEY found, will use SMTP/Ethereal fallback');
}

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

// HTML template
function getOtpHtml(code: string): string {
    return `
    <div style="font-family: -apple-system, sans-serif; max-width: 400px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #6C5CE7; text-align: center;">⚡ PairOn Verification</h2>
      <p style="color: #444; text-align: center;">Your verification code is:</p>
      <div style="background: #f5f3ff; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #6C5CE7;">${code}</span>
      </div>
      <p style="color: #888; text-align: center; font-size: 13px;">This code expires in 5 minutes. Do not share it.</p>
    </div>`;
}

// Send via Resend (HTTP - works everywhere)
async function sendViaResend(email: string, code: string): Promise<void> {
    const { data, error } = await resendClient!.emails.send({
        from: 'PairOn <onboarding@resend.dev>',
        to: [email],
        subject: 'PairOn - Your Verification Code',
        html: getOtpHtml(code),
    });
    if (error) {
        console.error('❌ Resend error:', JSON.stringify(error));
        throw new Error(error.message || 'Resend failed');
    }
    console.log(`✅ OTP sent via Resend. ID: ${data?.id}`);
}

// Send via Nodemailer (SMTP - works locally)
let transporter: nodemailer.Transporter | null = null;

async function sendViaSMTP(email: string, code: string): Promise<void> {
    if (!transporter) {
        const smtpUser = process.env.SMTP_USER;
        const smtpPass = process.env.SMTP_PASS;
        if (smtpUser && smtpPass) {
            transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: { user: smtpUser, pass: smtpPass },
            });
        } else {
            const testAccount = await nodemailer.createTestAccount();
            transporter = nodemailer.createTransport({
                host: 'smtp.ethereal.email', port: 587, secure: false,
                auth: { user: testAccount.user, pass: testAccount.pass },
            });
        }
    }

    const fromAddress = process.env.SMTP_USER || 'noreply@pairon.dev';
    const info = await transporter.sendMail({
        from: `"PairOn" <${fromAddress}>`,
        to: email,
        subject: 'PairOn - Your Verification Code',
        html: getOtpHtml(code),
    });
    console.log(`✅ OTP sent via SMTP. MessageId: ${info?.messageId}`);
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) console.log('📧 Preview:', previewUrl);
}

// Main send function
export async function sendOTPEmail(email: string, code: string): Promise<void> {
    console.log(`📧 Sending OTP to ${email}...`);
    try {
        if (resendClient) {
            await sendViaResend(email, code);
        } else {
            await sendViaSMTP(email, code);
        }
    } catch (error: any) {
        console.error('❌ Failed to send OTP:', error?.message || error);
        throw new Error('Failed to send verification email');
    }
}
