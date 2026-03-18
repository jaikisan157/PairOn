import { Router } from 'express';
import { body } from 'express-validator';
import { User } from '../models';
import { authMiddleware, adminMiddleware } from '../middleware/auth';

const router = Router();

// Helper: safe user response
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

// Whitelist of fields users are allowed to update on their own profile
const ALLOWED_PROFILE_FIELDS = ['name', 'bio', 'skills', 'interests', 'experienceLevel', 'avatar', 'onboardingComplete'];

// Get user profile
router.get('/profile', authMiddleware, async (req: any, res: any) => {
  try {
    const user = await User.findById(req.user?.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user: safeUserResponse(user) });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user profile — only whitelisted fields allowed
router.patch(
  '/profile',
  authMiddleware,
  [
    body('name').optional().trim().isLength({ min: 2 }),
    body('bio').optional().trim(),
    body('skills').optional().isArray(),
    body('interests').optional().isArray(),
    body('experienceLevel').optional().isIn(['beginner', 'intermediate', 'advanced', 'expert']),
  ],
  async (req: any, res: any) => {
    try {
      // Filter to only allowed fields (blocks credits, reputation, role injection)
      const sanitizedUpdates: Record<string, any> = {};
      for (const key of ALLOWED_PROFILE_FIELDS) {
        if (req.body[key] !== undefined) {
          sanitizedUpdates[key] = req.body[key];
        }
      }

      if (Object.keys(sanitizedUpdates).length === 0) {
        return res.status(400).json({ message: 'No valid fields to update' });
      }

      const user = await User.findByIdAndUpdate(
        req.user?.userId,
        { $set: sanitizedUpdates },
        { new: true }
      );

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json({ user: safeUserResponse(user) });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

// Get user stats
router.get('/stats', authMiddleware, async (req: any, res: any) => {
  try {
    const user = await User.findById(req.user?.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      stats: {
        credits: user.credits,
        reputation: user.reputation,
        completedProjects: user.completedProjects,
        totalMatches: user.previousMatches.length,
        badges: user.badges.length,
      },
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Search users — admin only
router.get('/search', authMiddleware, adminMiddleware, async (req: any, res: any) => {
  try {
    const { query } = req.query;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ message: 'Search query is required' });
    }

    // Escape regex special characters to prevent ReDoS / injection
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const users = await User.find({
      $or: [
        { name: { $regex: escapedQuery, $options: 'i' } },
        { email: { $regex: escapedQuery, $options: 'i' } },
      ],
    }).limit(20);

    res.json({
      users: users.map((user) => ({
        id: user._id,
        name: user.name,
        email: user.email,
        isOnline: user.isOnline,
        lastActive: user.lastActive,
        reputation: user.reputation,
        role: user.role,
      })),
    });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get online collaborators count
router.get('/online-count', authMiddleware, async (_req: any, res: any) => {
  try {
    const count = await User.countDocuments({ isOnline: true });
    res.json({ onlineCount: count });
  } catch (error) {
    console.error('Online count error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// One-time migration: fix existing users with reputation 0 → 100
router.post('/migrate-reputation', authMiddleware, async (_req: any, res: any) => {
  try {
    const result = await User.updateMany(
      { reputation: { $lt: 100 } },
      { $set: { reputation: 100 } }
    );
    res.json({ message: `Updated ${result.modifiedCount} users to reputation 100` });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get PUBLIC profile of any user by ID (for viewing partner / friend profiles)
router.get('/:id', authMiddleware, async (req: any, res: any) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    // Return only public-safe fields
    res.json({
      id: user._id,
      name: user.name,
      bio: user.bio,
      avatar: user.avatar,
      skills: user.skills,
      interests: user.interests,
      experienceLevel: user.experienceLevel,
      reputation: user.reputation,
      completedProjects: user.completedProjects,
      badges: user.badges,
      isOnline: user.isOnline,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error('Get user by id error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
