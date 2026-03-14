import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { DirectMessage } from '../models';
import { User } from '../models';
import { authMiddleware } from '../middleware/auth';
import { getIo } from '../lib/ioInstance';

const router = Router();

// Helper: build normalized participant pair (sorted so order doesn't matter)
function participantPair(a: string, b: string): [string, string] {
    return [a, b].sort() as [string, string];
}

// Helper: find thread by participant pair
async function findThread(userIdA: string, userIdB: string) {
    const pair = participantPair(userIdA, userIdB);
    return DirectMessage.findOne({ participants: { $all: pair, $size: 2 } });
}

// ──────────────────────────────────────────────
// GET /api/dm/threads — list all conversations
// ──────────────────────────────────────────────
router.get('/threads', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const threads = await DirectMessage.find({ participants: userId })
            .sort({ lastMessageAt: -1 })
            .lean();

        const enriched = await Promise.all(threads.map(async (thread) => {
            const partnerId = thread.participants.find((p: string) => p.toString() !== userId.toString());
            const partner = await User.findById(partnerId).select('name reputation').lean();
            const unread = thread.messages.filter((m: any) => !m.read && m.senderId.toString() !== userId.toString()).length;
            return {
                threadId: thread._id,
                partner: {
                    id: partnerId?.toString(),
                    name: (partner as any)?.name || 'Unknown',
                    reputation: (partner as any)?.reputation || 0,
                },
                lastMessage: thread.lastMessage || '',
                lastMessageAt: thread.lastMessageAt,
                unread,
            };
        }));

        res.json({ threads: enriched });
    } catch (err: any) {
        console.error('[DM /threads]', err.message);
        res.status(500).json({ error: 'Failed to load DM threads' });
    }
});

// ──────────────────────────────────────────────
// GET /api/dm/thread/:friendId — open / create thread
// No hardcoded friendship check — users come from the friends page.
// ──────────────────────────────────────────────
router.get('/thread/:friendId', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const { friendId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(friendId)) {
            return res.status(400).json({ error: 'Invalid friend ID' });
        }

        // Find or create thread — participants stored sorted so the query is deterministic
        const pair = participantPair(userId, friendId);
        let thread = await DirectMessage.findOne({ participants: { $all: pair, $size: 2 } });

        if (!thread) {
            thread = await DirectMessage.create({
                participants: pair,
                messages: [],
                lastMessageAt: new Date(),
                lastMessage: '',
            });
        }

        // Mark partner's messages as read (best-effort)
        await DirectMessage.updateOne(
            { _id: thread._id },
            { $set: { 'messages.$[elem].read': true } },
            { arrayFilters: [{ 'elem.senderId': { $ne: userId }, 'elem.read': false }] }
        ).catch(() => {});

        const partner = await User.findById(friendId).select('name reputation').lean();

        res.json({
            threadId: thread._id,
            partner: {
                id: friendId,
                name: (partner as any)?.name || 'Unknown',
                reputation: (partner as any)?.reputation || 0,
            },
            messages: thread.messages,
        });
    } catch (err: any) {
        console.error('[DM GET /thread]', err.message);
        res.status(500).json({ error: 'Failed to load DM thread' });
    }
});

// ──────────────────────────────────────────────
// POST /api/dm/thread/:friendId/send
// ──────────────────────────────────────────────
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
        if (!mongoose.Types.ObjectId.isValid(friendId)) {
            return res.status(400).json({ error: 'Invalid friend ID' });
        }

        const message = {
            id: `dm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            senderId: userId,
            content: content.trim(),
            timestamp: new Date(),
            read: false,
        };

        // Use participant pair (sorted) for consistent lookup — and setOnInsert for safe upsert
        const pair = participantPair(userId, friendId);
        const thread = await DirectMessage.findOneAndUpdate(
            { participants: { $all: pair, $size: 2 } },
            {
                $push: { messages: message },
                $set: { lastMessage: content.trim().slice(0, 80), lastMessageAt: new Date() },
                // CRITICAL: only set participants on insert so validation passes
                $setOnInsert: { participants: pair },
            },
            { new: true, upsert: true }
        );

        // Real-time push to recipient via their personal room
        const io = getIo();
        if (io) {
            const sender = await User.findById(userId).select('name').lean();
            io.to(`user:${friendId}`).emit('dm:new-message', {
                threadId: thread?._id,
                message: { ...message, timestamp: message.timestamp.toISOString() },
                fromId: userId,
                fromName: (sender as any)?.name || 'Someone',
            });
        }

        res.json({
            message: { ...message, timestamp: message.timestamp.toISOString() },
            threadId: thread?._id,
        });
    } catch (err: any) {
        console.error('[DM POST /send]', err.message);
        res.status(500).json({ error: err.message || 'Failed to send message' });
    }
});

// ──────────────────────────────────────────────
// GET /api/dm/unread-count
// ──────────────────────────────────────────────
router.get('/unread-count', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const threads = await DirectMessage.find({ participants: userId }).lean();
        const total = threads.reduce((sum, t) =>
            sum + t.messages.filter((m: any) => !m.read && m.senderId.toString() !== userId.toString()).length
        , 0);
        res.json({ count: total });
    } catch {
        res.json({ count: 0 });
    }
});

export default router;
