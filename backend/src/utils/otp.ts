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

// Create transporter
let transporter: nodemailer.Transporter | null = null;

async function getTransporter(): Promise<nodemailer.Transporter> {
    if (transporter) return transporter;

    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (smtpUser && smtpPass) {
        // Use Gmail with SSL on port 465 (works on Render, Railway, etc.)
        // Also try service: 'gmail' which auto-configures the right settings
        console.log(`📧 Setting up Gmail SMTP for ${smtpUser}...`);
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: smtpUser,
                pass: smtpPass,
            },
        });

        // Verify connection with timeout
        try {
            await Promise.race([
                transporter.verify(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP verify timeout')), 10000))
            ]);
            console.log('✅ Gmail SMTP connection verified');
        } catch (err: any) {
            console.error('❌ Gmail SMTP verification failed:', err?.message);
            console.log('📧 Will still attempt to send emails...');
            // Don't reset - still try to send, verify() can fail on some hosts but sending works
        }
    } else {
        // Fallback: use Ethereal (free test SMTP)
        console.log('📧 No SMTP credentials found. Using Ethereal test email.');
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
    }

    return transporter;
}

// Send OTP email
export async function sendOTPEmail(email: string, code: string): Promise<void> {
    try {
        const transport = await getTransporter();
        const fromAddress = process.env.SMTP_USER || 'noreply@pairon.dev';

        console.log(`📧 Sending OTP to ${email}...`);

        // Send with timeout to prevent hanging
        const sendPromise = transport.sendMail({
            from: `"PairOn" <${fromAddress}>`,
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

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Email send timeout (15s). SMTP may be blocked on this host.')), 15000)
        );

        const info = await Promise.race([sendPromise, timeoutPromise]) as any;
        console.log(`✅ OTP email sent! MessageId: ${info?.messageId}`);

        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) {
            console.log('📧 Preview URL:', previewUrl);
        }
    } catch (error: any) {
        console.error('❌ Failed to send OTP:', error?.message || error);
        throw new Error('Failed to send verification email. Please try again.');
    }
}
