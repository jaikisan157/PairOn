import nodemailer from 'nodemailer';

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

// Create transporter (use env vars or fallback to ethereal for dev)
let transporter: nodemailer.Transporter | null = null;

async function getTransporter(): Promise<nodemailer.Transporter> {
    if (transporter) return transporter;

    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
    } else {
        // Fallback: use Ethereal (free test SMTP)
        const testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: {
                user: testAccount.user,
                pass: testAccount.pass,
            },
        });
        console.log('📧 Using Ethereal test email. Preview URLs will be logged.');
    }

    return transporter;
}

// Send OTP email
export async function sendOTPEmail(email: string, code: string): Promise<void> {
    try {
        const transport = await getTransporter();
        const info = await transport.sendMail({
            from: process.env.SMTP_FROM || '"PairOn" <noreply@pairon.dev>',
            to: email,
            subject: 'PairOn - Your Verification Code',
            html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 400px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #6C5CE7; text-align: center;">⚡ PairOn Verification</h2>
          <p style="color: #444; text-align: center;">Your verification code is:</p>
          <div style="background: #f5f3ff; border-radius: 12px; padding: 20px; text-align: center; margin: 20px 0;">
            <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #6C5CE7;">${code}</span>
          </div>
          <p style="color: #888; text-align: center; font-size: 13px;">This code expires in 5 minutes. Do not share it.</p>
        </div>
      `,
        });

        // Log preview URL in dev (Ethereal)
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) {
            console.log('📧 OTP email preview:', previewUrl);
        }
    } catch (error) {
        console.error('Failed to send OTP email:', error);
        throw new Error('Failed to send verification email');
    }
}
