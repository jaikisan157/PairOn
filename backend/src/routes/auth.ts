import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { User } from '../models';
import { generateToken } from '../middleware/auth';
import { storeOTP, verifyOTP, sendOTPEmail } from '../utils/otp';

const router = Router();

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Helper: build safe user response (never leak password/internals)
function safeUserResponse(user: any) {
  return {
    id: user._id,
    email: user.email,
    name: user.name,
    credits: user.credits,
    reputation: user.reputation,
    completedProjects: user.completedProjects,
    skills: user.skills,
    interests: user.interests,
    experienceLevel: user.experienceLevel,
    bio: user.bio,
    badges: user.badges,
    avatar: user.avatar,
    role: user.role,
    onboardingComplete: user.onboardingComplete,
    warnings: user.warnings,
    permanentRemark: user.permanentRemark,
    isOnline: user.isOnline,
    lastActive: user.lastActive,
    previousMatches: user.previousMatches,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// ===== Send OTP =====
router.post(
  '/send-otp',
  [body('email').isEmail().normalizeEmail()],
  async (req: any, res: any) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email } = req.body;
      const code = storeOTP(email);
      await sendOTPEmail(email, code);
      res.json({ message: 'OTP sent to your email' });
    } catch (error) {
      console.error('Send OTP error:', error);
      res.status(500).json({ message: 'Failed to send OTP' });
    }
  }
);

// ===== Verify OTP =====
router.post(
  '/verify-otp',
  [
    body('email').isEmail().normalizeEmail(),
    body('code').isLength({ min: 6, max: 6 }),
  ],
  async (req: any, res: any) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, code } = req.body;
      const valid = verifyOTP(email, code);
      if (!valid) {
        return res.status(400).json({ message: 'Invalid or expired OTP' });
      }

      res.json({ verified: true });
    } catch (error) {
      console.error('Verify OTP error:', error);
      res.status(500).json({ message: 'Verification failed' });
    }
  }
);

// ===== Google Auth =====
router.post(
  '/google',
  [body('credential').exists()],
  async (req: any, res: any) => {
    try {
      const { credential } = req.body;

      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        return res.status(400).json({ message: 'Invalid Google token' });
      }

      const { email, name, picture, sub: googleId } = payload;

      // Find or create user
      let user = await User.findOne({ email });

      if (!user) {
        user = new User({
          email,
          password: `google_${googleId}_${Date.now()}`, // placeholder, won't be used for login
          name: name || email.split('@')[0],
          avatar: picture || '',
          credits: 100,
          googleId,
        });
        await user.save();
      }

      // Update last active
      user.lastActive = new Date();
      user.isOnline = true;
      await user.save();

      const token = generateToken({
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      });

      res.json({
        token,
        user: safeUserResponse(user),
      });
    } catch (error) {
      console.error('Google auth error:', error);
      res.status(500).json({ message: 'Google authentication failed' });
    }
  }
);

// ===== Register =====
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  ],
  async (req: any, res: any) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, name } = req.body;

      // Check if user exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: 'User already exists' });
      }

      // Create user
      const user = new User({
        email,
        password,
        name,
        credits: 100,
      });

      await user.save();

      // Generate token
      const token = generateToken({
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      });

      res.status(201).json({
        token,
        user: safeUserResponse(user),
      });
    } catch (error) {
      console.error('Register error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// ===== Login =====
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').exists(),
  ],
  async (req: any, res: any) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      // Find user
      const user = await User.findOne({ email });
      if (!user) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Check password
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      // Update last active
      user.lastActive = new Date();
      user.isOnline = true;
      await user.save();

      // Generate token (include role)
      const token = generateToken({
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
      });

      res.json({
        token,
        user: safeUserResponse(user),
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// ===== Get current user =====
router.get('/me', async (req: any, res: any) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.substring(7);

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: 'JWT secret not configured' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET) as { userId: string };

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: safeUserResponse(user),
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(401).json({ message: 'Invalid token' });
  }
});

export default router;
