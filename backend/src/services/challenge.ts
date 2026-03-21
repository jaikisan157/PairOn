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

// Pending exit requests: sessionId -> { requesterId, requesterName, reason }
const pendingExitRequests = new Map<string, { requesterId: string; requesterName: string; reason: string }>();

// Pending project edit proposals: sessionId -> proposal data
const pendingProjectEdits = new Map<string, { proposerId: string; proposerName: string; title: string; description: string }>();

// IDE state per session (in-memory; lost on server restart)
const ideSessionState = new Map<string, { files: Record<string, string>; folders: string[]; previewUrl?: string }>();

// Terminal ownership per session: terminalId -> userId
const ideTerminalOwners = new Map<string, Map<string, string>>();

// Heartbeat / activity tracking: sessionId:userId -> lastActiveTimestamp
const userActivity: Map<string, number> = new Map();
const activityTimers: Map<string, NodeJS.Timeout> = new Map();

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

            // CHECK: Block if user has an active session that hasn't expired
            const now = new Date();
            const activeSession = await CollaborationSession.findOne({
                participants: userId,
                status: 'active',
                endsAt: { $gt: now },
            });
            if (activeSession) {
                socket.emit('challenge:error', 'You already have an active session! Finish or leave it before starting a new one.');
                return;
            }

            // Clean up only EXPIRED sessions (safe cleanup)
            await CollaborationSession.updateMany(
                { participants: userId, status: 'active', endsAt: { $lt: now } },
                { $set: { status: 'completed' } }
            );
            await Match.updateMany(
                { $or: [{ user1Id: userId }, { user2Id: userId }], status: 'active', endsAt: { $lt: now } },
                { $set: { status: 'completed' } }
            );

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
            const groqApiKey = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;

            if (groqApiKey) {
                try {
                    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${groqApiKey}`,
                        },
                        body: JSON.stringify({
                            model: 'llama-3.3-70b-versatile',
                            messages: [
                                {
                                    role: 'system',
                                    content: `You are an AI pair programming assistant. Two developers are collaborating on a project. Help with code, architecture, debugging, and suggestions. Be concise and give working code examples when asked. Project: ${(session as any).projectIdea?.title || 'unknown'}.\nRecent chat:\n${recentMessages}`,
                                },
                                { role: 'user', content: question },
                            ],
                            max_tokens: 1024,
                            temperature: 0.7,
                        }),
                    });

                    if (groqRes.ok) {
                        const groqData: any = await groqRes.json();
                        aiResponse = groqData.choices?.[0]?.message?.content || 'Could not generate response.';
                    } else {
                        const errText = await groqRes.text();
                        console.error('[Challenge AI] Groq error:', groqRes.status, errText);
                        aiResponse = `AI is temporarily unavailable (${groqRes.status}). Try again in a moment.`;
                    }
                } catch {
                    aiResponse = `@${userName}, AI is temporarily unavailable. Try again in a moment.`;
                }
            } else {
                aiResponse = `@${userName}, AI is not configured. Set GROQ_API_KEY in .env (get free key from console.groq.com).`;
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

    // ===== AI Task Suggestions =====
    socket.on('challenge:suggest-tasks', async (sessionId: string) => {
        try {
            const session = await CollaborationSession.findById(sessionId);
            if (!session || session.status !== 'active') return;
            if (!session.participants.includes(userId)) return;

            const match = await Match.findById(session.matchId);
            const projectTitle = match?.projectIdea?.title || 'Unknown Project';
            const projectDesc = match?.projectIdea?.description || '';

            const GROQ_API_KEY = process.env.GROQ_API_KEY || process.env.GROK_API_KEY;
            if (!GROQ_API_KEY) {
                socket.emit('challenge:task-suggestions', { tasks: [], error: 'AI not configured' });
                return;
            }

            const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: [{
                        role: 'system',
                        content: 'You are a project planning assistant. Generate a task breakdown for a coding project. Return ONLY a JSON array of strings, each being a concise task title. Include both frontend and backend tasks. Group them logically. Return 8-12 tasks max. No markdown, no explanation, just the JSON array.',
                    }, {
                        role: 'user',
                        content: `Project: "${projectTitle}"\nDescription: ${projectDesc}\n\nGenerate a task breakdown with frontend and backend tasks.`,
                    }],
                    max_tokens: 500,
                    temperature: 0.7,
                }),
            });

            if (groqRes.ok) {
                const data: any = await groqRes.json();
                const content = data.choices?.[0]?.message?.content || '[]';
                try {
                    // Parse JSON array from AI response
                    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                    const taskTitles = JSON.parse(cleaned);
                    socket.emit('challenge:task-suggestions', { tasks: taskTitles });
                } catch {
                    socket.emit('challenge:task-suggestions', { tasks: [], error: 'Failed to parse AI response' });
                }
            } else {
                socket.emit('challenge:task-suggestions', { tasks: [], error: 'AI temporarily unavailable' });
            }
        } catch (error) {
            console.error('Challenge task suggestion error:', error);
            socket.emit('challenge:task-suggestions', { tasks: [], error: 'Failed to generate suggestions' });
        }
    });

    // ===== Add new task =====
    socket.on('challenge:add-task', async (sessionId: string, taskTitle: string) => {
        try {
            const session = await CollaborationSession.findById(sessionId);
            if (!session || session.status !== 'active') return;
            if (!session.participants.includes(userId)) return;

            const newTask = {
                id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                title: taskTitle.trim(),
                status: 'todo',
                assigneeId: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            session.tasks.push(newTask as any);
            await session.save();

            io.to(`challenge:${sessionId}`).emit('challenge:task-updated', newTask);
        } catch (error) {
            console.error('Challenge add task error:', error);
        }
    });

    // ===== Code file sync =====
    // NOTE: These events are intentionally NOT relayed here.
    // socket.ts already relays code:file-change, code:file-create, code:file-delete,
    // code:file-lock, code:file-unlock, code:file-rename, and code:comment
    // via the `session:${id}` room. Since users join BOTH `session:` and `challenge:` rooms,
    // relaying here too would cause DOUBLE DELIVERY — the root cause of
    // the "letters disappearing" bug in the collaborative editor.

    socket.on('code:comment', (data: { sessionId: string; filePath: string; comment: any; senderId: string }) => {
        socket.to(`challenge:${data.sessionId}`).emit('code:comment', data);
    });

    // ===== IDE State Sync =====
    socket.on('ide:state-update', (data: { sessionId: string; files: Record<string, string>; folders: string[]; previewUrl?: string }) => {
        ideSessionState.set(data.sessionId, { files: data.files, folders: data.folders, previewUrl: data.previewUrl });
    });

    socket.on('ide:push-state', (data: { sessionId: string; files: Record<string, string>; folders: string[]; previewUrl?: string }) => {
        ideSessionState.set(data.sessionId, { files: data.files, folders: data.folders, previewUrl: data.previewUrl });
        socket.to(`challenge:${data.sessionId}`).emit('ide:state-snapshot', { files: data.files, folders: data.folders, previewUrl: data.previewUrl });
    });

    // ===== Terminal Collaboration =====
    socket.on('terminal:output', (sessionId: string, data: { terminalId: string; chunk: string; label: string }) => {
        socket.to(`challenge:${sessionId}`).emit('terminal:partner-output', data);
    });

    socket.on('terminal:create', (sessionId: string, data: { terminalId: string; label: string }) => {
        socket.to(`challenge:${sessionId}`).emit('terminal:partner-create', data);
    });

    socket.on('terminal:close', (sessionId: string, data: { terminalId: string }) => {
        const termOwners = ideTerminalOwners.get(sessionId);
        if (termOwners) termOwners.delete(data.terminalId);
        socket.to(`challenge:${sessionId}`).emit('terminal:partner-close', data);
    });

    socket.on('terminal:lock', (sessionId: string, data: { terminalId: string; userName: string }) => {
        if (!ideTerminalOwners.has(sessionId)) ideTerminalOwners.set(sessionId, new Map());
        ideTerminalOwners.get(sessionId)!.set(data.terminalId, userId);
        socket.to(`challenge:${sessionId}`).emit('terminal:partner-lock', { ...data, userId });
    });

    socket.on('terminal:unlock', (sessionId: string, data: { terminalId: string }) => {
        const termOwners = ideTerminalOwners.get(sessionId);
        if (termOwners) termOwners.delete(data.terminalId);
        socket.to(`challenge:${sessionId}`).emit('terminal:partner-unlock', data);
    });

    socket.on('ide:preview-url', (sessionId: string, url: string) => {
        const state = ideSessionState.get(sessionId);
        if (state) state.previewUrl = url;
        else ideSessionState.set(sessionId, { files: {}, folders: [], previewUrl: url });
        socket.to(`challenge:${sessionId}`).emit('ide:partner-preview-url', url);
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
            if (!session) return;
            if (!session.participants.includes(userId)) return;

            session.submission = {
                link,
                description,
                submittedAt: new Date(),
                submittedBy: userId,
            };
            session.status = 'completed';
            (session as any).endedAt = new Date();
            await session.save();

            // Increment completedProjects for BOTH participants
            for (const pid of session.participants) {
                await User.findByIdAndUpdate(pid, { $inc: { completedProjects: 1 } });
            }

            clearSessionTimer(sessionId);

            io.to(`challenge:${sessionId}`).emit('challenge:submitted', session.submission);
            // Also emit to individual user rooms (in case they navigated away)
            for (const pid of session.participants) {
                io.to(`user:${pid}`).emit('challenge:submitted', session.submission);
                io.to(`user:${pid}`).emit('challenge:ended', sessionId);
            }
        } catch (error) {
            console.error('Challenge submit error:', error);
        }
    });

    // ===== End after timeout (user chose to end without submitting) =====
    socket.on('challenge:end-after-timeout', async (sessionId: string) => {
        try {
            const session = await CollaborationSession.findById(sessionId) as any;
            if (!session) return;
            if (!session.participants.includes(userId)) return;
            session.status = 'completed';
            session.endedAt = new Date();
            await session.save();
            clearSessionTimer(sessionId);
            socket.emit('challenge:ended', sessionId);
        } catch (err) {
            console.error('end-after-timeout error:', err);
        }
    });

    // ===== Continue alone (after partner force-quit) =====
    socket.on('challenge:continue-alone', async (sessionId: string) => {
        try {
            // Mark session as partner_skipped so partner can't rejoin
            // but keep it active so the remaining user can work
            const session = await CollaborationSession.findById(sessionId);
            if (!session) return;
            if (!session.participants.includes(userId)) return;
            // No status change needed — session is already partner_skipped
            // Just notify caller they are now solo
            socket.emit('challenge:now-solo', { sessionId });
        } catch (err) {
            console.error('continue-alone error:', err);
        }
    });

    // ===== Request to leave =====
    socket.on('challenge:request-exit', async (sessionId: string, reason: string) => {
        try {
            if (!reason || reason.trim().length < 5) {
                socket.emit('challenge:error', 'Reason must be at least 5 characters');
                return;
            }
            const session = await CollaborationSession.findById(sessionId);
            if (!session || session.status !== 'active') return;
            if (!session.participants.includes(userId)) return;

            const partnerId = session.participants.find(p => p !== userId);
            if (!partnerId) return;

            const user = await User.findById(userId);
            const exitData = {
                requesterId: userId,
                requesterName: user?.name || 'Partner',
                reason: reason || 'No reason given',
            };

            // Store pending request so partner sees it even after refresh
            pendingExitRequests.set(sessionId, exitData);

            io.to(`user:${partnerId}`).emit('challenge:exit-requested', {
                sessionId,
                ...exitData,
            });

            socket.emit('challenge:exit-request-sent', { sessionId });
        } catch (error) {
            console.error('Challenge exit request error:', error);
        }
    });

    // ===== Approve exit =====
    socket.on('challenge:approve-exit', async (sessionId: string) => {
        try {
            const session = await CollaborationSession.findById(sessionId);
            if (!session || session.status !== 'active') return;
            if (!session.participants.includes(userId)) return;

            pendingExitRequests.delete(sessionId);

            await CollaborationSession.findByIdAndUpdate(sessionId, {
                $set: { status: 'mutual_quit' }
            });

            clearSessionTimer(sessionId);

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

            pendingExitRequests.delete(sessionId);

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
            const session = await CollaborationSession.findById(sessionId);
            if (!session || session.status !== 'active') return;
            if (!session.participants.includes(userId)) return;

            const partnerId = session.participants.find((p: string) => p !== userId);
            if (!partnerId) return;

            pendingExitRequests.delete(sessionId);

            // Set abandoned for the quitter, partner_skipped for the partner
            await CollaborationSession.findByIdAndUpdate(sessionId, {
                $set: { status: 'partner_skipped', quitterId: userId }
            });

            clearSessionTimer(sessionId);

            // Penalize quitter
            await User.findByIdAndUpdate(userId, { $inc: { reputation: -5 } });
            await User.updateOne({ _id: userId, reputation: { $lt: 0 } }, { $set: { reputation: 0 } });

            // Award partner
            await User.findByIdAndUpdate(partnerId, { $inc: { credits: 10 } });

            // Only quitter gets 'ended' — partner gets their own specific event
            // (room-level emit would wrongly navigate the partner away before showing popup)
            io.to(`user:${userId}`).emit('challenge:ended', sessionId);
            socket.leave(`challenge:${sessionId}`);

            // Notify partner with SPECIFIC event so they can show "partner left" popup + continue alone option
            io.to(`user:${partnerId}`).emit('challenge:partner-force-quit', {
                sessionId,
                creditsEarned: 10,
                message: 'Your partner force-quit. You earned 10 credits as compensation.',
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

            // Get match using the session's stored matchId (not a loose query!)
            const match = await Match.findById(session.matchId);

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

            // Send pending exit request if exists
            const pendingExit = pendingExitRequests.get(sessionId);
            if (pendingExit && pendingExit.requesterId !== userId) {
                socket.emit('challenge:exit-requested', {
                    sessionId,
                    ...pendingExit,
                });
            }

            // Send pending project edit proposal if exists
            const pendingEdit = pendingProjectEdits.get(sessionId);
            if (pendingEdit && pendingEdit.proposerId !== userId) {
                socket.emit('challenge:project-edit-proposed', {
                    sessionId,
                    ...pendingEdit,
                });
            }

            // Notify partner that user is back
            io.to(`user:${partnerId}`).emit('challenge:partner-activity', { sessionId, status: 'online' });

            // Send stored IDE state snapshot to the rejoining user
            const ideState = ideSessionState.get(sessionId);
            if (ideState) socket.emit('ide:state-snapshot', ideState);
            // Ask active partner to push their live state (overrides stored snapshot with freshest data)
            socket.to(`challenge:${sessionId}`).emit('ide:partner-rejoined', { userId });
        } catch (error) {
            console.error('Challenge rejoin error:', error);
        }
    });

    // ===== Typing indicator =====
    socket.on('challenge:typing', async (sessionId: string) => {
        const session = await CollaborationSession.findById(sessionId).catch(() => null);
        if (!session) return;
        const partnerId = session.participants.find((p: string) => p !== userId);
        if (partnerId) {
            io.to(`user:${partnerId}`).emit('challenge:partner-typing', { sessionId });
        }
    });

    socket.on('challenge:stop-typing', async (sessionId: string) => {
        const session = await CollaborationSession.findById(sessionId).catch(() => null);
        if (!session) return;
        const partnerId = session.participants.find((p: string) => p !== userId);
        if (partnerId) {
            io.to(`user:${partnerId}`).emit('challenge:partner-stop-typing', { sessionId });
        }
    });

    // ===== Heartbeat / Activity tracking =====
    socket.on('challenge:heartbeat', async (sessionId: string) => {
        userActivity.set(`${sessionId}:${userId}`, Date.now());
        const session = await CollaborationSession.findById(sessionId).catch(() => null);
        if (!session || session.status !== 'active') return;
        const partnerId = session.participants.find((p: string) => p !== userId);
        if (partnerId) {
            io.to(`user:${partnerId}`).emit('challenge:partner-activity', { sessionId, status: 'online' });
        }
    });

    // ===== Check partner activity =====
    socket.on('challenge:check-partner', async (sessionId: string) => {
        const session = await CollaborationSession.findById(sessionId).catch(() => null);
        if (!session) return;
        const partnerId = session.participants.find((p: string) => p !== userId);
        if (!partnerId) return;
        const lastActive = userActivity.get(`${sessionId}:${partnerId}`);
        const now = Date.now();
        let status = 'offline';
        if (lastActive) {
            const diff = now - lastActive;
            if (diff < 30_000) status = 'online';
            else if (diff < 300_000) status = 'away';
        }
        socket.emit('challenge:partner-activity', { sessionId, status });
    });

    // ===== Project edit proposal =====
    socket.on('challenge:propose-project-edit', async (data: { sessionId: string; title: string; description: string }) => {
        try {
            const session = await CollaborationSession.findById(data.sessionId);
            if (!session || session.status !== 'active') return;
            if (!session.participants.includes(userId)) return;
            const partnerId = session.participants.find(p => p !== userId);
            if (!partnerId) return;
            const user = await User.findById(userId);
            io.to(`user:${partnerId}`).emit('challenge:project-edit-proposed', {
                sessionId: data.sessionId,
                proposerId: userId,
                proposerName: user?.name || 'Partner',
                title: data.title,
                description: data.description,
            });

            // Also store for offline delivery
            pendingProjectEdits.set(data.sessionId, {
                proposerId: userId,
                proposerName: user?.name || 'Partner',
                title: data.title,
                description: data.description,
            });
        } catch (error) {
            console.error('Project edit proposal error:', error);
        }
    });

    socket.on('challenge:approve-project-edit', async (data: { sessionId: string; title: string; description: string }) => {
        try {
            const pending = pendingProjectEdits.get(data.sessionId);
            pendingProjectEdits.delete(data.sessionId);
            const session = await CollaborationSession.findById(data.sessionId);
            if (!session) return;
            const match = await Match.findById(session.matchId);
            if (match && match.projectIdea) {
                match.projectIdea.title = data.title;
                match.projectIdea.description = data.description;
                await match.save();
            }
            // Notify both users: updated title/description
            io.to(`challenge:${data.sessionId}`).emit('challenge:project-updated', {
                title: data.title,
                description: data.description,
            });
            // Also send accepted notification back to proposer specifically
            if (pending) {
                io.to(`user:${pending.proposerId}`).emit('challenge:project-edit-accepted', {
                    sessionId: data.sessionId,
                    title: data.title,
                });
            }
        } catch (error) {
            console.error('Project edit approval error:', error);
        }
    });

    socket.on('challenge:decline-project-edit', async (data: { sessionId: string }) => {
        const pending = pendingProjectEdits.get(data.sessionId);
        pendingProjectEdits.delete(data.sessionId);
        const session = await CollaborationSession.findById(data.sessionId).catch(() => null);
        if (!session) return;
        // Notify the proposer their edit was declined
        if (pending) {
            io.to(`user:${pending.proposerId}`).emit('challenge:project-edit-declined', { sessionId: data.sessionId });
        }
    });

    // ===== Get IDE files for download =====
    socket.on('challenge:get-files', (sessionId: string) => {
        const ideState = ideSessionState.get(sessionId);
        socket.emit('challenge:files-response', {
            sessionId,
            files: ideState?.files || {},
            folders: ideState?.folders || [],
        });
    });


    // ===== Delete task =====
    socket.on('challenge:delete-task', async (sessionId: string, taskId: string) => {
        try {
            const session = await CollaborationSession.findById(sessionId);
            if (!session || session.status !== 'active') return;
            if (!session.participants.includes(userId)) return;
            session.tasks = session.tasks.filter((t: any) => t.id !== taskId);
            await session.save();
            io.to(`challenge:${sessionId}`).emit('challenge:task-deleted', taskId);
        } catch (error) {
            console.error('Delete task error:', error);
        }
    });

    // ===== Disconnect =====
    socket.on('disconnect', async () => {
        // Remove from queue
        challengeQueue.delete(userId);

        // Notify partners about offline status
        const sessions = activeChallengeSockets.get(socket.id);
        if (sessions) {
            for (const sessionId of sessions) {
                const session = await CollaborationSession.findById(sessionId).catch(() => null);
                if (session && session.status === 'active') {
                    const partnerId = session.participants.find((p: string) => p !== userId);
                    if (partnerId) {
                        io.to(`user:${partnerId}`).emit('challenge:partner-activity', { sessionId, status: 'offline' });
                    }
                }
            }
        }

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
        partnerReputation: user2.reputation || 0,
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
        partnerReputation: user1.reputation || 0,
        mode,
        projectIdea,
        endsAt: endsAt.toISOString(),
        startedAt: now.toISOString(),
        messages: session.messages,
        tasks: session.tasks,
    };

    // Emit to BOTH users (use user room AND socket ID for reliability)
    socket.emit('challenge:matched', matchData1);
    io.to(best.socketId).emit('challenge:matched', matchData2);
    // Also emit to user rooms as backup (in case socketId is stale from reconnect)
    io.to(`user:${userId}`).emit('challenge:matched', matchData1);
    io.to(`user:${best.userId}`).emit('challenge:matched', matchData2);

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

            // Notify both — time-up does NOT end the session; users choose what to do
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
