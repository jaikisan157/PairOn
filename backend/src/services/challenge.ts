import { Server, Socket } from 'socket.io';
import { User, Match, CollaborationSession } from '../models';
import { moderateMessage, calculateChatPriority } from '../utils/contentModeration';
import { generateProjectIdea } from '../utils/matchingAlgorithm';
import type { IMessage } from '../types';

// ===== Types =====
type ChallengeMode = 'sprint' | 'challenge' | 'build';

interface QueueEntry {
    userId: string;
    mode: ChallengeMode;
    socketId: string;
    joinedAt: number;
}

// ===== State =====
const challengeQueue: Map<string, QueueEntry> = new Map(); // userId -> entry
const activeChallengeSockets: Map<string, Set<string>> = new Map(); // socketId -> Set<sessionId>
const sessionWarnings: Map<string, number> = new Map(); // `${sessionId}:${userId}` -> count

// Mode durations in milliseconds
const MODE_DURATIONS: Record<ChallengeMode, number> = {
    sprint: 3 * 60 * 60 * 1000,      // 3 hours
    challenge: 24 * 60 * 60 * 1000,   // 24 hours
    build: 7 * 24 * 60 * 60 * 1000,   // 7 days
};

// Session timers
const sessionTimers: Map<string, NodeJS.Timeout> = new Map();

