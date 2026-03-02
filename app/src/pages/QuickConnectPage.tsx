import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    MessageCircle,
    HelpCircle,
    Coffee,
    Send,
    X,
    ArrowLeft,
    ThumbsUp,
    ThumbsDown,
    AlertTriangle,
    Zap,
    Search,
    Handshake,
    Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { socketService } from '@/lib/socket';

type QuickChatMode = 'doubt' | 'tech-talk';
type ChatStatus = 'idle' | 'searching' | 'chatting' | 'ended';

interface QuickMessage {
    id: string;
    senderId: string;
    content: string;
    timestamp: Date;
    type: 'text' | 'system';
}

interface ActiveChat {
    chatId: string;
    partnerId: string;
    partnerName: string;
    mode: QuickChatMode;
    topic?: string;
    messages: QuickMessage[];
    status: 'active' | 'ended';
    rated: boolean;
}

export function QuickConnectPage() {
    const navigate = useNavigate();
    const { user } = useAuth();

    // State
    const [mode, setMode] = useState<QuickChatMode | null>(null);
    const [topic, setTopic] = useState('');
    const [chatStatus, setChatStatus] = useState<ChatStatus>('idle');
    const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);
    const [newMessage, setNewMessage] = useState('');
    const [warning, setWarning] = useState<{ warningCount: number; message: string } | null>(null);
    const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

    // Proposal state
    const [showProposalModal, setShowProposalModal] = useState(false);
    const [aiIdeas, setAiIdeas] = useState<Array<{ title: string; description: string; category: string; difficulty: string }>>([]);
    const [selectedIdea, setSelectedIdea] = useState<{ title: string; description: string; category: string; difficulty: string } | null>(null);
    const [proposalMode, setProposalMode] = useState<'sprint' | 'challenge' | 'build'>('sprint');
    const [proposalMessage, setProposalMessage] = useState('');
    const [loadingIdeas, setLoadingIdeas] = useState(false);
    const [proposalSent, setProposalSent] = useState(false);
    const [showEndConfirm, setShowEndConfirm] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeChat?.messages]);

    // Setup socket listeners
    useEffect(() => {
        socketService.onQuickChatMatched((data) => {
            setChatStatus('chatting');
            setActiveChat({
                chatId: data.chatId,
                partnerId: data.partnerId,
                partnerName: data.partnerName,
                mode: data.mode,
                topic: data.topic,
                messages: [],
                status: 'active',
                rated: false,
            });
        });

        socketService.onQuickChatMessage((message: QuickMessage) => {
            setActiveChat(prev => {
                if (!prev) return prev;
                return { ...prev, messages: [...prev.messages, message] };
            });
        });

        socketService.onQuickChatEnded((chatId: string) => {
            setActiveChat(prev => {
                if (!prev || prev.chatId !== chatId) return prev;
                return { ...prev, status: 'ended' };
            });
            setChatStatus('ended');
        });

        socketService.onQuickChatWaiting(() => {
            setChatStatus('searching');
        });

        socketService.onQuickChatWarning((data) => {
            setWarning(data);
            // Auto-dismiss after 8 seconds
            setTimeout(() => setWarning(null), 8000);
        });

        socketService.onQuickChatBlocked((message) => {
            setBlockedMessage(message);
            setTimeout(() => setBlockedMessage(null), 5000);
        });

        socketService.onQuickChatRated(() => {
            setActiveChat(prev => prev ? { ...prev, rated: true } : prev);
        });

        socketService.onAiIdeas((ideas) => {
            setAiIdeas(ideas);
            setLoadingIdeas(false);
            if (ideas.length > 0) setSelectedIdea(ideas[0]);
        });

        return () => {
            socketService.removeAllListeners();
        };
    }, []);

    // Warn before leaving page if chat is active
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (chatStatus === 'chatting') {
                e.preventDefault();
                e.returnValue = 'You have an active chat. Leaving will disconnect you.';
                return e.returnValue;
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [chatStatus]);

    const handleStartSearch = useCallback(() => {
        if (!mode) return;
        if (mode === 'doubt' && topic.trim().length === 0) return;

        socketService.findQuickChat(mode, mode === 'doubt' ? topic.trim() : undefined);
        setChatStatus('searching');
    }, [mode, topic]);

    const handleCancelSearch = useCallback(() => {
        socketService.cancelQuickChat();
        setChatStatus('idle');
    }, []);

    const handleSendMessage = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !activeChat) return;
        socketService.sendQuickMessage(activeChat.chatId, newMessage.trim());
        setNewMessage('');
    }, [newMessage, activeChat]);

    const handleEndChat = useCallback(() => {
        if (!activeChat) return;
        setShowEndConfirm(true);
    }, [activeChat]);

    const confirmEndChat = useCallback(() => {
        if (!activeChat) return;
        socketService.endQuickChat(activeChat.chatId);
        setShowEndConfirm(false);
    }, [activeChat]);

    const cancelEndChat = useCallback(() => {
        setShowEndConfirm(false);
    }, []);

    const handleRate = useCallback((rating: 'helpful' | 'not-helpful') => {
        if (!activeChat) return;
        socketService.rateQuickChat(activeChat.chatId, rating);
    }, [activeChat]);

    const handleNewChat = useCallback(() => {
        setActiveChat(null);
        setChatStatus('idle');
        setMode(null);
        setTopic('');
        setProposalSent(false);
    }, []);

    const handleOpenProposal = useCallback(() => {
        if (!activeChat) return;
        setShowProposalModal(true);
        setLoadingIdeas(true);
        socketService.generateIdeas(activeChat.partnerId);
    }, [activeChat]);

    const handleSendProposal = useCallback(() => {
        if (!activeChat || !selectedIdea) return;
        socketService.proposeCollab({
            recipientId: activeChat.partnerId,
            mode: proposalMode,
            projectIdea: selectedIdea,
            ideaSource: 'ai',
            message: proposalMessage.trim() || undefined,
            quickChatId: activeChat.chatId,
        });
        setShowProposalModal(false);
        setProposalSent(true);
    }, [activeChat, selectedIdea, proposalMode, proposalMessage]);

    return (
        <div className="min-h-screen bg-pairon-bg dark:bg-gray-900 flex flex-col">
            {/* Header */}
            <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <div className="w-full px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => navigate('/dashboard')}
                                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                                <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                            </button>
                            <div>
                                <h1 className="font-display font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                    <MessageCircle className="w-5 h-5 text-pairon-accent" />
                                    Quick Connect
                                </h1>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {chatStatus === 'chatting'
                                        ? `Chatting with ${activeChat?.partnerName}`
                                        : 'Short chats · Ask doubts · Tech talks'
                                    }
                                </p>
                            </div>
                        </div>

                        {chatStatus === 'chatting' && (
                            <div className="flex gap-2">
                                {!proposalSent && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleOpenProposal}
                                        className="text-pairon-accent border-pairon-accent/30 hover:bg-pairon-accent/10 flex items-center gap-1"
                                    >
                                        <Handshake className="w-4 h-4" />
                                        Propose Collab
                                    </Button>
                                )}
                                {proposalSent && (
                                    <span className="text-xs text-green-500 flex items-center gap-1 px-3">
                                        <Sparkles className="w-3 h-3" />
                                        Proposal sent!
                                    </span>
                                )}
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleEndChat}
                                    className="text-red-600 border-red-200 hover:bg-red-50"
                                >
                                    End chat
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Warning Banner */}
            <AnimatePresence>
                {warning && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800 px-4 py-3"
                    >
                        <div className="flex items-start gap-3 max-w-4xl mx-auto">
                            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-red-700 dark:text-red-300">{warning.message}</p>
                            <button onClick={() => setWarning(null)} className="ml-auto">
                                <X className="w-4 h-4 text-red-400" />
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Blocked Message Toast */}
            <AnimatePresence>
                {blockedMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-6 py-3 rounded-2xl shadow-lg flex items-center gap-2"
                    >
                        <AlertTriangle className="w-4 h-4" />
                        <span className="text-sm">{blockedMessage}</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Content */}
            <main className="flex-1 flex">
                {chatStatus === 'idle' && (
                    <div className="flex-1 flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="max-w-lg w-full"
                        >
                            <div className="text-center mb-8">
                                <div className="w-16 h-16 rounded-3xl bg-pairon-accent/10 flex items-center justify-center mx-auto mb-4">
                                    <Zap className="w-8 h-8 text-pairon-accent" />
                                </div>
                                <h2 className="font-display text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                    Start a Quick Chat
                                </h2>
                                <p className="text-gray-500 dark:text-gray-400">
                                    Connect with developers for quick doubts or casual tech conversations
                                </p>
                            </div>

                            {/* Mode Selection */}
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <button
                                    onClick={() => setMode('doubt')}
                                    className={`p-6 rounded-2xl border-2 transition-all text-left ${mode === 'doubt'
                                        ? 'border-pairon-accent bg-pairon-accent/5 dark:bg-pairon-accent/10'
                                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                        }`}
                                >
                                    <HelpCircle className={`w-8 h-8 mb-3 ${mode === 'doubt' ? 'text-pairon-accent' : 'text-gray-400'}`} />
                                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Ask a Doubt</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Get help with a specific topic or problem
                                    </p>
                                </button>

                                <button
                                    onClick={() => setMode('tech-talk')}
                                    className={`p-6 rounded-2xl border-2 transition-all text-left ${mode === 'tech-talk'
                                        ? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/10'
                                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                        }`}
                                >
                                    <Coffee className={`w-8 h-8 mb-3 ${mode === 'tech-talk' ? 'text-blue-500' : 'text-gray-400'}`} />
                                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Tech Talk</h3>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Casual conversation about technology
                                    </p>
                                </button>
                            </div>

                            {/* Topic Input (doubt mode) */}
                            <AnimatePresence>
                                {mode === 'doubt' && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        className="mb-6"
                                    >
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            What's your doubt about? ({topic.length}/50)
                                        </label>
                                        <Input
                                            value={topic}
                                            onChange={(e) => setTopic(e.target.value.slice(0, 50))}
                                            placeholder="e.g., React useEffect cleanup..."
                                            className="rounded-xl"
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Start Button */}
                            {mode && (
                                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                    <Button
                                        onClick={handleStartSearch}
                                        disabled={mode === 'doubt' && topic.trim().length === 0}
                                        className="w-full pairon-btn-primary py-3 h-auto flex items-center justify-center gap-2"
                                    >
                                        <Search className="w-5 h-5" />
                                        Find someone to chat with
                                    </Button>
                                </motion.div>
                            )}

                            {/* Guidelines Notice */}
                            <div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                                    <div className="text-xs text-amber-700 dark:text-amber-300">
                                        <p className="font-medium mb-1">Community Guidelines</p>
                                        <p>Keep conversations professional. Explicit, adult, or harassing content is <strong>automatically blocked</strong> and will result in warnings. 3 warnings = permanent remark on your profile.</p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Searching State */}
                {chatStatus === 'searching' && (
                    <div className="flex-1 flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="text-center"
                        >
                            <div className="relative w-24 h-24 mx-auto mb-6">
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                                    className="w-full h-full rounded-full border-4 border-pairon-accent/20 border-t-pairon-accent"
                                />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    {mode === 'doubt' ? (
                                        <HelpCircle className="w-8 h-8 text-pairon-accent" />
                                    ) : (
                                        <Coffee className="w-8 h-8 text-blue-500" />
                                    )}
                                </div>
                            </div>
                            <h3 className="font-display text-xl font-semibold text-gray-900 dark:text-white mb-2">
                                {mode === 'doubt' ? 'Finding someone to help...' : 'Finding a tech talk partner...'}
                            </h3>
                            {mode === 'doubt' && topic && (
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                                    Topic: "{topic}"
                                </p>
                            )}
                            <Button variant="outline" onClick={handleCancelSearch}>
                                Cancel
                            </Button>
                        </motion.div>
                    </div>
                )}

                {/* Chat State */}
                {(chatStatus === 'chatting' || chatStatus === 'ended') && activeChat && (
                    <div className="flex-1 flex flex-col">
                        {/* Chat Header Bar */}
                        <div className="px-6 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-pairon-accent/10 flex items-center justify-center">
                                    <span className="text-sm font-semibold text-pairon-accent">
                                        {activeChat.partnerName.charAt(0).toUpperCase()}
                                    </span>
                                </div>
                                <div>
                                    <p className="font-medium text-gray-900 dark:text-white text-sm">
                                        {activeChat.partnerName}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {activeChat.mode === 'doubt' ? `Doubt: ${activeChat.topic}` : 'Tech Talk'}
                                    </p>
                                </div>
                                {activeChat.status === 'active' && (
                                    <span className="ml-auto flex items-center gap-1 text-xs text-green-500">
                                        <span className="w-2 h-2 rounded-full bg-green-500" />
                                        Active
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {activeChat.messages.map((msg) => {
                                const isMe = msg.senderId === user?.id;
                                const isSystem = msg.type === 'system';

                                if (isSystem) {
                                    return (
                                        <div key={msg.id} className="flex justify-center">
                                            <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full max-w-md text-center">
                                                {msg.content}
                                            </span>
                                        </div>
                                    );
                                }

                                return (
                                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                                        <div
                                            className={`max-w-[70%] px-4 py-2.5 rounded-2xl ${isMe
                                                ? 'bg-pairon-accent text-white rounded-br-md'
                                                : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-bl-md shadow-sm'
                                                }`}
                                        >
                                            <p className="text-sm">{msg.content}</p>
                                            <span className={`text-[10px] mt-1 block ${isMe ? 'text-white/60' : 'text-gray-400'}`}>
                                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Rating Section (when chat ended) */}
                        {chatStatus === 'ended' && !activeChat.rated && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="px-4 py-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700"
                            >
                                <p className="text-center text-sm text-gray-600 dark:text-gray-400 mb-3">
                                    How was this conversation?
                                </p>
                                <div className="flex gap-3 justify-center">
                                    <Button
                                        onClick={() => handleRate('helpful')}
                                        className="flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white rounded-xl"
                                    >
                                        <ThumbsUp className="w-4 h-4" />
                                        Helpful (+5 credits for partner)
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={() => handleRate('not-helpful')}
                                        className="flex items-center gap-2 rounded-xl"
                                    >
                                        <ThumbsDown className="w-4 h-4" />
                                        Not helpful
                                    </Button>
                                </div>
                            </motion.div>
                        )}

                        {/* Rated / Start New */}
                        {chatStatus === 'ended' && activeChat.rated && (
                            <div className="px-4 py-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 text-center">
                                <p className="text-sm text-gray-500 mb-3">Thanks for your feedback!</p>
                                <Button onClick={handleNewChat} className="pairon-btn-primary">
                                    Start a new chat
                                </Button>
                            </div>
                        )}

                        {/* Input (only when active) */}
                        {chatStatus === 'chatting' && activeChat.status === 'active' && (
                            <form
                                onSubmit={handleSendMessage}
                                className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                            >
                                <div className="flex gap-2">
                                    <Input
                                        value={newMessage}
                                        onChange={(e) => setNewMessage(e.target.value)}
                                        placeholder="Type a message..."
                                        className="flex-1 rounded-full"
                                    />
                                    <Button
                                        type="submit"
                                        size="icon"
                                        className="rounded-full bg-pairon-accent hover:bg-pairon-accent-dark"
                                    >
                                        <Send className="w-4 h-4" />
                                    </Button>
                                </div>
                            </form>
                        )}
                    </div>
                )}
            </main>

            {/* Proposal Modal */}
            <AnimatePresence>
                {showProposalModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
                        onClick={() => setShowProposalModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="font-display text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    <Handshake className="w-5 h-5 text-pairon-accent" />
                                    Propose Collaboration
                                </h3>
                                <button onClick={() => setShowProposalModal(false)}>
                                    <X className="w-5 h-5 text-gray-400" />
                                </button>
                            </div>

                            {/* AI Project Ideas */}
                            <div className="mb-4">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                                    {loadingIdeas ? '✨ Generating ideas for you two...' : '🧠 AI-Suggested Projects'}
                                </label>
                                {loadingIdeas ? (
                                    <div className="flex justify-center py-8">
                                        <div className="w-8 h-8 border-4 border-pairon-accent/30 border-t-pairon-accent rounded-full animate-spin" />
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {aiIdeas.map((idea, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => setSelectedIdea(idea)}
                                                className={`w-full p-4 rounded-xl text-left border-2 transition-all ${selectedIdea?.title === idea.title
                                                    ? 'border-pairon-accent bg-pairon-accent/5'
                                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                                                    }`}
                                            >
                                                <div className="flex items-start gap-2">
                                                    <Sparkles className={`w-4 h-4 mt-0.5 flex-shrink-0 ${selectedIdea?.title === idea.title ? 'text-pairon-accent' : 'text-gray-400'
                                                        }`} />
                                                    <div>
                                                        <p className="font-medium text-sm text-gray-900 dark:text-white">{idea.title}</p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{idea.description}</p>
                                                        <div className="flex gap-2 mt-2">
                                                            <span className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full">{idea.category}</span>
                                                            <span className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full">{idea.difficulty}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Mode */}
                            <div className="mb-4">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                                    Collaboration Mode
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { value: 'sprint' as const, label: '⚡ Sprint', desc: '1 hour' },
                                        { value: 'challenge' as const, label: '🏆 Challenge', desc: '2 hours' },
                                        { value: 'build' as const, label: '🔨 Build', desc: '3 hours' },
                                    ].map((m) => (
                                        <button
                                            key={m.value}
                                            onClick={() => setProposalMode(m.value)}
                                            className={`p-3 rounded-xl text-center border-2 transition-all ${proposalMode === m.value
                                                ? 'border-pairon-accent bg-pairon-accent/5'
                                                : 'border-gray-200 dark:border-gray-700'
                                                }`}
                                        >
                                            <p className="text-sm font-medium text-gray-900 dark:text-white">{m.label}</p>
                                            <p className="text-xs text-gray-500">{m.desc}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Message */}
                            <div className="mb-6">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                                    Personal message (optional)
                                </label>
                                <Input
                                    value={proposalMessage}
                                    onChange={(e) => setProposalMessage(e.target.value.slice(0, 200))}
                                    placeholder="Hey! I think we'd build something great together..."
                                    className="rounded-xl"
                                />
                            </div>

                            {/* Send */}
                            <Button
                                onClick={handleSendProposal}
                                disabled={!selectedIdea}
                                className="w-full pairon-btn-primary flex items-center justify-center gap-2 py-3 h-auto"
                            >
                                <Handshake className="w-5 h-5" />
                                Send Proposal
                            </Button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* End Chat Confirmation */}
            <AnimatePresence>
                {showEndConfirm && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center"
                        >
                            <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                                <AlertTriangle className="w-6 h-6 text-red-500" />
                            </div>
                            <h3 className="font-display text-lg font-bold text-gray-900 dark:text-white mb-2">
                                End this chat?
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                                Both you and your partner will be disconnected. This cannot be undone.
                            </p>
                            <div className="flex gap-3">
                                <Button
                                    variant="outline"
                                    onClick={cancelEndChat}
                                    className="flex-1 rounded-xl"
                                >
                                    Keep chatting
                                </Button>
                                <Button
                                    onClick={confirmEndChat}
                                    className="flex-1 bg-red-500 hover:bg-red-600 text-white rounded-xl"
                                >
                                    End chat
                                </Button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
