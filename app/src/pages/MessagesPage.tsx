import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Send, ArrowLeft, MessageCircle, Search, AlertCircle, Star } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { socketService } from '@/lib/socket';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface DMMessage {
    id: string;
    senderId: string;
    content: string;
    timestamp: string;
    read: boolean;
    failed?: boolean; // optimistic failure flag
}

interface Thread {
    threadId: string;
    partner: { id: string; name: string; reputation: number };
    lastMessage: string;
    lastMessageAt: string;
    unread: number;
}

function getToken() {
    return localStorage.getItem('pairon_token') || '';
}

function timeAgo(date: string) {
    if (!date) return '';
    const diff = Date.now() - new Date(date).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
    const colors = [
        'from-violet-500 to-indigo-600',
        'from-pink-500 to-rose-600',
        'from-emerald-500 to-teal-600',
        'from-amber-500 to-orange-600',
        'from-blue-500 to-cyan-600',
    ];
    const safe = name || '?';
    const color = colors[safe.charCodeAt(0) % colors.length];
    const sz = size === 'sm' ? 'w-7 h-7 text-xs' : size === 'lg' ? 'w-12 h-12 text-base' : 'w-10 h-10 text-sm';
    return (
        <div className={`${sz} rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white font-bold flex-shrink-0 select-none`}>
            {safe.charAt(0).toUpperCase()}
        </div>
    );
}

