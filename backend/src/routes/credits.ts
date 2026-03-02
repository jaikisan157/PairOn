import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { CreditTransaction, Certificate, CollaborationSession, User } from '../models';
import { awardCredits, spendCredits, CREDIT_VALUES } from '../services/creditService';

const router = Router();

// ===== CREDIT ROUTES =====

// Get credit history
router.get('/credits/history', authMiddleware, async (req: any, res: any) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const [transactions, total] = await Promise.all([
            CreditTransaction.find({ userId: req.user.userId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            CreditTransaction.countDocuments({ userId: req.user.userId }),
        ]);

        res.json({
            transactions,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Credit history error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get credit balance & summary
router.get('/credits/summary', authMiddleware, async (req: any, res: any) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const [totalEarned, totalSpent] = await Promise.all([
            CreditTransaction.aggregate([
                { $match: { userId: req.user.userId, type: 'earned' } },
                { $group: { _id: null, total: { $sum: '$amount' } } },
            ]),
            CreditTransaction.aggregate([
                { $match: { userId: req.user.userId, type: 'spent' } },
                { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } },
            ]),
        ]);

        res.json({
            balance: user.credits,
            totalEarned: totalEarned[0]?.total || 0,
            totalSpent: totalSpent[0]?.total || 0,
            reputation: user.reputation,
        });
    } catch (error) {
        console.error('Credit summary error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get credit pricing
router.get('/credits/pricing', authMiddleware, async (_req: any, res: any) => {
    res.json({
        earning: {
            onboarding_bonus: CREDIT_VALUES.onboarding_bonus,
            profile_complete: CREDIT_VALUES.profile_complete,
            session_complete: CREDIT_VALUES.session_complete,
            quickchat_helpful: CREDIT_VALUES.quickchat_helpful,
            positive_feedback: CREDIT_VALUES.positive_feedback,
        },
        spending: {
            certificate: CREDIT_VALUES.certificate,
            skill_badge: CREDIT_VALUES.skill_badge,
            priority_matching: CREDIT_VALUES.priority_matching,
            profile_boost: CREDIT_VALUES.profile_boost,
            remark_removal: CREDIT_VALUES.remark_removal,
        },
    });
});

// ===== CERTIFICATE ROUTES =====

// Get user's certificates
router.get('/certificates', authMiddleware, async (req: any, res: any) => {
    try {
        const certificates = await Certificate.find({ userId: req.user.userId })
            .sort({ createdAt: -1 });

        res.json({ certificates });
    } catch (error) {
        console.error('Get certificates error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Generate certificate for a completed session
router.post('/certificates/generate', authMiddleware, async (req: any, res: any) => {
    try {
        const { sessionId } = req.body;
        if (!sessionId) {
            return res.status(400).json({ message: 'Session ID required' });
        }

        // Check if session exists and is completed
        const session = await CollaborationSession.findById(sessionId) as any;
        if (!session) {
            return res.status(404).json({ message: 'Session not found' });
        }
        if (session.status !== 'completed') {
            return res.status(400).json({ message: 'Session is not completed' });
        }

        // Check user was part of this session
        const userId = req.user.userId;
        if (!session.users.includes(userId)) {
            return res.status(403).json({ message: 'Not a participant of this session' });
        }

        // Check if certificate already exists
        const existing = await Certificate.findOne({ userId, sessionId });
        if (existing) {
            return res.json({ certificate: existing, message: 'Certificate already exists' });
        }

        // Find partner
        const partnerId = session.users.find((u: string) => u !== userId);
        const partner = await User.findById(partnerId);
        const user = await User.findById(userId);
        if (!partner || !user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Spend credits
        try {
            await spendCredits(userId, 'certificate', `Certificate for "${session.projectIdea.title}"`);
        } catch (err: any) {
            if (err.message === 'Insufficient credits') {
                return res.status(400).json({ message: `Need ${CREDIT_VALUES.certificate} credits. You have ${user.credits}.` });
            }
            throw err;
        }

        // Create certificate
        const certificate = new Certificate({
            userId,
            sessionId,
            projectTitle: session.projectIdea.title,
            projectDescription: session.projectIdea.description,
            partnerName: partner.name,
            partnerId: partnerId!,
            skills: [...new Set([...user.skills.slice(0, 3), ...partner.skills.slice(0, 3)])],
            duration: session.duration,
            completedAt: session.endedAt || session.startedAt,
            creditsSpent: CREDIT_VALUES.certificate,
        });

        await certificate.save();

        res.json({ certificate, message: 'Certificate generated!' });
    } catch (error) {
        console.error('Generate certificate error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Verify a certificate by its ID (public endpoint)
router.get('/certificates/verify/:certificateId', async (req: any, res: any) => {
    try {
        const cert = await Certificate.findOne({ certificateId: req.params.certificateId });
        if (!cert) {
            return res.status(404).json({ valid: false, message: 'Certificate not found' });
        }

        const user = await User.findById(cert.userId);

        res.json({
            valid: true,
            certificate: {
                certificateId: cert.certificateId,
                userName: user?.name || 'Unknown',
                projectTitle: cert.projectTitle,
                projectDescription: cert.projectDescription,
                partnerName: cert.partnerName,
                skills: cert.skills,
                duration: cert.duration,
                completedAt: cert.completedAt,
                issuedAt: cert.createdAt,
            },
        });
    } catch (error) {
        console.error('Verify certificate error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// ===== REMARK REMOVAL =====

// Remove permanent remark (costs credits)
router.post('/credits/remove-remark', authMiddleware, async (req: any, res: any) => {
    try {
        const userId = req.user.userId;
        const user = await User.findById(userId);

        if (!user) return res.status(404).json({ message: 'User not found' });
        if (!user.permanentRemark) {
            return res.status(400).json({ message: 'No remark to remove' });
        }

        try {
            await spendCredits(userId, 'remark_removal', 'Permanent remark removal');
        } catch (err: any) {
            if (err.message === 'Insufficient credits') {
                return res.status(400).json({ message: `Need ${CREDIT_VALUES.remark_removal} credits. You have ${user.credits}.` });
            }
            throw err;
        }

        // Remove remark and reset warnings
        user.permanentRemark = false;
        user.warnings = 0;
        user.chatPriority = 100;
        await user.save();

        res.json({ message: 'Remark removed successfully', credits: user.credits });
    } catch (error) {
        console.error('Remark removal error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
