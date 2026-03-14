import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { DirectMessage } from '../models';
import { User } from '../models';
import { authMiddleware } from '../middleware/auth';
import { getIo } from '../lib/ioInstance';

const router = Router();

// Sort participant IDs so the pair is always in the same order regardless of who opens first
function sortedPair(a: string, b: string): [string, string] {
    return [a, b].sort() as [string, string];
}

// ─────────────────────────────────────────────
// GET /api/dm/thread/:friendId
// Get or create the direct-message thread between current user and friendId
// ─────────────────────────────────────────────
router.get('/thread/:friendId', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { friendId } = req.params;

        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (!mongoose.Types.ObjectId.isValid(friendId)) {
            return res.status(400).json({ error: 'Invalid friend ID' });
        }

        const pair = sortedPair(userId, friendId);

        // Find existing thread or create one
        let thread = await DirectMessage.findOne({
            participants: { $all: pair, $size: 2 },
        });

        if (!thread) {
            thread = await DirectMessage.create({
                participants: pair,
                messages: [],
                lastMessageAt: new Date(),
            });
        }

        const partner = await User.findById(friendId).select('name reputation').lean();

        res.json({
            threadId: thread._id,
            partner: {
                id: friendId,
                name: (partner as any)?.name || 'User',
                reputation: (partner as any)?.reputation || 0,
            },
            messages: thread.messages.map((m: any) => ({
                id: m.id,
                senderId: m.senderId,
                content: m.content,
                timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : m.timestamp,
                read: m.read,
            })),
        });
    } catch (err: any) {
        console.error('[DM GET /thread]', err.message);
        res.status(500).json({ error: 'Failed to load thread' });
    }
});

// ─────────────────────────────────────────────
// POST /api/dm/thread/:friendId/send
// ─────────────────────────────────────────────
router.post('/thread/:friendId/send', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { friendId } = req.params;
        const { content } = req.body;

        if (!userId) return res.status(401).json({ error: 'Unauthorized' });
        if (!content?.trim()) return res.status(400).json({ error: 'Empty message' });
        if (content.trim().length > 2000) return res.status(400).json({ error: 'Message too long' });
        if (!mongoose.Types.ObjectId.isValid(friendId)) {
            return res.status(400).json({ error: 'Invalid friend ID' });
        }

        const pair = sortedPair(userId, friendId);

        const message = {
            id: `dm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            senderId: userId,   // store as the userId string from JWT
            content: content.trim(),
            timestamp: new Date(),
            read: false,
        };

        // Upsert: find the thread or create it, then push the message
        // $setOnInsert ensures participants are set when creating a new doc
        const thread = await DirectMessage.findOneAndUpdate(
            { participants: { $all: pair, $size: 2 } },
            {
                $push: { messages: message },
                $set: {
                    lastMessage: content.trim().slice(0, 80),
                    lastMessageAt: new Date(),
                },
                $setOnInsert: { participants: pair },
            },
            { new: true, upsert: true }
        );

        const serializedMsg = {
            ...message,
            timestamp: message.timestamp.toISOString(),
        };

        // Real-time push to the recipient's socket room
        const io = getIo();
        if (io) {
            const sender = await User.findById(userId).select('name').lean();
            io.to(`user:${friendId}`).emit('dm:new-message', {
                threadId: thread?._id,
                message: serializedMsg,
                fromId: userId,
                fromName: (sender as any)?.name || 'Someone',
            });
        }

        res.json({ message: serializedMsg });
    } catch (err: any) {
        console.error('[DM POST /send]', err.message);
        res.status(500).json({ error: err.message || 'Failed to send' });
    }
});

// ─────────────────────────────────────────────
// DELETE /api/dm/thread/:friendId
// Called when a friendship is removed — deletes the DM thread
// ─────────────────────────────────────────────
router.delete('/thread/:friendId', authMiddleware, async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { friendId } = req.params;
        if (!userId) return res.status(401).json({ error: 'Unauthorized' });

        const pair = sortedPair(userId, friendId);
        await DirectMessage.deleteOne({ participants: { $all: pair, $size: 2 } });
        res.json({ ok: true });
    } catch (err: any) {
        console.error('[DM DELETE /thread]', err.message);
        res.status(500).json({ error: 'Failed to delete thread' });
    }
});

export default router;