export function setupChallengeHandlers(io: Server, socket: Socket) {
    const userId = socket.data.userId;

    // Track active sessions for this socket
    if (!activeChallengeSockets.has(socket.id)) {
        activeChallengeSockets.set(socket.id, new Set());
    }

    // ===== Find a challenge partner (like quickchat:find) =====
    socket.on('challenge:find', async (data: { mode: ChallengeMode }) => {
        try {
            const { mode } = data;

            if (!['sprint', 'challenge', 'build'].includes(mode)) {
                socket.emit('challenge:error', 'Invalid challenge mode.');
                return;
            }

            // Check if user is already in a challenge
            const activeSession = await CollaborationSession.findOne({
                participants: userId,
                status: 'active',
            });
            if (activeSession) {
                socket.emit('challenge:error', 'You already have an active challenge. Finish it before starting a new one.');
                return;
            }

            // Check if already in queue
            if (challengeQueue.has(userId)) {
                socket.emit('challenge:error', 'You are already searching for a match.');
                return;
            }

            // Add to queue
            challengeQueue.set(userId, {
                userId,
                mode,
                socketId: socket.id,
                joinedAt: Date.now(),
            });

            console.log(`[Challenge] User ${userId} queued for ${mode}. Queue size: ${challengeQueue.size}`);

            // Try to find a match
            const matched = await findChallengePartner(io, userId, mode, socket);

            if (!matched) {
                socket.emit('challenge:waiting', `Looking for a ${mode} partner...`);
            }
        } catch (error) {
            console.error('Challenge find error:', error);
            socket.emit('challenge:error', 'Something went wrong. Please try again.');
        }
    });

    // ===== Cancel searching =====
    socket.on('challenge:cancel', () => {
        challengeQueue.delete(userId);
        socket.emit('challenge:cancelled');
        console.log(`[Challenge] User ${userId} cancelled search.`);
    });

    // ===== Send message (with content moderation) =====
    socket.on('challenge:message', async (sessionId: string, content: string) => {
        try {
            if (!content || typeof content !== 'string' || content.trim().length === 0) return;

            const session = await CollaborationSession.findById(sessionId);
            if (!session || session.status !== 'active') return;
            if (!session.participants.includes(userId)) return;

            // ===== CONTENT MODERATION =====
            const modResult = moderateMessage(content);

            if (!modResult.isClean) {
                const warningKey = `${sessionId}:${userId}`;
                const warnings = (sessionWarnings.get(warningKey) || 0) + 1;
                sessionWarnings.set(warningKey, warnings);

                // Update DB warnings
                await User.findByIdAndUpdate(userId, { $inc: { warnings: 1 } });

                if (warnings >= 3) {
                    // KICKED — end session, penalize, award partner
                    const partnerId = session.participants.find(p => p !== userId);

                    session.status = 'abandoned' as any;
                    (session as any).endedAt = new Date();
                    await session.save();

                    await User.findByIdAndUpdate(userId, { $inc: { reputation: -10 } });
                    await User.updateOne({ _id: userId, reputation: { $lt: 0 } }, { $set: { reputation: 0 } });

                    if (partnerId) {
                        await User.findByIdAndUpdate(partnerId, { $inc: { credits: 10 } });
                    }

                    socket.emit('challenge:warning', {
                        warningCount: warnings,
                        message: '🚫 Removed for repeated violations. Reputation reduced.',
                        kicked: true,
                    });

                    // End for both
                    io.to(`challenge:${sessionId}`).emit('challenge:ended', sessionId);
                    if (partnerId) {
                        io.to(`user:${partnerId}`).emit('challenge:ended', sessionId);
                        io.to(`user:${partnerId}`).emit('challenge:message', {
                            id: `sys-kick-${Date.now()}`,
                            senderId: 'system',
                            content: 'Your partner was removed for violating guidelines. You earned 10 credits.',
                            timestamp: new Date(),
                            type: 'system',
                        } as any);
                    }

                    sessionWarnings.delete(warningKey);
                    clearSessionTimer(sessionId);
                    return;
                }

                // Warning (not kicked yet)
                const remaining = 3 - warnings;
                socket.emit('challenge:warning', {
                    warningCount: warnings,
                    message: `⚠️ Warning ${warnings}/3: Message blocked. ${remaining} more = removal.`,
                    kicked: false,
                });
                return; // blocked
            }

            // Clean message — save and broadcast
            const message: IMessage = {
                id: `ch-msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                senderId: userId,
                content: content.trim(),
                timestamp: new Date(),
                type: 'text',
            };

            session.messages.push(message);
            await session.save();

            io.to(`challenge:${sessionId}`).emit('challenge:message', message);
        } catch (error) {
            console.error('Challenge message error:', error);
        }
    });

    // ===== AI Help (@ai) =====
    socket.on('challenge:ai-help', async (sessionId: string, question: string) => {
        try {
            const session = await CollaborationSession.findById(sessionId);
            if (!session || session.status !== 'active') return;
            if (!session.participants.includes(userId)) return;

            const user = await User.findById(userId);
            const userName = user?.name || 'User';
            const recentMessages = session.messages.slice(-10)
                .map(m => `${m.senderId === userId ? userName : 'Partner'}: ${m.content}`)
                .join('\n');

            let aiResponse: string;
            const grokApiKey = process.env.GROK_API_KEY;

            if (grokApiKey) {
                try {
                    const grokRes = await fetch('https://api.x.ai/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${grokApiKey}`,
                        },
                        body: JSON.stringify({
                            model: 'grok-3-mini',
                            messages: [
                                {
                                    role: 'system',
                                    content: `You are an AI pair programming assistant. Two developers are collaborating. Help with code, architecture, debugging. Be concise and give working code examples. Project: ${(session as any).projectIdea?.title || 'unknown'}.\nRecent chat:\n${recentMessages}`,
                                },
                                { role: 'user', content: question },
                            ],
                            max_tokens: 1024,
                            temperature: 0.7,
                        }),
                    });

                    if (grokRes.ok) {
                        const grokData: any = await grokRes.json();
                        aiResponse = `@${userName}, ${grokData.choices?.[0]?.message?.content || 'Could not generate response.'}`;
                    } else {
                        aiResponse = `@${userName}, AI is temporarily unavailable. Try again in a moment.`;
                    }
                } catch {
                    aiResponse = `@${userName}, AI is temporarily unavailable. Try again in a moment.`;
                }
            } else {
                aiResponse = `@${userName}, AI is not configured. Ask the admin to set up GROK_API_KEY.`;
            }

            const aiMsg = {
                id: `ai-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                senderId: 'ai-assistant',
                content: aiResponse,
                timestamp: new Date(),
                type: 'ai',
            };

            session.messages.push(aiMsg as any);
            await session.save();

            io.to(`challenge:${sessionId}`).emit('challenge:message', aiMsg);
        } catch (error) {
            console.error('Challenge AI error:', error);
        }
    });

    // ===== Update task =====
    socket.on('challenge:update-task', async (sessionId: string, task: any) => {
        try {
            const session = await CollaborationSession.findById(sessionId);
            if (!session || session.status !== 'active') return;
            if (!session.participants.includes(userId)) return;

            const idx = session.tasks.findIndex(t => t.id === task.id);
            if (idx >= 0) {
                session.tasks[idx] = { ...session.tasks[idx], ...task, updatedAt: new Date() } as any;
            } else {
                session.tasks.push(task);
            }
            await session.save();

            io.to(`challenge:${sessionId}`).emit('challenge:task-updated', task);
        } catch (error) {
            console.error('Challenge task update error:', error);
        }
    });

    // ===== Submit project =====
    socket.on('challenge:submit', async (sessionId: string, link: string, description: string) => {
        try {
            const session = await CollaborationSession.findById(sessionId) as any;
            if (!session || session.status !== 'active') return;
            if (!session.participants.includes(userId)) return;

            session.submission = {
                link,
                description,
                submittedAt: new Date(),
                submittedBy: userId,
            };
            await session.save();

            io.to(`challenge:${sessionId}`).emit('challenge:submitted', session.submission);
        } catch (error) {
            console.error('Challenge submit error:', error);
        }
    });

    // ===== Request to leave =====
    socket.on('challenge:request-exit', async (sessionId: string, reason: string) => {
        try {
            const session = await CollaborationSession.findById(sessionId);
            if (!session || session.status !== 'active') return;
            if (!session.participants.includes(userId)) return;

            const partnerId = session.participants.find(p => p !== userId);
            if (!partnerId) return;

            const user = await User.findById(userId);

            io.to(`user:${partnerId}`).emit('challenge:exit-requested', {
                sessionId,
                requesterId: userId,
                requesterName: user?.name || 'Partner',
                reason: reason || 'No reason given',
            });

            socket.emit('challenge:exit-request-sent', { sessionId });
        } catch (error) {
            console.error('Challenge exit request error:', error);
        }
    });

    // ===== Approve exit =====
    socket.on('challenge:approve-exit', async (sessionId: string) => {
        try {
            const session = await CollaborationSession.findById(sessionId) as any;
            if (!session || session.status !== 'active') return;
            if (!session.participants.includes(userId)) return;

            session.status = 'completed';
            session.endedAt = new Date();
            await session.save();

            clearSessionTimer(sessionId);

            // Notify BOTH via room + personal rooms
            io.to(`challenge:${sessionId}`).emit('challenge:ended', sessionId);
            for (const pid of session.participants) {
                io.to(`user:${pid}`).emit('challenge:ended', sessionId);
            }

            const sysMsg = {
                id: `sys-exit-${Date.now()}`,
                senderId: 'system',
                content: 'Both partners agreed to end. Great collaboration!',
                timestamp: new Date(),
                type: 'system',
            };
            io.to(`challenge:${sessionId}`).emit('challenge:message', sysMsg);
        } catch (error) {
            console.error('Challenge approve exit error:', error);
        }
    });

    // ===== Decline exit =====
    socket.on('challenge:decline-exit', async (sessionId: string) => {
        try {
            const session = await CollaborationSession.findById(sessionId);
            if (!session || session.status !== 'active') return;
            if (!session.participants.includes(userId)) return;

            const partnerId = session.participants.find(p => p !== userId);
            if (!partnerId) return;

            io.to(`user:${partnerId}`).emit('challenge:exit-declined', { sessionId });
        } catch (error) {
            console.error('Challenge decline exit error:', error);
        }
    });

    // ===== Force quit (penalty) =====
    socket.on('challenge:force-quit', async (sessionId: string) => {
        try {
            const session = await CollaborationSession.findById(sessionId) as any;
            if (!session || session.status !== 'active') return;
            if (!session.participants.includes(userId)) return;

            const partnerId = session.participants.find((p: string) => p !== userId);
            if (!partnerId) return;

            session.status = 'abandoned';
            session.endedAt = new Date();
            await session.save();

            clearSessionTimer(sessionId);

            // Penalize quitter (reputation only, NOT credits)
            await User.findByIdAndUpdate(userId, { $inc: { reputation: -5 } });
            await User.updateOne({ _id: userId, reputation: { $lt: 0 } }, { $set: { reputation: 0 } });

            // Award partner
            await User.findByIdAndUpdate(partnerId, { $inc: { credits: 10 } });

            // Notify BOTH
            io.to(`challenge:${sessionId}`).emit('challenge:ended', sessionId);
            io.to(`user:${userId}`).emit('challenge:ended', sessionId);
            io.to(`user:${partnerId}`).emit('challenge:ended', sessionId);

            io.to(`user:${partnerId}`).emit('challenge:message', {
                id: `sys-fquit-${Date.now()}`,
                senderId: 'system',
                content: 'Your partner force-quit. You earned 10 credits as compensation.',
                timestamp: new Date(),
                type: 'system',
            });
        } catch (error) {
            console.error('Challenge force quit error:', error);
        }
    });

    // ===== Rejoin session (after refresh) =====
    socket.on('challenge:rejoin', async (sessionId: string) => {
        try {
            const session = await CollaborationSession.findById(sessionId);
            if (!session || session.status !== 'active') return;
            if (!session.participants.includes(userId)) return;

            // Rejoin the room
            socket.join(`challenge:${sessionId}`);
            activeChallengeSockets.get(socket.id)?.add(sessionId);

            // Send current session state
            const partnerId = session.participants.find(p => p !== userId);
            const partner = partnerId ? await User.findById(partnerId) : null;

            // Get match for project idea
            const match = await Match.findOne({
                $or: [
                    { user1Id: userId, user2Id: partnerId },
                    { user1Id: partnerId, user2Id: userId },
                ],
                status: 'active',
            });

            socket.emit('challenge:rejoined', {
                session: {
                    id: session._id.toString(),
                    participants: session.participants,
                    messages: session.messages,
                    tasks: session.tasks,
                    submission: session.submission,
                    status: session.status,
                    startedAt: session.startedAt,
                    endsAt: session.endsAt,
                },
                partnerName: partner?.name || 'Partner',
                projectIdea: match?.projectIdea || null,
                mode: match?.mode || 'sprint',
            });
        } catch (error) {
            console.error('Challenge rejoin error:', error);
        }
    });

    // ===== Disconnect =====
    socket.on('disconnect', async () => {
        // Remove from queue
        challengeQueue.delete(userId);

        // Clean up socket tracking
        activeChallengeSockets.delete(socket.id);
    });
}

// ===== Find a challenge partner =====
// Works EXACTLY like Quick Chat: filter by mode (like "interest"), pick first match
async function findChallengePartner(
    io: Server,
    userId: string,
    mode: ChallengeMode,
    socket: Socket
): Promise<boolean> {
    // Find candidates with SAME mode (like matching by interest)
    const candidates: QueueEntry[] = [];

    for (const [id, entry] of challengeQueue.entries()) {
        if (id === userId) continue;
        if (entry.mode === mode) {
            // Verify socket is still connected
            const candidateSocket = io.sockets.sockets.get(entry.socketId);
            if (candidateSocket) {
                candidates.push(entry);
            } else {
                // Stale entry — clean up
                challengeQueue.delete(id);
            }
        }
    }

    if (candidates.length === 0) {
        return false; // No match found
    }

    // Pick the one who's been waiting longest
    candidates.sort((a, b) => a.joinedAt - b.joinedAt);
    const best = candidates[0];

    // Get user info
    const user1 = await User.findById(userId);
    const user2 = await User.findById(best.userId);
    if (!user1 || !user2) return false;

    // Generate project idea
    const projectIdea = generateProjectIdea(user1, user2);

    // Calculate end time
    const now = new Date();
    const endsAt = new Date(now.getTime() + MODE_DURATIONS[mode]);

    // Create Match record
    const match = new Match({
        user1Id: userId,
        user2Id: best.userId,
        mode,
        status: 'active',
        startedAt: now,
        endsAt,
        projectIdea,
        matchScore: 100,
    });
    await match.save();

    // Create CollaborationSession
    const systemMsg = `🚀 Challenge started! Mode: ${mode.toUpperCase()} | Duration: ${mode === 'sprint' ? '3 hours' : mode === 'challenge' ? '24 hours' : '7 days'}`;
    const session = new CollaborationSession({
        matchId: match._id.toString(),
        participants: [userId, best.userId],
        messages: [
            {
                id: `sys-start-${Date.now()}`,
                senderId: 'system',
                content: systemMsg,
                timestamp: now,
                type: 'system',
            },
        ],
        tasks: (projectIdea as any)?.tasks || [],
        status: 'active',
        startedAt: now,
        endsAt,
    });
    await session.save();

    // Remove BOTH from queue
    challengeQueue.delete(userId);
    challengeQueue.delete(best.userId);

    // Join socket room (EXACTLY like Quick Chat)
    socket.join(`challenge:${session._id}`);
    const partnerSocket = io.sockets.sockets.get(best.socketId);
    partnerSocket?.join(`challenge:${session._id}`);

    // Track active sessions
    activeChallengeSockets.get(socket.id)?.add(session._id.toString());
    if (partnerSocket) {
        if (!activeChallengeSockets.has(partnerSocket.id)) {
            activeChallengeSockets.set(partnerSocket.id, new Set());
        }
        activeChallengeSockets.get(partnerSocket.id)?.add(session._id.toString());
    }

    // Build match data (same for both, just swap partner info)
    const matchData1 = {
        sessionId: session._id.toString(),
        matchId: match._id.toString(),
        partnerId: best.userId,
        partnerName: user2.name,
        mode,
        projectIdea,
        endsAt: endsAt.toISOString(),
        startedAt: now.toISOString(),
        messages: session.messages,
        tasks: session.tasks,
    };

    const matchData2 = {
        sessionId: session._id.toString(),
        matchId: match._id.toString(),
        partnerId: userId,
        partnerName: user1.name,
        mode,
        projectIdea,
        endsAt: endsAt.toISOString(),
        startedAt: now.toISOString(),
        messages: session.messages,
        tasks: session.tasks,
    };

    // Emit to BOTH (exactly like Quick Chat: socket.emit + io.to(socketId))
    socket.emit('challenge:matched', matchData1);
    io.to(best.socketId).emit('challenge:matched', matchData2);

    console.log(`[Challenge] Matched ${userId} + ${best.userId} for ${mode}`);

    // Start session timer
    startChallengeTimer(io, session._id.toString(), endsAt, session.participants);

    return true;
}

// ===== Session timer =====
function startChallengeTimer(io: Server, sessionId: string, endsAt: Date, participants: string[]) {
    // Sync timer every 30 seconds
    const timer = setInterval(async () => {
        const remaining = Math.max(0, Math.floor((endsAt.getTime() - Date.now()) / 1000));

        io.to(`challenge:${sessionId}`).emit('challenge:timer', remaining);

        if (remaining <= 0) {
            clearInterval(timer);
            sessionTimers.delete(sessionId);

            // Time's up — end session
            try {
                const session = await CollaborationSession.findById(sessionId) as any;
                if (session && session.status === 'active') {
                    session.status = 'completed';
                    session.endedAt = new Date();
                    await session.save();
                }
            } catch (e) {
                console.error('Timer completion error:', e);
            }

            // Notify both
            io.to(`challenge:${sessionId}`).emit('challenge:time-up');
            for (const pid of participants) {
                io.to(`user:${pid}`).emit('challenge:time-up');
            }
        }
    }, 30000);

    sessionTimers.set(sessionId, timer);
}

function clearSessionTimer(sessionId: string) {
    const timer = sessionTimers.get(sessionId);
    if (timer) {
        clearInterval(timer);
        sessionTimers.delete(sessionId);
    }
}
