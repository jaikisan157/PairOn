import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { User, Match, CollaborationSession } from '../models';
import { calculateMatchScore, generateProjectIdea } from '../utils/matchingAlgorithm';
import { setupQuickChatHandlers } from './quickChat';
import { setupProposalHandlers } from './collabProposal';
import type { MatchMode, ICollaborationSession, IMessage, ITask, JWTPayload } from '../types';

// Active matchmaking queue
const matchmakingQueue: Map<string, { userId: string; mode: MatchMode; socketId: string }> = new Map();

// Active sessions with their timers
const activeSessions: Map<string, { timer: NodeJS.Timeout }> = new Map();

export function setupSocketHandlers(io: Server) {
  // ===== Socket.io JWT Authentication Middleware =====
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error('Authentication required'));
    }

    if (!process.env.JWT_SECRET) {
      return next(new Error('Server configuration error'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET) as JWTPayload;
      socket.data.userId = decoded.userId;
      socket.data.email = decoded.email;
      socket.data.role = decoded.role;
      next();
    } catch (error) {
      return next(new Error('Invalid or expired token'));
    }
  });

  // Track active sockets per user (single session enforcement)
  const userSockets: Map<string, string> = new Map(); // userId -> socketId

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId;
    console.log('User connected:', socket.id, '| userId:', userId);

    // ===== Single Session Enforcement =====
    // If user already has an active socket, disconnect the old one
    const existingSocketId = userSockets.get(userId);
    if (existingSocketId && existingSocketId !== socket.id) {
      const existingSocket = io.sockets.sockets.get(existingSocketId);
      if (existingSocket) {
        existingSocket.emit('session:force-logout', 'You logged in from another device/tab.');
        existingSocket.disconnect(true);
        console.log('Force-disconnected previous session for userId:', userId);
      }
    }
    userSockets.set(userId, socket.id);

    // Auto-join user's personal room and set online
    socket.join(`user:${userId}`);
    User.findByIdAndUpdate(userId, { isOnline: true, lastActive: new Date() })
      .then(() => {
        io.emit('user:status-change', userId, true);
      })
      .catch((err) => console.error('Error setting user online:', err));

    // Setup Quick Connect handlers
    setupQuickChatHandlers(io, socket);

    // Setup Collab Proposal handlers
    setupProposalHandlers(io, socket);

    // Matchmaking
    socket.on('match:request', async (data: { mode: MatchMode }) => {
      try {
        const { mode } = data;

        // Add to queue
        matchmakingQueue.set(userId, { userId, mode, socketId: socket.id });

        // Try to find a match
        await findMatch(io, userId, mode, socket);
      } catch (error) {
        console.error('Match request error:', error);
        socket.emit('match:error', 'Failed to process match request');
      }
    });

    // Cancel matchmaking
    socket.on('match:cancel', () => {
      matchmakingQueue.delete(userId);
      socket.emit('match:cancelled', 'Matchmaking cancelled');
    });

    // Join collaboration session
    socket.on('user:join-session', (sessionId: string) => {
      socket.join(`session:${sessionId}`);
      console.log(`User ${userId} joined session ${sessionId}`);
    });

    // Leave collaboration session
    socket.on('user:leave-session', (sessionId: string) => {
      socket.leave(`session:${sessionId}`);
      console.log(`User ${userId} left session ${sessionId}`);
    });

    // Send message — uses authenticated userId, not client-provided
    socket.on('session:send-message', async (sessionId: string, content: string) => {
      try {
        if (!content || typeof content !== 'string' || content.trim().length === 0) return;

        const session = await CollaborationSession.findById(sessionId);
        if (!session) return;

        // Verify sender is a participant
        if (!session.participants.includes(userId)) {
          socket.emit('match:error', 'You are not a participant in this session');
          return;
        }

        const message: IMessage = {
          id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          senderId: userId,
          content: content.trim(),
          timestamp: new Date(),
          type: 'text',
        };

        session.messages.push(message);
        await session.save();

        io.to(`session:${sessionId}`).emit('session:message', message);
      } catch (error) {
        console.error('Send message error:', error);
      }
    });

    // Update task
    socket.on('session:update-task', async (sessionId: string, taskData: ITask) => {
      try {
        const session = await CollaborationSession.findById(sessionId);
        if (!session) return;

        // Verify sender is a participant
        if (!session.participants.includes(userId)) return;

        const taskIndex = session.tasks.findIndex((t) => t.id === taskData.id);
        if (taskIndex >= 0) {
          session.tasks[taskIndex] = { ...taskData, updatedAt: new Date() };
        } else {
          session.tasks.push({ ...taskData, createdAt: new Date(), updatedAt: new Date() });
        }

        await session.save();
        io.to(`session:${sessionId}`).emit('session:task-updated', taskData);
      } catch (error) {
        console.error('Update task error:', error);
      }
    });

    // Submit project
    socket.on('session:submit', async (sessionId: string, submission: { link: string; description: string }) => {
      try {
        const session = await CollaborationSession.findById(sessionId);
        if (!session) return;

        // Verify sender is a participant
        if (!session.participants.includes(userId)) return;

        session.submission = {
          ...submission,
          submittedBy: userId,
          submittedAt: new Date(),
        };
        session.status = 'completed';
        await session.save();

        // Award credits to both users
        for (const participantId of session.participants) {
          await User.findByIdAndUpdate(participantId, {
            $inc: { credits: 50, completedProjects: 1 },
          });
        }

        io.to(`session:${sessionId}`).emit('session:completed', session.submission);
      } catch (error) {
        console.error('Submit project error:', error);
      }
    });

    // ===== Exit Request System =====
    // Request to leave collaboration
    socket.on('session:request-exit', async (sessionId: string, reason: string) => {
      try {
        const session = await CollaborationSession.findById(sessionId);
        if (!session || session.status !== 'active') return;
        if (!session.participants.includes(userId)) return;

        const partnerId = session.participants.find(p => p !== userId);
        if (!partnerId) return;

        const user = await User.findById(userId);

        // Notify partner of exit request
        io.to(`user:${partnerId}`).emit('session:exit-requested', {
          sessionId,
          requesterId: userId,
          requesterName: user?.name || 'Partner',
          reason: reason || 'No reason given',
        });

        // Notify requester
        socket.emit('session:exit-request-sent', { sessionId });
      } catch (error) {
        console.error('Exit request error:', error);
      }
    });

    // Approve exit request
    socket.on('session:approve-exit', async (sessionId: string) => {
      try {
        const session = await CollaborationSession.findById(sessionId) as any;
        if (!session || session.status !== 'active') return;
        if (!session.participants.includes(userId)) return;

        // End session normally
        session.status = 'ended' as any;
        session.endedAt = new Date();
        await session.save();

        io.to(`session:${sessionId}`).emit('session:exit-approved', { sessionId });

        // System message
        const sysMsg = {
          id: `sys-exit-${Date.now()}`,
          senderId: 'system',
          content: 'Both partners agreed to end the collaboration. Good work!',
          timestamp: new Date(),
          type: 'system',
        };
        io.to(`session:${sessionId}`).emit('session:message', sysMsg);
      } catch (error) {
        console.error('Approve exit error:', error);
      }
    });

    // Decline exit request
    socket.on('session:decline-exit', async (sessionId: string) => {
      try {
        const session = await CollaborationSession.findById(sessionId);
        if (!session || session.status !== 'active') return;
        if (!session.participants.includes(userId)) return;

        const partnerId = session.participants.find(p => p !== userId);
        if (!partnerId) return;

        io.to(`user:${partnerId}`).emit('session:exit-declined', { sessionId });
      } catch (error) {
        console.error('Decline exit error:', error);
      }
    });

    // Force quit (penalty)
    socket.on('session:force-quit', async (sessionId: string) => {
      try {
        const session = await CollaborationSession.findById(sessionId) as any;
        if (!session || session.status !== 'active') return;
        if (!session.participants.includes(userId)) return;

        const partnerId = session.participants.find((p: string) => p !== userId);
        if (!partnerId) return;

        // End session
        session.status = 'ended' as any;
        session.endedAt = new Date();
        await session.save();

        // Penalize quitter: reduce reputation (min 0)
        await User.findByIdAndUpdate(userId, {
          $inc: { reputation: -5 },
        });
        // Ensure reputation doesn't go negative
        await User.updateOne(
          { _id: userId, reputation: { $lt: 0 } },
          { $set: { reputation: 0 } }
        );

        // Award partner 10 credits
        await User.findByIdAndUpdate(partnerId, {
          $inc: { credits: 10 },
        });

        // Notify both
        io.to(`session:${sessionId}`).emit('session:force-quit', {
          sessionId,
          quitterId: userId,
        });

        const sysMsg = {
          id: `sys-fquit-${Date.now()}`,
          senderId: 'system',
          content: 'Your partner force-quit the collaboration. You have been awarded 10 credits as compensation.',
          timestamp: new Date(),
          type: 'system',
        };
        io.to(`user:${partnerId}`).emit('session:message', sysMsg);
      } catch (error) {
        console.error('Force quit error:', error);
      }
    });

    // ===== AI Assistant in Collaboration Chat =====
    socket.on('session:ai-help', async (sessionId: string, question: string) => {
      try {
        const session = await CollaborationSession.findById(sessionId);
        if (!session || session.status !== 'active') return;
        if (!session.participants.includes(userId)) return;

        const user = await User.findById(userId);
        const userName = user?.name || 'User';

        // Get recent messages for context (last 10)
        const recentMessages = session.messages.slice(-10).map(m => `${m.senderId === userId ? userName : 'Partner'}: ${m.content}`).join('\n');

        // Generate AI response based on context
        const aiResponse = generateAIResponse(userName, question, recentMessages, (session as any).projectIdea);

        const aiMsg = {
          id: `ai-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          senderId: 'ai-assistant',
          content: aiResponse,
          timestamp: new Date(),
          type: 'ai',
        };

        // Save to session
        session.messages.push(aiMsg as any);
        await session.save();

        // Broadcast to both users
        io.to(`session:${sessionId}`).emit('session:message', aiMsg);
      } catch (error) {
        console.error('AI assistant error:', error);
      }
    });

    // Disconnect
    socket.on('disconnect', async () => {
      console.log('User disconnected:', socket.id, '| userId:', userId);

      // Remove from matchmaking queue
      matchmakingQueue.delete(userId);

      // Clean up user socket tracking
      if (userSockets.get(userId) === socket.id) {
        userSockets.delete(userId);
      }

      // Update user offline status
      try {
        await User.findByIdAndUpdate(userId, {
          isOnline: false,
          lastActive: new Date(),
        });
        io.emit('user:status-change', userId, false);
      } catch (error) {
        console.error('Error updating offline status:', error);
      }
    });
  });
}

// Find a match for a user
async function findMatch(
  io: Server,
  userId: string,
  mode: MatchMode,
  socket: Socket
): Promise<void> {
  const user = await User.findById(userId);
  if (!user) return;

  // Look for other users in queue with same mode
  const candidates: Array<{ userId: string; socketId: string; user: any }> = [];

  for (const [id, data] of matchmakingQueue.entries()) {
    if (id !== userId && data.mode === mode) {
      // Verify the socket is still connected (clean stale entries)
      const candidateSocket = io.sockets.sockets.get(data.socketId);
      if (!candidateSocket) {
        matchmakingQueue.delete(id);
        continue;
      }
      const candidate = await User.findById(id);
      if (candidate) {
        candidates.push({ userId: id, socketId: data.socketId, user: candidate });
      }
    }
  }

  if (candidates.length === 0) {
    socket.emit('match:waiting', 'Looking for a match...');
    return;
  }

  // Find best match
  let bestMatch = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const result = calculateMatchScore(user, candidate.user);
    if (result.score > bestScore && result.score >= 30) {
      bestScore = result.score;
      bestMatch = candidate;
    }
  }

  if (!bestMatch) {
    socket.emit('match:waiting', 'Looking for a better match...');
    return;
  }

  // Create match
  const duration = mode === 'sprint' ? 3 : mode === 'challenge' ? 48 : 168;
  const projectIdea = generateProjectIdea(user, bestMatch.user);

  const match = new Match({
    user1Id: userId,
    user2Id: bestMatch.userId,
    mode,
    status: 'active',
    endsAt: new Date(Date.now() + duration * 60 * 60 * 1000),
    projectIdea,
    matchScore: bestScore,
  });

  await match.save();

  // Create collaboration session
  const session = new CollaborationSession({
    matchId: match._id,
    participants: [userId, bestMatch.userId],
    messages: [
      {
        id: `msg-${Date.now()}`,
        senderId: 'system',
        content: `You've been matched! Your project: ${projectIdea.title}`,
        timestamp: new Date(),
        type: 'system',
      },
    ],
    tasks: [
      {
        id: `task-1`,
        title: 'Set up project repository',
        status: 'todo',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: `task-2`,
        title: 'Define project scope',
        status: 'todo',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: `task-3`,
        title: 'Create initial design',
        status: 'todo',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    endsAt: new Date(Date.now() + duration * 60 * 60 * 1000),
  });

  await session.save();

  // Update users' previous matches (cap at last 100)
  await User.findByIdAndUpdate(userId, {
    $push: { previousMatches: { $each: [bestMatch.userId], $slice: -100 } },
  });
  await User.findByIdAndUpdate(bestMatch.userId, {
    $push: { previousMatches: { $each: [userId], $slice: -100 } },
  });

  // Remove from queue
  matchmakingQueue.delete(userId);
  matchmakingQueue.delete(bestMatch.userId);

  // Notify both users — include partner names
  const matchData1 = {
    match: {
      id: match._id,
      user1Id: match.user1Id,
      user2Id: match.user2Id,
      mode: match.mode,
      status: match.status,
      startedAt: match.startedAt,
      endsAt: match.endsAt,
      projectIdea: match.projectIdea,
      matchScore: match.matchScore,
      partnerName: bestMatch.user.name,
    },
    session: {
      id: session._id,
      matchId: session.matchId,
      participants: session.participants,
      messages: session.messages,
      tasks: session.tasks,
      status: session.status,
      startedAt: session.startedAt,
      endsAt: session.endsAt,
    },
  };

  const matchData2 = {
    match: {
      id: match._id,
      user1Id: match.user1Id,
      user2Id: match.user2Id,
      mode: match.mode,
      status: match.status,
      startedAt: match.startedAt,
      endsAt: match.endsAt,
      projectIdea: match.projectIdea,
      matchScore: match.matchScore,
      partnerName: user.name,
    },
    session: {
      id: session._id,
      matchId: session.matchId,
      participants: session.participants,
      messages: session.messages,
      tasks: session.tasks,
      status: session.status,
      startedAt: session.startedAt,
      endsAt: session.endsAt,
    },
  };

  socket.emit('match:found', matchData1);
  io.to(bestMatch.socketId).emit('match:found', matchData2);

  // Start session timer
  startSessionTimer(io, session._id.toString(), session.endsAt, session.participants);
}

// Start session countdown timer
function startSessionTimer(io: Server, sessionId: string, endsAt: Date, participants: string[]): void {
  const updateInterval = setInterval(async () => {
    const now = new Date();
    const timeRemaining = Math.max(0, Math.floor((endsAt.getTime() - now.getTime()) / 1000));

    io.to(`session:${sessionId}`).emit('session:timer-update', timeRemaining);

    if (timeRemaining <= 0) {
      clearInterval(updateInterval);
      activeSessions.delete(sessionId);

      // Mark session as completed
      await CollaborationSession.findByIdAndUpdate(sessionId, {
        status: 'completed',
      });

      // Emit to session room AND to each user's personal room (backup delivery)
      io.to(`session:${sessionId}`).emit('session:time-up');
      for (const pid of participants) {
        io.to(`user:${pid}`).emit('session:time-up');
      }
    }
  }, 30000);

  activeSessions.set(sessionId, { timer: updateInterval });
}

// ===== AI Assistant Response Generator =====
function generateAIResponse(userName: string, question: string, context: string, projectIdea?: any): string {
  const q = question.toLowerCase();

  // Architecture & design
  if (q.includes('architect') || q.includes('structure') || q.includes('design') || q.includes('folder')) {
    return `Hey @${userName}! For your project structure, I'd recommend:\n\n` +
      `📁 **Suggested Architecture:**\n` +
      `\`\`\`\n` +
      `src/\n` +
      `├── components/    # Reusable UI components\n` +
      `├── pages/         # Route pages\n` +
      `├── hooks/         # Custom React hooks\n` +
      `├── services/      # API & business logic\n` +
      `├── utils/         # Helper functions\n` +
      `├── types/         # TypeScript types\n` +
      `└── styles/        # Global styles\n` +
      `\`\`\`\n\n` +
      `Start with the core data models, then build the API layer, then the UI. Divide tasks so one person handles backend and the other frontend!`;
  }

  // Debugging help
  if (q.includes('bug') || q.includes('error') || q.includes('fix') || q.includes('debug') || q.includes('not working')) {
    return `@${userName}, debugging tips:\n\n` +
      `1. 🔍 **Check the console** — browser DevTools (F12) and terminal for errors\n` +
      `2. 📝 **Add console.log** at key points to trace the data flow\n` +
      `3. 🧪 **Isolate the issue** — comment out code sections to find what's breaking\n` +
      `4. 🔄 **Check types** — TypeScript errors often point to the root cause\n` +
      `5. 📦 **Clear cache** — try \`npm run dev\` restart or clear node_modules\n\n` +
      `Share the specific error message here and I can help narrow it down!`;
  }

  // Tech stack questions
  if (q.includes('what tech') || q.includes('stack') || q.includes('which framework') || q.includes('use react') || q.includes('use next')) {
    const idea = projectIdea?.title || 'your project';
    return `@${userName}, for "${idea}" I'd suggest:\n\n` +
      `⚡ **Frontend:** React + TypeScript + Tailwind CSS\n` +
      `🔧 **Backend:** Node.js + Express (or Next.js API routes)\n` +
      `💾 **Database:** MongoDB (flexible) or PostgreSQL (relational)\n` +
      `📡 **Real-time:** Socket.io (if needed)\n\n` +
      `Discuss with your partner what you're both comfortable with!`;
  }

  // Git/collaboration
  if (q.includes('git') || q.includes('branch') || q.includes('merge') || q.includes('commit')) {
    return `@${userName}, here's a quick Git workflow for your pair:\n\n` +
      `1. Create a shared repo on GitHub\n` +
      `2. Work on separate branches: \`feature/your-name-task\`\n` +
      `3. Commit often with clear messages\n` +
      `4. PR and review each other's code before merging to \`main\`\n` +
      `5. Pull before starting new work: \`git pull origin main\`\n\n` +
      `💡 **Pro tip:** Use conventional commits — \`feat:\`, \`fix:\`, \`docs:\``;
  }

  // How to start
  if (q.includes('start') || q.includes('begin') || q.includes('first step') || q.includes('how do i') || q.includes('where to')) {
    return `@${userName}, here's how to kick things off:\n\n` +
      `1. 📋 **Plan (15 min):** Agree on features, divide tasks, sketch the UI\n` +
      `2. 🛠️ **Setup (10 min):** Create the repo, init the project, install deps\n` +
      `3. 🏗️ **Build:** Start with the data model → API → UI\n` +
      `4. 🔗 **Integrate:** Connect frontend and backend\n` +
      `5. ✅ **Test & Polish:** Fix bugs, add finishing touches\n\n` +
      `Remember: done is better than perfect! Ship something working.`;
  }

  // Default helpful response
  return `@${userName}, great question! Here are some thoughts:\n\n` +
    `Based on your conversation, I'd suggest:\n` +
    `• Break the problem into smaller, testable pieces\n` +
    `• Discuss the approach with your partner before coding\n` +
    `• Use clear naming conventions and comments\n` +
    `• Test as you go — don't wait until the end\n\n` +
    `Feel free to ask me about architecture, debugging, Git workflow, or tech stack choices! 🚀`;
}

