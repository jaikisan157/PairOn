import { Server, Socket } from 'socket.io';
import { User, CollabProposal, Match, CollaborationSession } from '../models';
import { calculateMatchScore, generateProjectIdeas } from '../utils/matchingAlgorithm';
import type { IProjectIdea, MatchMode } from '../types';

export function setupProposalHandlers(io: Server, socket: Socket) {
    const userId = socket.data.userId;

    // ===== Propose Collaboration =====
    socket.on('collab:propose', async (data: {
        recipientId: string;
        mode: MatchMode;
        projectIdea: IProjectIdea;
        ideaSource: 'user' | 'ai';
        message?: string;
        quickChatId?: string;
    }) => {
        try {
            const { recipientId, mode, projectIdea, ideaSource, message, quickChatId } = data;

            // Validate
            if (recipientId === userId) return;
            if (!projectIdea?.title || !projectIdea?.description) {
                socket.emit('quickchat:blocked', 'Invalid project idea.');
                return;
            }

            // Check for existing pending proposals to same person
            const existing = await CollabProposal.findOne({
                proposerId: userId,
                recipientId,
                status: 'pending',
            });

            if (existing) {
                socket.emit('quickchat:blocked', 'You already have a pending proposal to this person.');
                return;
            }

            // Get both users
            const proposer = await User.findById(userId);
            const recipient = await User.findById(recipientId);
            if (!proposer || !recipient) return;

            // Create proposal
            const proposal = new CollabProposal({
                proposerId: userId,
                recipientId,
                mode,
                projectIdea,
                ideaSource,
                message: message?.trim().slice(0, 200),
                quickChatId,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            });

            await proposal.save();

            // Calculate match score for display
            const matchResult = calculateMatchScore(proposer, recipient);

            // Notify recipient
            io.to(`user:${recipientId}`).emit('collab:proposal-received', {
                id: proposal._id.toString(),
                proposer: {
                    id: proposer._id.toString(),
                    name: proposer.name,
                    skills: proposer.skills,
                    experienceLevel: proposer.experienceLevel,
                    reputation: proposer.reputation,
                    avatar: proposer.avatar,
                },
                mode,
                projectIdea,
                ideaSource,
                message: proposal.message,
                matchScore: matchResult.score,
                expiresAt: proposal.expiresAt,
                createdAt: proposal.createdAt,
            });

            // Confirm to proposer
            socket.emit('quickchat:blocked', ''); // clear any existing errors
            socket.emit('collab:proposal-received', {
                id: proposal._id.toString(),
                proposer: {
                    id: proposer._id.toString(),
                    name: proposer.name,
                    skills: proposer.skills,
                    experienceLevel: proposer.experienceLevel,
                    reputation: proposer.reputation,
                    avatar: proposer.avatar,
                },
                recipient: {
                    id: recipient._id.toString(),
                    name: recipient.name,
                    skills: recipient.skills,
                    experienceLevel: recipient.experienceLevel,
                    reputation: recipient.reputation,
                    avatar: recipient.avatar,
                },
                mode,
                projectIdea,
                ideaSource,
                message: proposal.message,
                matchScore: matchResult.score,
                status: 'pending',
                isSent: true,
                expiresAt: proposal.expiresAt,
                createdAt: proposal.createdAt,
            });
        } catch (error) {
            console.error('Proposal create error:', error);
        }
    });

    // ===== Accept Proposal =====
    socket.on('collab:accept', async (proposalId: string) => {
        try {
            const proposal = await CollabProposal.findById(proposalId);
            if (!proposal) return;
            if (proposal.recipientId !== userId) return;
            if (proposal.status !== 'pending') return;

            // Check expiry
            if (new Date() > proposal.expiresAt) {
                proposal.status = 'expired';
                await proposal.save();
                socket.emit('quickchat:blocked', 'This proposal has expired.');
                return;
            }

            proposal.status = 'accepted';
            await proposal.save();

            // Get both users
            const proposer = await User.findById(proposal.proposerId);
            const recipient = await User.findById(userId);
            if (!proposer || !recipient) return;

            // Create a Match record
            const matchResult = calculateMatchScore(proposer, recipient);
            const match = new Match({
                users: [proposal.proposerId, userId],
                mode: proposal.mode,
                matchScore: matchResult.score,
                projectIdea: proposal.projectIdea,
                status: 'accepted',
            });
            await match.save();

            // Duration based on mode: sprint=1hr, challenge=2hr, build=3hr
            const durationMap: Record<string, number> = {
                sprint: 60,
                challenge: 120,
                build: 180,
            };
            const durationMinutes = durationMap[proposal.mode] || 60;
            const now = new Date();
            const endsAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

            // Create Collaboration Session (using correct field names)
            const session = new CollaborationSession({
                matchId: match._id.toString(),
                participants: [proposal.proposerId, userId],
                projectIdea: proposal.projectIdea,
                messages: [{
                    id: `sys-${Date.now()}`,
                    senderId: 'system',
                    content: `🎉 Collaboration started from proposal! Project: "${proposal.projectIdea.title}". You have ${durationMinutes} minutes. Good luck!`,
                    timestamp: now,
                    type: 'system',
                }],
                tasks: [],
                status: 'active',
                startedAt: now,
                endsAt: endsAt,
            });
            await session.save();

            // Update match with session
            await Match.findByIdAndUpdate(match._id, { sessionId: session._id.toString() });

            // Join both users to session room
            socket.join(`challenge:${session._id}`);
            // Find proposer's socket and join them too
            const proposerSocketId = Array.from(io.sockets.sockets.entries())
                .find(([, s]) => s.data?.userId === proposal.proposerId)?.[0];
            if (proposerSocketId) {
                io.sockets.sockets.get(proposerSocketId)?.join(`challenge:${session._id}`);
            }

            // Build match data in SAME format as challenge:matched
            // so CollaborationPage can handle it identically
            const matchDataForRecipient = {
                sessionId: session._id.toString(),
                matchId: match._id.toString(),
                partnerId: proposal.proposerId,
                partnerName: proposer.name,
                partnerReputation: proposer.reputation || 0,
                mode: proposal.mode,
                projectIdea: proposal.projectIdea,
                endsAt: endsAt.toISOString(),
                startedAt: now.toISOString(),
                messages: session.messages,
                tasks: session.tasks,
            };

            const matchDataForProposer = {
                sessionId: session._id.toString(),
                matchId: match._id.toString(),
                partnerId: userId,
                partnerName: recipient.name,
                partnerReputation: recipient.reputation || 0,
                mode: proposal.mode,
                projectIdea: proposal.projectIdea,
                endsAt: endsAt.toISOString(),
                startedAt: now.toISOString(),
                messages: session.messages,
                tasks: session.tasks,
            };

            // Emit as challenge:matched so both frontends navigate to /collaborate
            socket.emit('challenge:matched', matchDataForRecipient);
            io.to(`user:${proposal.proposerId}`).emit('challenge:matched', matchDataForProposer);
        } catch (error) {
            console.error('Proposal accept error:', error);
        }
    });

    // ===== Decline Proposal =====
    socket.on('collab:decline', async (proposalId: string) => {
        try {
            const proposal = await CollabProposal.findById(proposalId);
            if (!proposal) return;
            if (proposal.recipientId !== userId) return;
            if (proposal.status !== 'pending') return;

            proposal.status = 'declined';
            await proposal.save();

            // Notify proposer
            io.to(`user:${proposal.proposerId}`).emit('collab:proposal-declined', proposalId);
        } catch (error) {
            console.error('Proposal decline error:', error);
        }
    });

    // ===== Generate AI Project Ideas =====
    socket.on('collab:generate-ideas', async (partnerId: string) => {
        try {
            const user = await User.findById(userId);
            const partner = await User.findById(partnerId);
            if (!user || !partner) return;

            const ideas = generateProjectIdeas(user, partner, 3) as IProjectIdea[];
            socket.emit('collab:ai-ideas', ideas);
        } catch (error) {
            console.error('Generate ideas error:', error);
        }
    });
}
