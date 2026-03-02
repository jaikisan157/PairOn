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

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId;
    console.log('User connected:', socket.id, '| userId:', userId);

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

    // Disconnect
    socket.on('disconnect', async () => {
      console.log('User disconnected:', socket.id, '| userId:', userId);

      // Remove from matchmaking queue
      matchmakingQueue.delete(userId);

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

  // Notify both users
  const matchData = {
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

  socket.emit('match:found', matchData);
  io.to(bestMatch.socketId).emit('match:found', matchData);

  // Start session timer
  startSessionTimer(io, session._id.toString(), session.endsAt);
}

// Start session countdown timer — emits every 30s instead of every 1s for scalability
function startSessionTimer(io: Server, sessionId: string, endsAt: Date): void {
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

      io.to(`session:${sessionId}`).emit('session:time-up');
    }
  }, 30000); // Every 30 seconds instead of every 1 second

  activeSessions.set(sessionId, { timer: updateInterval });
}
