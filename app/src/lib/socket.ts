import { io, Socket } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

class SocketService {
    private socket: Socket | null = null;

    connect(token: string): Socket {
        if (this.socket?.connected) {
            return this.socket;
        }

        this.socket = io(SOCKET_URL, {
            auth: { token },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 2000,
        });

        this.socket.on('connect', () => {
            console.log('[Socket] Connected:', this.socket?.id);
        });

        this.socket.on('connect_error', (err) => {
            console.error('[Socket] Connection error:', err.message);
        });

        this.socket.on('disconnect', (reason) => {
            console.log('[Socket] Disconnected:', reason);
        });

        return this.socket;
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    getSocket(): Socket | null {
        return this.socket;
    }

    isConnected(): boolean {
        return this.socket?.connected || false;
    }

    // ===== Matchmaking =====

    requestMatch(mode: string) {
        this.socket?.emit('match:request', { mode });
    }

    cancelMatch() {
        this.socket?.emit('match:cancel');
    }

    onMatchFound(callback: (data: any) => void) {
        this.socket?.on('match:found', callback);
    }

    onMatchWaiting(callback: (message: string) => void) {
        this.socket?.on('match:waiting', callback);
    }

    onMatchError(callback: (message: string) => void) {
        this.socket?.on('match:error', callback);
    }

    onMatchCancelled(callback: (reason: string) => void) {
        this.socket?.on('match:cancelled', callback);
    }

    // ===== Collaboration Session =====

    joinSession(sessionId: string) {
        this.socket?.emit('user:join-session', sessionId);
    }

    leaveSession(sessionId: string) {
        this.socket?.emit('user:leave-session', sessionId);
    }

    sendMessage(sessionId: string, content: string) {
        this.socket?.emit('session:send-message', sessionId, content);
    }

    updateTask(sessionId: string, task: any) {
        this.socket?.emit('session:update-task', sessionId, task);
    }

    submitProject(sessionId: string, link: string, description: string) {
        this.socket?.emit('session:submit', sessionId, { link, description });
    }

    onMessage(callback: (message: any) => void) {
        this.socket?.on('session:message', callback);
    }

    onTaskUpdated(callback: (task: any) => void) {
        this.socket?.on('session:task-updated', callback);
    }

    onTimerUpdate(callback: (timeRemaining: number) => void) {
        this.socket?.on('session:timer-update', callback);
    }

    onSessionCompleted(callback: (submission: any) => void) {
        this.socket?.on('session:completed', callback);
    }

    onTimeUp(callback: () => void) {
        this.socket?.on('session:time-up', callback);
    }

    // ===== Quick Connect =====

    findQuickChat(mode: 'doubt' | 'tech-talk', topic?: string) {
        this.socket?.emit('quickchat:find', { mode, topic });
    }

    cancelQuickChat() {
        this.socket?.emit('quickchat:cancel');
    }

    sendQuickMessage(chatId: string, content: string) {
        this.socket?.emit('quickchat:message', chatId, content);
    }

    endQuickChat(chatId: string) {
        this.socket?.emit('quickchat:end', chatId);
    }

    rateQuickChat(chatId: string, rating: 'helpful' | 'not-helpful') {
        this.socket?.emit('quickchat:rate', chatId, rating);
    }

    onQuickChatMatched(callback: (data: any) => void) {
        this.socket?.on('quickchat:matched', callback);
    }

    onQuickChatMessage(callback: (message: any) => void) {
        this.socket?.on('quickchat:message', callback);
    }

    onQuickChatEnded(callback: (chatId: string) => void) {
        this.socket?.on('quickchat:ended', callback);
    }

    onQuickChatWaiting(callback: (message: string) => void) {
        this.socket?.on('quickchat:waiting', callback);
    }

    onQuickChatWarning(callback: (data: { warningCount: number; message: string }) => void) {
        this.socket?.on('quickchat:warning', callback);
    }

    onQuickChatBlocked(callback: (message: string) => void) {
        this.socket?.on('quickchat:blocked', callback);
    }

    onQuickChatRated(callback: (chatId: string) => void) {
        this.socket?.on('quickchat:rated', callback);
    }

    // ===== Collab Proposals =====

    proposeCollab(data: {
        recipientId: string;
        mode: string;
        projectIdea: { title: string; description: string; category: string; difficulty: string };
        ideaSource: 'user' | 'ai';
        message?: string;
        quickChatId?: string;
    }) {
        this.socket?.emit('collab:propose', data);
    }

    acceptProposal(proposalId: string) {
        this.socket?.emit('collab:accept', proposalId);
    }

    declineProposal(proposalId: string) {
        this.socket?.emit('collab:decline', proposalId);
    }

    generateIdeas(partnerId: string) {
        this.socket?.emit('collab:generate-ideas', partnerId);
    }

    onProposalReceived(callback: (proposal: any) => void) {
        this.socket?.on('collab:proposal-received', callback);
    }

    onProposalAccepted(callback: (data: any) => void) {
        this.socket?.on('collab:proposal-accepted', callback);
    }

    onProposalDeclined(callback: (proposalId: string) => void) {
        this.socket?.on('collab:proposal-declined', callback);
    }

    onAiIdeas(callback: (ideas: any[]) => void) {
        this.socket?.on('collab:ai-ideas', callback);
    }

    // ===== Cleanup =====

    removeAllListeners() {
        this.socket?.removeAllListeners();
    }
}

export const socketService = new SocketService();
