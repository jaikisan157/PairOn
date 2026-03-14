import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { User } from '../models';
import { Friendship } from '../models/Friend';
import { DirectMessage } from '../models';
import { authMiddleware } from '../middleware/auth';
import { getIo } from '../lib/ioInstance';

const router = Router();

// ===== Send friend request =====
router.post(
    '/request',
    authMiddleware,
    [body('recipientId').isString().notEmpty()],
    async (req: any, res: any) => {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const userId = req.user?.userId;
            const { recipientId } = req.body;

            if (userId === recipientId) {
                return res.status(400).json({ message: "Can't friend yourself" });
            }

            // Check recipient exists
            const recipient = await User.findById(recipientId);
            if (!recipient) {
                return res.status(404).json({ message: 'User not found' });
            }

            // Check if friendship already exists (either direction)
            const existing = await Friendship.findOne({
                $or: [
                    { requesterId: userId, recipientId },
                    { requesterId: recipientId, recipientId: userId },
                ],
            });

            let friendship: any;
            if (existing) {
                if (existing.status === 'accepted') {
                    return res.status(400).json({ message: 'Already friends' });
                }
                if (existing.status === 'pending') {
                    return res.status(400).json({ message: 'Friend request already pending' });
                }
                // If declined, allow re-request by updating
                existing.requesterId = userId;
                existing.recipientId = recipientId;
                existing.status = 'pending';
                await existing.save();
                friendship = existing;
            } else {
                friendship = new Friendship({ requesterId: userId, recipientId });
                await friendship.save();
            }

            // 🔔 Real-time popup to recipient
            const requester = await User.findById(userId).select('name reputation avatar');
            const io = getIo();
            if (io && requester) {
                io.to(`user:${recipientId}`).emit('friend:request-received', {
                    friendshipId: friendship._id.toString(),
                    requesterId: userId,
                    requesterName: (requester as any).name,
                    requesterReputation: (requester as any).reputation || 0,
                    requesterAvatar: (requester as any).avatar,
                });
            }

            res.status(201).json({ message: 'Friend request sent', friendship });
        } catch (error) {
            console.error('Friend request error:', error);
            res.status(500).json({ message: 'Server error' });
        }
    }
);

// ===== Accept friend request =====
router.post(
    '/:friendshipId/accept',
    authMiddleware,
    async (req: any, res: any) => {
        try {
            const userId = req.user?.userId;
            const friendshipId = req.params.friendshipId || req.body.friendshipId;

            const friendship = await Friendship.findById(friendshipId);
            if (!friendship || friendship.recipientId !== userId || friendship.status !== 'pending') {
                return res.status(400).json({ message: 'Invalid friend request' });
            }

            friendship.status = 'accepted';
            await friendship.save();

            // 🔔 Notify the original requester that their request was accepted
            const accepter = await User.findById(userId).select('name reputation').lean();
            const io = getIo();
            if (io && accepter) {
                io.to(`user:${friendship.requesterId}`).emit('friend:request-accepted', {
                    accepterName: (accepter as any).name,
                    accepterId: userId,
                });
            }

            res.json({ message: 'Friend request accepted', friendship });
        } catch (error) {
            console.error('Accept friend error:', error);
            res.status(500).json({ message: 'Server error' });
        }
    }
);

