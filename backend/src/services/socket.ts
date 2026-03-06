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

        // Try to find a match immediately
        const matched = await findMatch(io, userId, mode, socket);
        if (matched) return;

        // Retry every 5 seconds for up to 60 seconds
        let retries = 0;
        const retryInterval = setInterval(async () => {
          retries++;

          // If user cancelled or already matched, stop retrying
          if (!matchmakingQueue.has(userId)) {
            clearInterval(retryInterval);
            return;
          }

          const found = await findMatch(io, userId, mode, socket);
          if (found || retries >= 12) { // 12 * 5s = 60s
            clearInterval(retryInterval);
            if (!found && retries >= 12) {
              socket.emit('match:error', 'No match found. Please try again.');
              matchmakingQueue.delete(userId);
            }
          }
        }, 5000);
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
        session.status = 'completed';
        session.endedAt = new Date();
        await session.save();

        // Emit to session room AND both user rooms for guaranteed delivery
        io.to(`session:${sessionId}`).emit('session:exit-approved', { sessionId });
        for (const pid of session.participants) {
          io.to(`user:${pid}`).emit('session:exit-approved', { sessionId });
        }

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
        session.status = 'abandoned';
        session.endedAt = new Date();
        await session.save();

        // Penalize quitter: reduce reputation only (NOT credits)
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

        // Notify BOTH via session room AND personal rooms
        const forceQuitData = { sessionId, quitterId: userId };
        io.to(`session:${sessionId}`).emit('session:force-quit', forceQuitData);
        io.to(`user:${userId}`).emit('session:force-quit', forceQuitData);
        io.to(`user:${partnerId}`).emit('session:force-quit', forceQuitData);

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
): Promise<boolean> {
  const user = await User.findById(userId);
  if (!user) return false;

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
    return false;
  }

  // Find best match
  let bestMatch = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const result = calculateMatchScore(user, candidate.user);
    if (result.score > bestScore) {
      bestScore = result.score;
      bestMatch = candidate;
    }
  }

  // If no scored match, just pick the first candidate (any match is better than no match)
  if (!bestMatch) {
    bestMatch = candidates[0];
    bestScore = 50; // default score
  }

  if (!bestMatch) {
    socket.emit('match:waiting', 'Looking for a better match...');
    return false;
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

  // Emit to BOTH user rooms (not socket IDs — socket IDs can be stale)
  io.to(`user:${userId}`).emit('match:found', matchData1);
  io.to(`user:${bestMatch.userId}`).emit('match:found', matchData2);

  // Also auto-join both to session room
  const user1Socket = io.sockets.sockets.get(socket.id);
  if (user1Socket) user1Socket.join(`session:${session._id.toString()}`);
  const user2Socket = io.sockets.sockets.get(bestMatch.socketId);
  if (user2Socket) user2Socket.join(`session:${session._id.toString()}`);

  // Start session timer
  startSessionTimer(io, session._id.toString(), session.endsAt, session.participants);

  return true;
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
  const projectTitle = projectIdea?.title || 'your project';
  const projectDesc = projectIdea?.description || '';

  // ===== Code Generation =====
  // React component
  if (q.includes('react component') || q.includes('create component') || q.includes('make a component') || q.includes('build component')) {
    const componentName = extractName(question) || 'MyComponent';
    return `@${userName}, here's a React component template:\n\n` +
      `\`\`\`tsx\nimport React, { useState } from 'react';\n\n` +
      `interface ${componentName}Props {\n  title: string;\n  onAction?: () => void;\n}\n\n` +
      `export function ${componentName}({ title, onAction }: ${componentName}Props) {\n` +
      `  const [isActive, setIsActive] = useState(false);\n\n` +
      `  return (\n` +
      `    <div className="p-4 rounded-lg border">\n` +
      `      <h2 className="text-lg font-bold">{title}</h2>\n` +
      `      <button\n` +
      `        onClick={() => { setIsActive(!isActive); onAction?.(); }}\n` +
      `        className="mt-2 px-4 py-2 bg-blue-500 text-white rounded"\n` +
      `      >\n` +
      `        {isActive ? 'Active' : 'Click me'}\n` +
      `      </button>\n` +
      `    </div>\n` +
      `  );\n}\n\`\`\`\n\nCustomize the props and state to fit your needs!`;
  }

  // API endpoint / Express route
  if (q.includes('api') || q.includes('endpoint') || q.includes('route') || q.includes('express')) {
    return `@${userName}, here's an Express API route:\n\n` +
      `\`\`\`typescript\nimport { Router, Request, Response } from 'express';\n\n` +
      `const router = Router();\n\n` +
      `// GET all items\nrouter.get('/', async (req: Request, res: Response) => {\n` +
      `  try {\n    const items = await Item.find();\n    res.json({ success: true, data: items });\n` +
      `  } catch (error) {\n    res.status(500).json({ success: false, error: 'Server error' });\n  }\n});\n\n` +
      `// POST create item\nrouter.post('/', async (req: Request, res: Response) => {\n` +
      `  try {\n    const { name, description } = req.body;\n` +
      `    if (!name) return res.status(400).json({ error: 'Name required' });\n` +
      `    const item = await Item.create({ name, description });\n    res.status(201).json({ success: true, data: item });\n` +
      `  } catch (error) {\n    res.status(500).json({ success: false, error: 'Server error' });\n  }\n});\n\n` +
      `export default router;\n\`\`\`\n\nReplace \`Item\` with your actual model!`;
  }

  // MongoDB / Mongoose model
  if (q.includes('mongoose') || q.includes('model') || q.includes('schema') || q.includes('mongodb') || q.includes('database')) {
    return `@${userName}, here's a Mongoose model:\n\n` +
      `\`\`\`typescript\nimport mongoose, { Schema, Document } from 'mongoose';\n\n` +
      `interface IItem extends Document {\n  name: string;\n  description: string;\n  status: 'active' | 'archived';\n  createdBy: string;\n  createdAt: Date;\n}\n\n` +
      `const ItemSchema = new Schema({\n` +
      `  name: { type: String, required: true, trim: true },\n` +
      `  description: { type: String, default: '' },\n` +
      `  status: { type: String, enum: ['active', 'archived'], default: 'active' },\n` +
      `  createdBy: { type: String, required: true },\n` +
      `}, { timestamps: true });\n\n` +
      `export const Item = mongoose.model<IItem>('Item', ItemSchema);\n\`\`\`\n\nAdjust fields based on "${projectTitle}"!`;
  }

  // Authentication
  if (q.includes('auth') || q.includes('login') || q.includes('jwt') || q.includes('token') || q.includes('password')) {
    return `@${userName}, here's a JWT auth pattern:\n\n` +
      `\`\`\`typescript\nimport jwt from 'jsonwebtoken';\nimport bcrypt from 'bcryptjs';\n\n` +
      `// Login handler\nasync function login(email: string, password: string) {\n` +
      `  const user = await User.findOne({ email });\n` +
      `  if (!user) throw new Error('User not found');\n\n` +
      `  const isValid = await bcrypt.compare(password, user.password);\n` +
      `  if (!isValid) throw new Error('Invalid password');\n\n` +
      `  const token = jwt.sign(\n    { userId: user._id, email: user.email },\n` +
      `    process.env.JWT_SECRET!,\n    { expiresIn: '7d' }\n  );\n\n` +
      `  return { token, user: { id: user._id, name: user.name, email: user.email } };\n}\n\n` +
      `// Middleware\nfunction authMiddleware(req, res, next) {\n` +
      `  const token = req.headers.authorization?.split(' ')[1];\n` +
      `  if (!token) return res.status(401).json({ error: 'No token' });\n` +
      `  try {\n    const decoded = jwt.verify(token, process.env.JWT_SECRET!);\n    req.userId = decoded.userId;\n    next();\n` +
      `  } catch { return res.status(401).json({ error: 'Invalid token' }); }\n}\n\`\`\``;
  }

  // CSS / Styling
  if (q.includes('css') || q.includes('style') || q.includes('tailwind') || q.includes('design') || q.includes('responsive') || q.includes('layout')) {
    return `@${userName}, here's a responsive layout approach:\n\n` +
      `\`\`\`css\n/* Modern responsive grid */\n.container {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));\n  gap: 1.5rem;\n  padding: 2rem;\n}\n\n` +
      `/* Card with hover effect */\n.card {\n  background: white;\n  border-radius: 12px;\n  padding: 1.5rem;\n  box-shadow: 0 2px 8px rgba(0,0,0,0.1);\n  transition: transform 0.2s, box-shadow 0.2s;\n}\n.card:hover {\n  transform: translateY(-2px);\n  box-shadow: 0 8px 24px rgba(0,0,0,0.15);\n}\n\n` +
      `/* Responsive breakpoints */\n@media (max-width: 768px) {\n  .container { padding: 1rem; gap: 1rem; }\n}\n\`\`\`\n\n` +
      `Or with **Tailwind**: \`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6\``;
  }

  // useState / useEffect / hooks
  if (q.includes('usestate') || q.includes('useeffect') || q.includes('hook') || q.includes('state management')) {
    return `@${userName}, here's common React hooks usage:\n\n` +
      `\`\`\`tsx\nimport { useState, useEffect, useCallback } from 'react';\n\n` +
      `function useData(endpoint: string) {\n` +
      `  const [data, setData] = useState<any[]>([]);\n` +
      `  const [loading, setLoading] = useState(true);\n` +
      `  const [error, setError] = useState<string | null>(null);\n\n` +
      `  useEffect(() => {\n    let cancelled = false;\n    setLoading(true);\n\n` +
      `    fetch(endpoint)\n      .then(res => res.json())\n      .then(json => {\n` +
      `        if (!cancelled) { setData(json.data); setLoading(false); }\n      })\n` +
      `      .catch(err => {\n        if (!cancelled) { setError(err.message); setLoading(false); }\n      });\n\n` +
      `    return () => { cancelled = true; };\n  }, [endpoint]);\n\n` +
      `  const refetch = useCallback(() => {\n    setLoading(true);\n    // re-trigger fetch...\n  }, []);\n\n` +
      `  return { data, loading, error, refetch };\n}\n\`\`\``;
  }

  // Fetch / API call from frontend
  if (q.includes('fetch') || q.includes('axios') || q.includes('api call') || q.includes('http request') || q.includes('get data')) {
    return `@${userName}, here's how to make API calls:\n\n` +
      `\`\`\`typescript\n// API service\nconst API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';\n\n` +
      `async function apiCall<T>(endpoint: string, options?: RequestInit): Promise<T> {\n` +
      `  const token = localStorage.getItem('token');\n` +
      `  const res = await fetch(\`\${API_URL}\${endpoint}\`, {\n` +
      `    headers: {\n      'Content-Type': 'application/json',\n      ...(token ? { Authorization: \`Bearer \${token}\` } : {}),\n    },\n` +
      `    ...options,\n  });\n` +
      `  if (!res.ok) throw new Error(\`API error: \${res.status}\`);\n  return res.json();\n}\n\n` +
      `// Usage\nconst items = await apiCall<{ data: Item[] }>('/items');\n` +
      `await apiCall('/items', { method: 'POST', body: JSON.stringify({ name: 'New' }) });\n\`\`\``;
  }

  // Socket.io
  if (q.includes('socket') || q.includes('real-time') || q.includes('realtime') || q.includes('websocket') || q.includes('emit')) {
    return `@${userName}, here's a Socket.io setup:\n\n` +
      `**Server:**\n\`\`\`typescript\nimport { Server } from 'socket.io';\n\n` +
      `const io = new Server(httpServer, { cors: { origin: '*' } });\n\n` +
      `io.on('connection', (socket) => {\n  console.log('User connected:', socket.id);\n\n` +
      `  socket.on('message:send', (data) => {\n    io.to(data.room).emit('message:new', data);\n  });\n\n` +
      `  socket.on('disconnect', () => console.log('Disconnected:', socket.id));\n});\n\`\`\`\n\n` +
      `**Client:**\n\`\`\`typescript\nimport { io } from 'socket.io-client';\n\n` +
      `const socket = io('http://localhost:5000');\nsocket.on('message:new', (msg) => console.log(msg));\nsocket.emit('message:send', { room: 'room1', text: 'Hello!' });\n\`\`\``;
  }

  // Architecture / structure (keep this one)
  if (q.includes('architect') || q.includes('structure') || q.includes('folder') || q.includes('organize')) {
    return `@${userName}, here's a project structure for "${projectTitle}":\n\n` +
      `\`\`\`\nsrc/\n├── components/    # Reusable UI (Button, Card, Modal)\n` +
      `├── pages/         # Route pages (Home, Dashboard, Profile)\n` +
      `├── hooks/         # Custom hooks (useAuth, useData)\n` +
      `├── services/      # API calls & business logic\n` +
      `├── context/       # React Context providers\n` +
      `├── types/         # TypeScript interfaces\n` +
      `├── utils/         # Helper functions\n` +
      `└── styles/        # Global CSS\n\`\`\`\n\n` +
      `**Divide work:** One of you handles \`services/\` + \`context/\` (data layer), the other does \`components/\` + \`pages/\` (UI layer).`;
  }

  // Form handling
  if (q.includes('form') || q.includes('input') || q.includes('validation') || q.includes('submit')) {
    return `@${userName}, here's a form with validation:\n\n` +
      `\`\`\`tsx\nfunction ContactForm() {\n  const [form, setForm] = useState({ name: '', email: '', message: '' });\n` +
      `  const [errors, setErrors] = useState<Record<string, string>>({});\n\n` +
      `  const validate = () => {\n    const e: Record<string, string> = {};\n` +
      `    if (!form.name.trim()) e.name = 'Name required';\n` +
      `    if (!form.email.includes('@')) e.email = 'Valid email required';\n` +
      `    if (form.message.length < 10) e.message = 'Min 10 characters';\n    setErrors(e);\n` +
      `    return Object.keys(e).length === 0;\n  };\n\n` +
      `  const handleSubmit = async (e: React.FormEvent) => {\n` +
      `    e.preventDefault();\n    if (!validate()) return;\n` +
      `    await fetch('/api/contact', { method: 'POST', body: JSON.stringify(form),\n` +
      `      headers: { 'Content-Type': 'application/json' } });\n  };\n\n` +
      `  return (\n    <form onSubmit={handleSubmit}>\n` +
      `      <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} />\n` +
      `      {errors.name && <span className="text-red-500">{errors.name}</span>}\n      {/* ...more fields */}\n` +
      `      <button type="submit">Submit</button>\n    </form>\n  );\n}\n\`\`\``;
  }

  // Testing
  if (q.includes('test') || q.includes('jest') || q.includes('testing')) {
    return `@${userName}, here's how to test:\n\n` +
      `\`\`\`typescript\n// Unit test\nimport { render, screen, fireEvent } from '@testing-library/react';\n\n` +
      `describe('Button', () => {\n  it('calls onClick when clicked', () => {\n` +
      `    const onClick = jest.fn();\n    render(<Button onClick={onClick}>Click</Button>);\n` +
      `    fireEvent.click(screen.getByText('Click'));\n    expect(onClick).toHaveBeenCalledTimes(1);\n  });\n});\n\n` +
      `// API test\ndescribe('GET /api/items', () => {\n` +
      `  it('returns items', async () => {\n    const res = await request(app).get('/api/items');\n` +
      `    expect(res.status).toBe(200);\n    expect(res.body.data).toBeInstanceOf(Array);\n  });\n});\n\`\`\``;
  }

  // Deployment
  if (q.includes('deploy') || q.includes('hosting') || q.includes('build') || q.includes('production') || q.includes('vercel') || q.includes('render')) {
    return `@${userName}, deployment checklist:\n\n` +
      `**Frontend (Vercel):**\n\`\`\`bash\nnpm run build\nvercel deploy --prod\n\`\`\`\n\n` +
      `**Backend (Render):**\n` +
      `1. Push to GitHub\n2. Connect repo on render.com\n3. Set env vars: \`MONGODB_URI\`, \`JWT_SECRET\`, \`PORT\`\n` +
      `4. Build command: \`npm install && npm run build\`\n5. Start command: \`npm start\`\n\n` +
      `**Don't forget:**\n• Set \`CORS_ORIGIN\` to your frontend URL\n• Use \`process.env.PORT\` in server\n• Add \`.env.example\` to repo (without real values)`;
  }

  // Bug / error / not working
  if (q.includes('bug') || q.includes('error') || q.includes('fix') || q.includes('debug') || q.includes('not working') || q.includes('broke') || q.includes('crash')) {
    return `@${userName}, let's debug this:\n\n` +
      `\`\`\`typescript\n// 1. Add logging at the point of failure\nconsole.log('DEBUG:', { variable, state, props });\n\n` +
      `// 2. Try-catch to find the exact error\ntry {\n  // your code here\n} catch (error) {\n` +
      `  console.error('Error details:', error);\n  console.trace(); // shows call stack\n}\n\n` +
      `// 3. Check network tab for API issues\n// F12 → Network → look for red requests\n\n` +
      `// 4. TypeScript: run 'npx tsc --noEmit' to find type errors\n\`\`\`\n\n` +
      `**Common fixes:**\n• \`Cannot read property of undefined\` → check if data loaded before accessing\n• \`CORS error\` → add cors middleware with correct origin\n• \`404\` → check API route URL and method\n\nShare the error message and I'll help narrow it down!`;
  }

  // Contextual response based on conversation + project idea
  if (projectDesc) {
    return `@${userName}, regarding your question about "${question}":\n\n` +
      `Since you're building **"${projectTitle}"** (${projectDesc}), here's what I'd suggest:\n\n` +
      `1. **Break it down** — Identify the core feature your question relates to\n` +
      `2. **Start simple** — Get a basic version working first, then iterate\n` +
      `3. **Divide work** — One person can handle this while the other works on another feature\n\n` +
      `\`\`\`typescript\n// Quick starter for your feature\nimport { useState, useEffect } from 'react';\n\n` +
      `function Feature() {\n` +
      `  const [data, setData] = useState(null);\n  const [loading, setLoading] = useState(true);\n\n` +
      `  useEffect(() => {\n    // Fetch your data\n    fetch('/api/your-endpoint')\n` +
      `      .then(r => r.json())\n      .then(d => { setData(d); setLoading(false); });\n  }, []);\n\n` +
      `  if (loading) return <div>Loading...</div>;\n  return <div>{JSON.stringify(data)}</div>;\n}\n\`\`\`\n\n` +
      `Need more specific help? Tell me exactly what you're trying to build! 🚀`;
  }

  // Generic but still useful
  return `@${userName}, here's what I can help with — just ask:\n\n` +
    `📝 **"create a React component for [X]"** — I'll generate the code\n` +
    `🔧 **"write an API route for [X]"** — Express endpoint with error handling\n` +
    `💾 **"create a database model for [X]"** — Mongoose schema\n` +
    `🔐 **"how to do authentication"** — JWT auth pattern\n` +
    `🎨 **"CSS for [layout/card/grid]"** — Responsive styles\n` +
    `🐛 **"debug [error message]"** — Debugging strategies\n` +
    `📡 **"socket.io setup"** — Real-time communication\n` +
    `🚀 **"how to deploy"** — Deployment checklist\n\n` +
    `Try asking something specific like: \`@ai create a React component for user profile card\``;
}

// Helper to extract a name from the question
function extractName(question: string): string | null {
  // Try to extract "for X" or "called X" or "named X"
  const patterns = [
    /(?:called|named|for)\s+(\w+)/i,
    /component\s+(\w+)/i,
    /create\s+(\w+)/i,
  ];
  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (match && match[1] && match[1].length > 2) {
      return match[1].charAt(0).toUpperCase() + match[1].slice(1);
    }
  }
  return null;
}