export function MessagesPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const initialFriendId = searchParams.get('friendId');
    const initialFriendName = searchParams.get('friendName') || 'Friend';

    const [threads, setThreads] = useState<Thread[]>([]);
    const [activeThread, setActiveThread] = useState<{
        threadId: string;
        partner: Thread['partner'];
        messages: DMMessage[];
    } | null>(
        initialFriendId
            ? { threadId: '', partner: { id: initialFriendId, name: initialFriendName, reputation: 0 }, messages: [] }
            : null
    );
    const [newMessage, setNewMessage] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [loadingThread, setLoadingThread] = useState(!!initialFriendId);
    const [sendError, setSendError] = useState<string | null>(null);
    const [partnerTyping, setPartnerTyping] = useState(false);
    const [sendingMessage, setSendingMessage] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const activeFriendIdRef = useRef<string | null>(initialFriendId);

    const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
        messagesEndRef.current?.scrollIntoView({ behavior });
    }, []);

    // ── Load thread list ──
    const loadThreads = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/dm/threads`, {
                headers: { Authorization: `Bearer ${getToken()}` },
            });
            if (res.ok) {
                const data = await res.json();
                setThreads(data.threads || []);
            }
        } catch (err) {
            console.error('[DM] load threads failed:', err);
        }
    }, []);

    // ── Open a specific thread (GET or create) ──
    const openThread = useCallback(async (friendId: string, partnerNameHint?: string) => {
        setLoadingThread(true);
        setSendError(null);
        activeFriendIdRef.current = friendId;

        // Immediately show chat panel with placeholder before API responds
        setActiveThread(prev =>
            prev?.partner.id === friendId
                ? prev
                : { threadId: '', partner: { id: friendId, name: partnerNameHint || '...', reputation: 0 }, messages: [] }
        );

        try {
            const res = await fetch(`${API}/api/dm/thread/${friendId}`, {
                headers: { Authorization: `Bearer ${getToken()}` },
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({ error: 'Failed to load chat' }));
                throw new Error(err.error || `HTTP ${res.status}`);
            }
            const data = await res.json();
            setActiveThread({
                threadId: data.threadId,
                partner: data.partner,
                messages: data.messages || [],
            });
            // Mark this thread as read
            setThreads(prev => prev.map(t => t.partner.id === friendId ? { ...t, unread: 0 } : t));
        } catch (err: any) {
            console.error('[DM] openThread failed:', err.message);
            setSendError(`Could not load messages: ${err.message}`);
        }
        setLoadingThread(false);
        // Focus the input after loading
        setTimeout(() => inputRef.current?.focus(), 100);
    }, []);

    // On mount
    useEffect(() => {
        loadThreads();
        if (initialFriendId) openThread(initialFriendId, initialFriendName);
    }, []); // eslint-disable-line

    // Scroll on new messages
    useEffect(() => {
        if (activeThread?.messages?.length) scrollToBottom();
    }, [activeThread?.messages?.length, scrollToBottom]);

    // ── Socket: real-time messages + typing ──
    useEffect(() => {
        const sock = socketService.getSocket();
        if (!sock) return;

        const handleNewMessage = (data: {
            threadId: string;
            message: DMMessage;
            fromId: string;
            fromName: string;
        }) => {
            if (activeFriendIdRef.current === data.fromId) {
                // We're in that conversation — append message
                setActiveThread(prev =>
                    prev ? { ...prev, messages: [...prev.messages, data.message] } : prev
                );
                setPartnerTyping(false);
            } else {
                // Different conversation — bump unread badge
                setThreads(prev =>
                    prev.map(t =>
                        t.partner.id === data.fromId
                            ? { ...t, unread: t.unread + 1, lastMessage: data.message.content, lastMessageAt: data.message.timestamp }
                            : t
                    )
                );
            }
            // Refresh full thread list
            loadThreads();
        };

        const handleTyping = ({ fromId }: { fromId: string }) => {
            if (activeFriendIdRef.current === fromId) setPartnerTyping(true);
        };
        const handleStopTyping = ({ fromId }: { fromId: string }) => {
            if (activeFriendIdRef.current === fromId) setPartnerTyping(false);
        };

        sock.on('dm:new-message', handleNewMessage);
        sock.on('dm:partner-typing', handleTyping);
        sock.on('dm:partner-stop-typing', handleStopTyping);
        return () => {
            sock.off('dm:new-message', handleNewMessage);
            sock.off('dm:partner-typing', handleTyping);
            sock.off('dm:partner-stop-typing', handleStopTyping);
        };
    }, [loadThreads]);

    // ── Typing indicator emit ──
    const handleTypingInput = (value: string) => {
        setNewMessage(value);
        if (!activeThread) return;
        const sock = socketService.getSocket();
        if (sock) {
            sock.emit('dm:typing', { toId: activeThread.partner.id });
            if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
            typingTimerRef.current = setTimeout(() => {
                sock.emit('dm:stop-typing', { toId: activeThread.partner.id });
            }, 1500);
        }
    };

    // ── Send message ──
    const sendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !activeThread || sendingMessage) return;

        const content = newMessage.trim();
        setNewMessage('');
        setSendError(null);
        setSendingMessage(true);

        const optimisticId = `opt-${Date.now()}`;
        const optimisticMsg: DMMessage = {
            id: optimisticId,
            senderId: user?.id || '',
            content,
            timestamp: new Date().toISOString(),
            read: false,
        };

        // Show immediately
        setActiveThread(prev => prev ? { ...prev, messages: [...prev.messages, optimisticMsg] } : prev);

        try {
            const res = await fetch(`${API}/api/dm/thread/${activeThread.partner.id}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({ content }),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
                throw new Error(errData.error || `HTTP ${res.status}`);
            }

            const data = await res.json();

            // Replace optimistic with confirmed message
            setActiveThread(prev => prev ? {
                ...prev,
                threadId: data.threadId || prev.threadId,
                messages: prev.messages.map(m => m.id === optimisticId ? data.message : m),
            } : prev);

            // Update thread list with latest message
            setThreads(prev => {
                const exists = prev.find(t => t.partner.id === activeThread.partner.id);
                const updated = {
                    threadId: data.threadId || activeThread.threadId,
                    partner: activeThread.partner,
                    lastMessage: content,
                    lastMessageAt: new Date().toISOString(),
                    unread: 0,
                };
                if (exists) {
                    return prev
                        .map(t => t.partner.id === activeThread.partner.id ? { ...t, ...updated } : t)
                        .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
                }
                return [updated, ...prev];
            });
        } catch (err: any) {
            console.error('[DM] sendMessage failed:', err.message);
            // Mark optimistic message as failed
            setActiveThread(prev => prev ? {
                ...prev,
                messages: prev.messages.map(m => m.id === optimisticId ? { ...m, failed: true } : m),
            } : prev);
            setSendError(`Failed to send: ${err.message}`);
        }
        setSendingMessage(false);
    };

    const filteredThreads = threads.filter(t =>
        t.partner.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="h-screen bg-[#0a0b14] flex flex-col select-none">
            {/* Top Bar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-[#0d0e1a] flex-shrink-0">
                <button
                    onClick={() => navigate('/friends')}
                    className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2">
                    <MessageCircle className="w-5 h-5 text-indigo-400" />
                    <h1 className="text-white font-semibold">
                        {activeThread ? activeThread.partner.name : 'Messages'}
                    </h1>
                </div>
            </div>

            <div className="flex flex-1 min-h-0">
                {/* ── Sidebar ── */}
                <div className="w-72 border-r border-white/5 flex flex-col bg-[#0d0e1a] flex-shrink-0">
                    <div className="p-3 border-b border-white/5">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                            <input
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search chats..."
                                className="w-full bg-white/5 border border-white/5 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-500/50"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        {/* Show the currently active friend if not yet in thread list */}
                        {activeThread && !filteredThreads.find(t => t.partner.id === activeThread.partner.id) && (
                            <div className="flex items-center gap-3 px-3 py-3 bg-indigo-500/10 border-r-2 border-indigo-500">
                                <Avatar name={activeThread.partner.name} size="md" />
                                <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium text-white block truncate">
                                        {activeThread.partner.name}
                                    </span>
                                    <p className="text-xs text-indigo-400 mt-0.5">New conversation</p>
                                </div>
                            </div>
                        )}

                        {filteredThreads.length === 0 && !activeThread && (
                            <div className="flex flex-col items-center justify-center h-48 text-center px-6">
                                <MessageCircle className="w-8 h-8 text-gray-700 mb-2" />
                                <p className="text-sm text-gray-500">No conversations yet.</p>
                                <p className="text-xs text-gray-600 mt-1">
                                    Go to{' '}
                                    <span
                                        className="text-indigo-400 cursor-pointer hover:underline"
                                        onClick={() => navigate('/friends')}
                                    >
                                        Friends
                                    </span>{' '}
                                    and tap the chat icon.
                                </p>
                            </div>
                        )}

                        {filteredThreads.map(thread => (
                            <button
                                key={thread.threadId}
                                onClick={() => openThread(thread.partner.id, thread.partner.name)}
                                className={`w-full flex items-center gap-3 px-3 py-3 hover:bg-white/5 transition-colors text-left ${
                                    activeThread?.partner.id === thread.partner.id
                                        ? 'bg-indigo-500/10 border-r-2 border-indigo-500'
                                        : ''
                                }`}
                            >
                                <div className="relative">
                                    <Avatar name={thread.partner.name} size="md" />
                                    {thread.unread > 0 && (
                                        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-indigo-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                                            {thread.unread > 9 ? '9+' : thread.unread}
                                        </span>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <span className={`text-sm font-medium truncate ${thread.unread > 0 ? 'text-white' : 'text-gray-300'}`}>
                                            {thread.partner.name}
                                        </span>
                                        <span className="text-[10px] text-gray-600 flex-shrink-0 ml-2">
                                            {timeAgo(thread.lastMessageAt)}
                                        </span>
                                    </div>
                                    <p className={`text-xs truncate mt-0.5 ${thread.unread > 0 ? 'text-gray-300 font-medium' : 'text-gray-600'}`}>
                                        {thread.lastMessage || 'Start a conversation'}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* ── Main Chat Area ── */}
                <div className="flex-1 flex flex-col min-w-0">
                    {!activeThread ? (
                        <div className="flex-1 flex items-center justify-center flex-col gap-3 text-center p-8">
                            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
                                <MessageCircle className="w-8 h-8 text-indigo-400" />
                            </div>
                            <h2 className="text-white font-semibold text-lg">Your Messages</h2>
                            <p className="text-gray-500 text-sm max-w-xs">
                                Send private messages to your friends. Go to{' '}
                                <span className="text-indigo-400 cursor-pointer hover:underline" onClick={() => navigate('/friends')}>
                                    Friends
                                </span>{' '}
                                and tap the chat icon to start.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Chat Header */}
                            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-[#0d0e1a] flex-shrink-0">
                                <Avatar name={activeThread.partner.name} size="md" />
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-white font-semibold text-sm">{activeThread.partner.name}</span>
                                    </div>
                                    {activeThread.partner.reputation > 0 && (
                                        <div className="flex items-center gap-1 text-xs text-gray-500">
                                            <Star className="w-2.5 h-2.5 text-yellow-500 fill-yellow-500" />
                                            <span>{activeThread.partner.reputation} rep</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Error banner */}
                            <AnimatePresence>
                                {sendError && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -8 }}
                                        className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs"
                                    >
                                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                        {sendError}
                                        <button onClick={() => setSendError(null)} className="ml-auto text-red-400 hover:text-red-300">✕</button>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2" style={{ minHeight: 0 }} id="dm-messages">
                                {loadingThread && (
                                    <div className="flex items-center justify-center py-10">
                                        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                )}

                                {!loadingThread && activeThread.messages.length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-20 text-center">
                                        <Avatar name={activeThread.partner.name} size="lg" />
                                        <p className="text-white font-semibold mt-3 text-base">{activeThread.partner.name}</p>
                                        <p className="text-gray-500 text-sm mt-1">Say hi! This is the start of your conversation 👋</p>
                                    </div>
                                )}

                                {activeThread.messages.map((msg, idx) => {
                                    const isOwn = msg.senderId === user?.id;
                                    const prevMsg = activeThread.messages[idx - 1];
                                    const showAvatar = !isOwn && (!prevMsg || prevMsg.senderId !== msg.senderId);
                                    return (
                                        <motion.div
                                            key={msg.id}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.15 }}
                                            className={`flex items-end gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}
                                        >
                                            {!isOwn && (
                                                <div className="w-7 flex-shrink-0">
                                                    {showAvatar && <Avatar name={activeThread.partner.name} size="sm" />}
                                                </div>
                                            )}
                                            <div className={`max-w-[68%] flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                                                <div className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed break-words ${
                                                    msg.failed
                                                        ? 'bg-red-900/40 border border-red-500/30 text-red-300 rounded-br-sm'
                                                        : isOwn
                                                            ? 'bg-indigo-600 text-white rounded-br-sm'
                                                            : 'bg-[#1e2030] text-gray-100 border border-white/5 rounded-bl-sm'
                                                }`}>
                                                    {msg.content}
                                                </div>
                                                <span className="text-[10px] text-gray-600 mt-1 px-1">
                                                    {msg.failed ? '⚠ Failed · tap to retry' : timeAgo(msg.timestamp)}
                                                </span>
                                            </div>
                                        </motion.div>
                                    );
                                })}

                                {/* Typing indicator */}
                                <AnimatePresence>
                                    {partnerTyping && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0 }}
                                            className="flex items-end gap-2"
                                        >
                                            <Avatar name={activeThread.partner.name} size="sm" />
                                            <div className="bg-[#1e2030] border border-white/5 px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-1">
                                                {[0, 1, 2].map(i => (
                                                    <span
                                                        key={i}
                                                        className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce"
                                                        style={{ animationDelay: `${i * 0.15}s` }}
                                                    />
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Message Input */}
                            <form
                                onSubmit={sendMessage}
                                className="flex items-center gap-2 px-4 py-3 border-t border-white/5 bg-[#0d0e1a] flex-shrink-0"
                            >
                                <input
                                    ref={inputRef}
                                    value={newMessage}
                                    onChange={e => handleTypingInput(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            sendMessage(e as any);
                                        }
                                    }}
                                    placeholder={`Message ${activeThread.partner.name}...`}
                                    disabled={loadingThread}
                                    className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-500/60 transition-colors disabled:opacity-40"
                                    autoComplete="off"
                                />
                                <button
                                    type="submit"
                                    disabled={!newMessage.trim() || sendingMessage || loadingThread}
                                    className="w-9 h-9 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-white transition-all flex-shrink-0"
                                >
                                    {sendingMessage
                                        ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        : <Send className="w-4 h-4" />
                                    }
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
