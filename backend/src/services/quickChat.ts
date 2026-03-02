import { Server, Socket } from 'socket.io';
import { User, QuickChat } from '../models';
import { moderateMessage, calculateChatPriority } from '../utils/contentModeration';
import type { QuickChatMode, IMessage } from '../types';

// Quick Connect matchmaking queue
const quickChatQueue: Map<string, {
    userId: string;
    mode: QuickChatMode;
    topic?: string;
    socketId: string;
    priority: number;
}> = new Map();

export function setupQuickChatHandlers(io: Server, socket: Socket) {
    const userId = socket.data.userId;

    // ===== Find a chat partner =====
    socket.on('quickchat:find', async (data: { mode: QuickChatMode; topic?: string }) => {
        try {
            const { mode, topic } = data;

            // Validate topic for doubt mode
            if (mode === 'doubt' && (!topic || topic.trim().length === 0)) {
                socket.emit('quickchat:blocked', 'Please provide a topic for your doubt (max 50 characters).');
                return;
            }

            if (mode === 'doubt' && topic && topic.length > 50) {
                socket.emit('quickchat:blocked', 'Topic must be 50 characters or less.');
                return;
            }

            // Check active chat limit (max 5)
            const activeChats = await QuickChat.countDocuments({
                participants: userId,
                status: 'active',
            });

            if (activeChats >= 5) {
                socket.emit('quickchat:blocked', 'You already have 5 active chats. End one to start a new one.');
                return;
            }

            // Get user's chat priority
            const user = await User.findById(userId);
            if (!user) return;

            const priority = calculateChatPriority(user.warnings, user.permanentRemark);

            // Add to queue
            quickChatQueue.set(userId, {
                userId,
                mode,
                topic: topic?.trim(),
                socketId: socket.id,
                priority,
            });

            // Try to find a match
            await findQuickChatPartner(io, userId, mode, topic?.trim(), socket);
        } catch (error) {
            console.error('Quick chat find error:', error);
            socket.emit('quickchat:blocked', 'Something went wrong. Please try again.');
        }
    });

    // ===== Cancel searching =====
    socket.on('quickchat:cancel', () => {
        quickChatQueue.delete(userId);
    });

    // ===== Send message (with moderation) =====
    socket.on('quickchat:message', async (chatId: string, content: string) => {
        try {
            if (!content || typeof content !== 'string' || content.trim().length === 0) return;

            const chat = await QuickChat.findById(chatId);
            if (!chat || chat.status !== 'active') return;

            // Verify sender is a participant
            if (!chat.participants.includes(userId)) return;

            // ===== CONTENT MODERATION =====
            const moderationResult = moderateMessage(content);

            if (!moderationResult.isClean) {
                // Message BLOCKED — never sent to partner
                socket.emit('quickchat:blocked', moderationResult.reason || 'Message was blocked.');

                // Issue warning
                const user = await User.findById(userId);
                if (user) {
                    user.warnings += 1;

                    if (user.warnings >= 3 && !user.permanentRemark) {
                        // 3rd warning → permanent remark
                        user.permanentRemark = true;
                        user.chatPriority = calculateChatPriority(user.warnings, true);

                        socket.emit('quickchat:warning', {
                            warningCount: user.warnings,
                            message: '⚠️ You have received 3 warnings. A permanent community guideline violation remark has been added to your profile. This is visible to other users and affects your matching priority.',
                        });
                    } else {
                        user.chatPriority = calculateChatPriority(user.warnings, user.permanentRemark);

                        const remaining = 3 - user.warnings;
                        socket.emit('quickchat:warning', {
                            warningCount: user.warnings,
                            message: `⚠️ Warning ${user.warnings}/3: Your message was blocked for violating community guidelines. ${remaining > 0 ? `${remaining} more warning${remaining > 1 ? 's' : ''} will result in a permanent remark on your profile.` : ''}`,
                        });
                    }

                    await user.save();
                }

                return; // Do NOT send the message
            }

            // Message is clean — save and broadcast
            const message: IMessage = {
                id: `qc-msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                senderId: userId,
                content: content.trim(),
                timestamp: new Date(),
                type: 'text',
            };

            chat.messages.push(message);
            await chat.save();

            // Send to both participants
            io.to(`quickchat:${chatId}`).emit('quickchat:message', message);
        } catch (error) {
            console.error('Quick chat message error:', error);
        }
    });

    // ===== End chat =====
    socket.on('quickchat:end', async (chatId: string) => {
        try {
            const chat = await QuickChat.findById(chatId);
            if (!chat || chat.status !== 'active') return;
            if (!chat.participants.includes(userId)) return;

            chat.status = 'ended';
            chat.endedAt = new Date();
            await chat.save();

            // Notify both participants
            io.to(`quickchat:${chatId}`).emit('quickchat:ended', chatId);

            // System message
            const endMessage: IMessage = {
                id: `qc-sys-${Date.now()}`,
                senderId: 'system',
                content: 'Chat ended. Rate your conversation to earn credits!',
                timestamp: new Date(),
                type: 'system',
            };
            io.to(`quickchat:${chatId}`).emit('quickchat:message', endMessage);
        } catch (error) {
            console.error('Quick chat end error:', error);
        }
    });

    // ===== Rate partner =====
    socket.on('quickchat:rate', async (chatId: string, rating: 'helpful' | 'not-helpful') => {
        try {
            const chat = await QuickChat.findById(chatId);
            if (!chat) return;
            if (!chat.participants.includes(userId)) return;

            // Prevent double rating
            if (chat.ratings.some(r => r.userId === userId)) {
                socket.emit('quickchat:blocked', 'You have already rated this conversation.');
                return;
            }

            chat.ratings.push({ userId, rating });
            await chat.save();

            // Find partner
            const partnerId = chat.participants.find(p => p !== userId)!;

            // If both have rated, award credits
            if (chat.ratings.length === 2) {
                const partnerRating = chat.ratings.find(r => r.userId === partnerId);

                // Award credits to the user who received a positive rating
                if (partnerRating?.rating === 'helpful') {
                    await User.findByIdAndUpdate(userId, { $inc: { credits: 5, reputation: 0.1 } });
                }

                const userRating = chat.ratings.find(r => r.userId === userId);
                if (userRating?.rating === 'helpful') {
                    await User.findByIdAndUpdate(partnerId, { $inc: { credits: 5, reputation: 0.1 } });
                }
            }

            socket.emit('quickchat:rated', chatId);
        } catch (error) {
            console.error('Quick chat rate error:', error);
        }
    });

    // ===== Cleanup on disconnect =====
    socket.on('disconnect', () => {
        quickChatQueue.delete(userId);
    });
}

// ===== Find a Quick Chat Partner =====
async function findQuickChatPartner(
    io: Server,
    userId: string,
    mode: QuickChatMode,
    topic: string | undefined,
    socket: Socket
): Promise<void> {
    const candidates: Array<{ userId: string; socketId: string; topic?: string; priority: number }> = [];

    for (const [id, data] of quickChatQueue.entries()) {
        if (id !== userId && data.mode === mode) {
            candidates.push(data);
        }
    }

    if (candidates.length === 0) {
        socket.emit('quickchat:waiting', mode === 'doubt'
            ? 'Looking for someone who can help...'
            : 'Looking for a tech talk partner...'
        );
        return;
    }

    // Sort by priority (higher priority = matched first)
    candidates.sort((a, b) => b.priority - a.priority);
    const best = candidates[0];

    // Create the chat
    const user = await User.findById(userId);
    const partner = await User.findById(best.userId);
    if (!user || !partner) return;

    const systemContent = mode === 'doubt'
        ? `💡 Doubt chat started! Topic: "${topic || 'General'}"`
        : '🗣️ Tech talk started! Have a great conversation!';

    const remarkWarning = (user.permanentRemark || partner.permanentRemark)
        ? '\n⚠️ Note: One or more participants have a community guideline violation remark.'
        : '';

    const chat = new QuickChat({
        participants: [userId, best.userId],
        mode,
        topic: mode === 'doubt' ? topic : undefined,
        messages: [
            {
                id: `qc-sys-${Date.now()}`,
                senderId: 'system',
                content: systemContent + remarkWarning,
                timestamp: new Date(),
                type: 'system',
            },
        ],
        status: 'active',
    });

    await chat.save();

    // Remove both from queue
    quickChatQueue.delete(userId);
    quickChatQueue.delete(best.userId);

    // Join socket room
    socket.join(`quickchat:${chat._id}`);
    const partnerSocket = io.sockets.sockets.get(best.socketId);
    partnerSocket?.join(`quickchat:${chat._id}`);

    // Notify both users
    const matchData1 = {
        chatId: chat._id.toString(),
        partnerId: best.userId,
        partnerName: partner.name,
        mode,
        topic,
    };

    const matchData2 = {
        chatId: chat._id.toString(),
        partnerId: userId,
        partnerName: user.name,
        mode,
        topic,
    };

    socket.emit('quickchat:matched', matchData1);
    io.to(best.socketId).emit('quickchat:matched', matchData2);
}
