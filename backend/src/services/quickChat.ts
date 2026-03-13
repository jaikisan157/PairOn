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

// Track active chats per socket for disconnect handling
const activeChatsMap: Map<string, Set<string>> = new Map(); // socketId -> Set<chatId>

// Inactivity tracking: chatId -> lastMessageTimestamp
const chatLastActivity: Map<string, number> = new Map();
const QUICKCHAT_INACTIVITY_MS = 5 * 60 * 1000; // 5 minutes

export function setupQuickChatHandlers(io: Server, socket: Socket) {
    const userId = socket.data.userId;

    // Initialize active chat tracking for this socket
    if (!activeChatsMap.has(socket.id)) {
        activeChatsMap.set(socket.id, new Set());
    }

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

    // ===== Typing indicator =====
    socket.on('quickchat:typing', async (chatId: string) => {
        const chat = await QuickChat.findById(chatId).catch(() => null);
        if (!chat || chat.status !== 'active') return;
        const partnerId = chat.participants.find((p: string) => p !== userId);
        if (partnerId) {
            io.to(`user:${partnerId}`).emit('quickchat:partner-typing', { chatId });
        }
    });

    socket.on('quickchat:stop-typing', async (chatId: string) => {
        const chat = await QuickChat.findById(chatId).catch(() => null);
        if (!chat || chat.status !== 'active') return;
        const partnerId = chat.participants.find((p: string) => p !== userId);
        if (partnerId) {
            io.to(`user:${partnerId}`).emit('quickchat:partner-stop-typing', { chatId });
        }
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

            // Track activity for inactivity timeout
            chatLastActivity.set(chatId, Date.now());

            // Send to both participants
            io.to(`quickchat:${chatId}`).emit('quickchat:message', message);
        } catch (error) {
            console.error('Quick chat message error:', error);
        }
    });

    // ===== End chat =====
    socket.on('quickchat:end', async (chatId: string) => {
        try {
            await endChat(io, chatId, userId, 'Chat ended by user.');
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

    // ===== Disconnect: end all active chats and notify partners =====
    socket.on('disconnect', async () => {
        // Remove from queue
        quickChatQueue.delete(userId);

        // End all active chats this user is in
        try {
            const activeChats = await QuickChat.find({
                participants: userId,
                status: 'active',
            });

            for (const chat of activeChats) {
                await endChat(io, chat._id.toString(), userId, 'Partner disconnected.');
            }
        } catch (err) {
            console.error('Disconnect cleanup error:', err);
        }

        activeChatsMap.delete(socket.id);
    });
}

// ===== End a chat and notify both =====
async function endChat(io: Server, chatId: string, endedByUserId: string, reason: string) {
    const chat = await QuickChat.findById(chatId);
    if (!chat || chat.status !== 'active') return;
    if (!chat.participants.includes(endedByUserId)) return;

    chat.status = 'ended';
    chat.endedAt = new Date();
    await chat.save();

    // Clean up activity tracking
    chatLastActivity.delete(chatId);

    // System message
    const endMessage: IMessage = {
        id: `qc-sys-${Date.now()}`,
        senderId: 'system',
        content: reason + ' Rate your conversation to earn credits!',
        timestamp: new Date(),
        type: 'system',
    };
    io.to(`quickchat:${chatId}`).emit('quickchat:message', endMessage);

    // Notify both participants
    io.to(`quickchat:${chatId}`).emit('quickchat:ended', chatId);
}

// ===== Inactivity checker: ends quickchats with 5+ min of no messages =====
export function startQuickChatInactivityChecker(io: Server) {
    setInterval(async () => {
        const now = Date.now();
        for (const [chatId, lastActive] of chatLastActivity.entries()) {
            if (now - lastActive >= QUICKCHAT_INACTIVITY_MS) {
                try {
                    const chat = await QuickChat.findById(chatId);
                    if (chat && chat.status === 'active') {
                        await endChat(io, chatId, 'system', '⏰ Chat ended due to 5 minutes of inactivity.');
                    } else {
                        chatLastActivity.delete(chatId);
                    }
                } catch {
                    chatLastActivity.delete(chatId);
                }
            }
        }
    }, 60_000); // Check every minute
}

// ===== Find a Quick Chat Partner =====
// MATCHING LOGIC:
// - "doubt" mode users connect with "tech-talk" users (helpers)
// - "tech-talk" mode users connect with ANYONE in queue (doubt or tech-talk)
async function findQuickChatPartner(
    io: Server,
    userId: string,
    mode: QuickChatMode,
    topic: string | undefined,
    socket: Socket
): Promise<void> {
    const candidates: Array<{ userId: string; socketId: string; topic?: string; priority: number; mode: QuickChatMode }> = [];

    for (const [id, data] of quickChatQueue.entries()) {
        if (id === userId) continue;
        // ALL users in queue can match with each other — no mode restrictions
        // This ensures no one gets stuck waiting forever
        candidates.push({ ...data, mode: data.mode });
    }

    if (candidates.length === 0) {
        socket.emit('quickchat:waiting', mode === 'doubt'
            ? 'Looking for someone who can help with your doubt...'
            : 'Looking for a chat partner...'
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

    // Determine the effective chat mode & topic
    const chatMode = (mode === 'doubt' || best.mode === 'doubt') ? 'doubt' : 'tech-talk';
    const chatTopic = topic || (best.mode === 'doubt' ? best.topic : undefined);

    const systemContent = chatMode === 'doubt'
        ? `💡 Doubt chat started! Topic: "${chatTopic || 'General'}"`
        : '🗣️ Tech talk started! Have a great conversation!';

    const remarkWarning = (user.permanentRemark || partner.permanentRemark)
        ? '\n⚠️ Note: One or more participants have a community guideline violation remark.'
        : '';

    const guidelines = '\n📋 Keep it professional. Inappropriate content will be blocked and may result in penalties.';

    const chat = new QuickChat({
        participants: [userId, best.userId],
        mode: chatMode,
        topic: chatTopic,
        messages: [
            {
                id: `qc-sys-${Date.now()}`,
                senderId: 'system',
                content: systemContent + remarkWarning + guidelines,
                timestamp: new Date(),
                type: 'system',
            },
        ],
        status: 'active',
    });

    await chat.save();

    // Track initial activity
    chatLastActivity.set(chat._id.toString(), Date.now());

    // Remove both from queue
    quickChatQueue.delete(userId);
    quickChatQueue.delete(best.userId);

    // Join socket room
    socket.join(`quickchat:${chat._id}`);
    const partnerSocket = io.sockets.sockets.get(best.socketId);
    partnerSocket?.join(`quickchat:${chat._id}`);

    // Track active chats
    activeChatsMap.get(socket.id)?.add(chat._id.toString());
    if (partnerSocket) {
        if (!activeChatsMap.has(partnerSocket.id)) {
            activeChatsMap.set(partnerSocket.id, new Set());
        }
        activeChatsMap.get(partnerSocket.id)?.add(chat._id.toString());
    }

    // Notify both users
    const matchData1 = {
        chatId: chat._id.toString(),
        partnerId: best.userId,
        partnerName: partner.name,
        partnerReputation: partner.reputation || 0,
        mode: chatMode,
        topic: chatTopic,
        isPartnerMobile: !!(io.sockets.sockets.get(best.socketId)?.data?.isMobile),
    };

    const matchData2 = {
        chatId: chat._id.toString(),
        partnerId: userId,
        partnerName: user.name,
        partnerReputation: user.reputation || 0,
        mode: chatMode,
        topic: chatTopic,
        isPartnerMobile: !!(socket.data?.isMobile),
    };

    // Emit to user rooms (not raw socket IDs) to handle reconnects
    socket.emit('quickchat:matched', matchData1);
    io.to(`user:${best.userId}`).emit('quickchat:matched', matchData2);
}