// Also support legacy body-based accept
router.post(
    '/accept',
    authMiddleware,
    async (req: any, res: any) => {
        req.params.friendshipId = req.body.friendshipId;
        // redirect to path param handler by calling it inline
        try {
            const userId = req.user?.userId;
            const friendshipId = req.body.friendshipId;
            const friendship = await Friendship.findById(friendshipId);
            if (!friendship || friendship.recipientId !== userId || friendship.status !== 'pending') {
                return res.status(400).json({ message: 'Invalid friend request' });
            }
            friendship.status = 'accepted';
            await friendship.save();
            const accepter = await User.findById(userId).select('name reputation').lean();
            const io = getIo();
            if (io && accepter) {
                io.to(`user:${friendship.requesterId}`).emit('friend:request-accepted', {
                    accepterName: (accepter as any).name,
                    accepterId: userId,
                });
            }
            res.json({ message: 'Friend request accepted', friendship });
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

// ===== Decline friend request =====
router.post(
    '/:friendshipId/decline',
    authMiddleware,
    async (req: any, res: any) => {
        try {
            const userId = req.user?.userId;
            const friendshipId = req.params.friendshipId || req.body.friendshipId;

            const friendship = await Friendship.findById(friendshipId);
            if (!friendship || friendship.recipientId !== userId || friendship.status !== 'pending') {
                return res.status(400).json({ message: 'Invalid friend request' });
            }

            friendship.status = 'declined';
            await friendship.save();

            // 🔔 Notify requester their request was declined
            const io = getIo();
            if (io) {
                io.to(`user:${friendship.requesterId}`).emit('friend:request-declined', {
                    recipientId: userId,
                });
            }

            res.json({ message: 'Friend request declined' });
        } catch (error) {
            console.error('Decline friend error:', error);
            res.status(500).json({ message: 'Server error' });
        }
    }
);

// Also support legacy body-based decline
router.post(
    '/decline',
    authMiddleware,
    async (req: any, res: any) => {
        try {
            const userId = req.user?.userId;
            const friendshipId = req.body.friendshipId;
            const friendship = await Friendship.findById(friendshipId);
            if (!friendship || friendship.recipientId !== userId || friendship.status !== 'pending') {
                return res.status(400).json({ message: 'Invalid friend request' });
            }
            friendship.status = 'declined';
            await friendship.save();
            const io = getIo();
            if (io) {
                io.to(`user:${friendship.requesterId}`).emit('friend:request-declined', { recipientId: userId });
            }
            res.json({ message: 'Friend request declined' });
        } catch (error) {
            res.status(500).json({ message: 'Server error' });
        }
    }
);

// ===== Remove friend =====
router.delete(
    '/:friendshipId',
    authMiddleware,
    async (req: any, res: any) => {
        try {
            const userId = req.user?.userId;
            const { friendshipId } = req.params;

            const friendship = await Friendship.findById(friendshipId);
            if (!friendship) {
                return res.status(404).json({ message: 'Friendship not found' });
            }

            if (friendship.requesterId !== userId && friendship.recipientId !== userId) {
                return res.status(403).json({ message: 'Not authorized' });
            }

            // Find the other person's ID
            const otherId = friendship.requesterId === userId
                ? friendship.recipientId
                : friendship.requesterId;

            await Friendship.findByIdAndDelete(friendshipId);

            // Delete the DM thread between these two users
            const pair = [userId, otherId].sort();
            await DirectMessage.deleteOne({ participants: { $all: pair, $size: 2 } }).catch(() => {});

            res.json({ message: 'Friend removed' });
        } catch (error) {
            console.error('Remove friend error:', error);
            res.status(500).json({ message: 'Server error' });
        }
    }
);

// ===== Get friends list =====
router.get(
    '/list',
    authMiddleware,
    async (req: any, res: any) => {
        try {
            const userId = req.user?.userId;

            const friendships = await Friendship.find({
                $or: [{ requesterId: userId }, { recipientId: userId }],
                status: 'accepted',
            }).lean();

            const friendIds = friendships.map((f: any) =>
                f.requesterId === userId ? f.recipientId : f.requesterId
            );

            const friends = await User.find(
                { _id: { $in: friendIds } },
                { name: 1, email: 1, avatar: 1, isOnline: 1, lastActive: 1, reputation: 1, experienceLevel: 1 }
            ).lean();

            const result = friends.map((friend: any) => {
                const friendship = friendships.find((f: any) =>
                    (f.requesterId === friend._id.toString()) || (f.recipientId === friend._id.toString())
                );
                return {
                    friendshipId: (friendship as any)?._id?.toString() || '',
                    id: friend._id.toString(),
                    name: friend.name,
                    email: friend.email,
                    avatar: friend.avatar,
                    isOnline: friend.isOnline,
                    lastActive: friend.lastActive,
                    reputation: friend.reputation,
                    experienceLevel: friend.experienceLevel,
                };
            });

            res.json({ friends: result });
        } catch (error) {
            console.error('Get friends error:', error);
            res.status(500).json({ message: 'Server error' });
        }
    }
);

// ===== Get pending requests (incoming) =====
router.get(
    '/pending',
    authMiddleware,
    async (req: any, res: any) => {
        try {
            const userId = req.user?.userId;

            const pending = await Friendship.find({
                recipientId: userId,
                status: 'pending',
            }).lean();

            const requesterIds = pending.map((f: any) => f.requesterId);
            const requesters = await User.find(
                { _id: { $in: requesterIds } },
                { name: 1, avatar: 1, reputation: 1, experienceLevel: 1 }
            ).lean();

            const result = pending.map((f: any) => {
                const requester = requesters.find((u: any) => u._id.toString() === f.requesterId);
                return {
                    friendshipId: f._id.toString(),
                    requesterId: f.requesterId,
                    requesterName: requester?.name || 'Unknown',
                    requesterAvatar: (requester as any)?.avatar || '',
                    requesterReputation: (requester as any)?.reputation || 0,
                    createdAt: f.createdAt,
                };
            });

            res.json({ pending: result });
        } catch (error) {
            console.error('Get pending friends error:', error);
            res.status(500).json({ message: 'Server error' });
        }
    }
);

// ===== Check friendship status with a user =====
router.get(
    '/status/:otherUserId',
    authMiddleware,
    async (req: any, res: any) => {
        try {
            const userId = req.user?.userId;
            const { otherUserId } = req.params;

            const friendship = await Friendship.findOne({
                $or: [
                    { requesterId: userId, recipientId: otherUserId },
                    { requesterId: otherUserId, recipientId: userId },
                ],
            });

            if (!friendship) {
                return res.json({ status: 'none' });
            }

            res.json({
                status: friendship.status,
                friendshipId: friendship._id.toString(),
                isRequester: friendship.requesterId === userId,
            });
        } catch (error) {
            console.error('Check friendship error:', error);
            res.status(500).json({ message: 'Server error' });
        }
    }
);

export default router;
