import { Router, Request, Response } from 'express';
import { DirectMessage } from '../models';
import { Friendship } from '../models';
import { User } from '../models';
import { authMiddleware } from '../middleware/auth';
import { getIo } from '../lib/ioInstance';

const router = Router();

// Get all DM threads for the current user (conversation list)
router.get('/threads', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const threads = await DirectMessage.find({ participants: userId })
            .sort({ lastMessageAt: -1 })
            .lean();

        // Get partner info for each thread
        const enriched = await Promise.all(threads.map(async (thread) => {
            const partnerId = thread.participants.find((p: string) => p !== userId);
            const partner = await User.findById(partnerId).select('name reputation avatar').lean();
            const unread = thread.messages.filter((m: any) => !m.read && m.senderId !== userId).length;
            return {
                threadId: thread._id,
                partner: { id: partnerId, name: (partner as any)?.name, reputation: (partner as any)?.reputation || 0 },
                lastMessage: thread.lastMessage || '',
                lastMessageAt: thread.lastMessageAt,
                unread,
            };
        }));

        res.json({ threads: enriched });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load DM threads' });
    }
});

// Get or create DM thread with a specific friend
router.get('/thread/:friendId', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const { friendId } = req.params;

        // Verify they are friends
        const friendship = await Friendship.findOne({
            $or: [
                { requester: userId, recipient: friendId, status: 'accepted' },
                { requester: friendId, recipient: userId, status: 'accepted' },
            ],
        });
        if (!friendship) {
            return res.status(403).json({ error: 'You can only DM friends' });
        }

        // Find or create thread
        let thread = await DirectMessage.findOne({
            participants: { $all: [userId, friendId], $size: 2 },
        });

        if (!thread) {
            thread = await DirectMessage.create({
                participants: [userId, friendId],
                messages: [],
                lastMessageAt: new Date(),
            });
        }

        // Mark messages from partner as read
        await DirectMessage.updateOne(
            { _id: thread._id },
            { $set: { 'messages.$[elem].read': true } },
            { arrayFilters: [{ 'elem.senderId': { $ne: userId }, 'elem.read': false }] }
        );

        const partner = await User.findById(friendId).select('name reputation').lean();

        res.json({
            threadId: thread._id,
            partner: { id: friendId, name: (partner as any)?.name, reputation: (partner as any)?.reputation || 0 },
            messages: thread.messages,
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load DM thread' });
    }
});

// Send a DM message
router.post('/thread/:friendId/send', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const { friendId } = req.params;
        const { content } = req.body;

        if (!content || !content.trim()) {
            return res.status(400).json({ error: 'Message cannot be empty' });
        }
        if (content.trim().length > 2000) {
            return res.status(400).json({ error: 'Message too long (max 2000 chars)' });
        }

        // Verify friendship
        const friendship = await Friendship.findOne({
            $or: [
                { requester: userId, recipient: friendId, status: 'accepted' },
                { requester: friendId, recipient: userId, status: 'accepted' },
            ],
        });
        if (!friendship) {
            return res.status(403).json({ error: 'You can only DM friends' });
        }

        const message = {
            id: `dm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            senderId: userId,
            content: content.trim(),
            timestamp: new Date(),
            read: false,
        };

        let thread = await DirectMessage.findOneAndUpdate(
            { participants: { $all: [userId, friendId], $size: 2 } },
            {
                $push: { messages: message },
                $set: { lastMessage: content.trim().slice(0, 60), lastMessageAt: new Date() },
            },
            { new: true, upsert: true }
        );

        // Real-time push to recipient
        const io = getIo();
        if (io) {
            const sender = await User.findById(userId).select('name').lean();
            io.to(`user:${friendId}`).emit('dm:new-message', {
                threadId: thread?._id,
                message,
                fromId: userId,
                fromName: (sender as any)?.name,
            });
        }

        res.json({ message });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Get unread DM count (for notification badge)
router.get('/unread-count', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const threads = await DirectMessage.find({ participants: userId }).lean();
        const total = threads.reduce((sum, t) => {
            return sum + t.messages.filter((m: any) => !m.read && m.senderId !== userId).length;
        }, 0);
        res.json({ count: total });
    } catch {
        res.json({ count: 0 });
    }
});

export default router;
