import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Send, ArrowLeft, MessageCircle, Search, Circle, Star } from 'lucide-react';
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
    const diff = Date.now() - new Date(date).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
    const colors = ['from-violet-500 to-indigo-600', 'from-pink-500 to-rose-600', 'from-emerald-500 to-teal-600', 'from-amber-500 to-orange-600', 'from-blue-500 to-cyan-600'];
    const color = colors[name.charCodeAt(0) % colors.length];
    const sz = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-12 h-12 text-base' : 'w-10 h-10 text-sm';
    return (
        <div className={`${sz} rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-white font-bold flex-shrink-0`}>
            {name.charAt(0).toUpperCase()}
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
    // Pre-open chat immediately if friendId is in URL
    const [activeThread, setActiveThread] = useState<{ threadId: string; partner: Thread['partner']; messages: DMMessage[] } | null>(
        initialFriendId
            ? { threadId: '', partner: { id: initialFriendId, name: initialFriendName, reputation: 0 }, messages: [] }
            : null
    );
    const [newMessage, setNewMessage] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(!!initialFriendId); // show spinner inside chat if loading
    const [partnerTyping, setPartnerTyping] = useState(false);
    const [sendingMessage, setSendingMessage] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const activeFriendIdRef = useRef<string | null>(initialFriendId);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    // Load thread list
    const loadThreads = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/dm/threads`, { headers: { Authorization: `Bearer ${getToken()}` } });
            if (res.ok) {
                const data = await res.json();
                setThreads(data.threads);
            }
        } catch { /* */ }
    }, []);

    // Open a specific thread (populates full data: threadId, messages, partner info)
    const openThread = useCallback(async (friendId: string, partnerNameHint?: string) => {
        setLoading(true);
        activeFriendIdRef.current = friendId;
        // Immediately show a placeholder so the chat panel is visible
        setActiveThread(prev => prev?.partner.id === friendId ? prev : {
            threadId: '',
            partner: { id: friendId, name: partnerNameHint || 'Loading...', reputation: 0 },
            messages: [],
        });
        try {
            const res = await fetch(`${API}/api/dm/thread/${friendId}`, { headers: { Authorization: `Bearer ${getToken()}` } });
            if (res.ok) {
                const data = await res.json();
                setActiveThread({ threadId: data.threadId, partner: data.partner, messages: data.messages });
                // Clear unread badge for this thread
                setThreads(prev => prev.map(t => t.partner.id === friendId ? { ...t, unread: 0 } : t));
            }
        } catch { /* */ }
        setLoading(false);
    }, []);

    useEffect(() => {
        loadThreads();
        // Auto-open thread from URL param: data loads in background, chat is already visible
        if (initialFriendId) openThread(initialFriendId, initialFriendName);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (activeThread) scrollToBottom();
    }, [activeThread?.messages, scrollToBottom]);

    // Socket: real-time incoming messages + typing
    useEffect(() => {
        const sock = socketService.getSocket();
        if (!sock) return;

        const handleNewMessage = (data: { threadId: string; message: DMMessage; fromId: string; fromName: string }) => {
            // If in the active thread with this person, append message
            if (activeFriendIdRef.current === data.fromId) {
                setActiveThread(prev => prev ? { ...prev, messages: [...prev.messages, data.message] } : prev);
                setPartnerTyping(false);
                // Mark as read immediately
                fetch(`${API}/api/dm/thread/${data.fromId}`, { headers: { Authorization: `Bearer ${getToken()}` } }).catch(() => { });
            } else {
                // Update thread list unread badge
                setThreads(prev => prev.map(t => t.partner.id === data.fromId ? {
                    ...t, unread: t.unread + 1, lastMessage: data.message.content, lastMessageAt: data.message.timestamp,
                } : t));
            }
        };

        const handleTyping = (data: { fromId: string }) => {
            if (activeFriendIdRef.current === data.fromId) setPartnerTyping(true);
        };
        const handleStopTyping = (data: { fromId: string }) => {
            if (activeFriendIdRef.current === data.fromId) setPartnerTyping(false);
        };

        sock.on('dm:new-message', handleNewMessage);
        sock.on('dm:partner-typing', handleTyping);
        sock.on('dm:partner-stop-typing', handleStopTyping);

        return () => {
            sock.off('dm:new-message', handleNewMessage);
            sock.off('dm:partner-typing', handleTyping);
            sock.off('dm:partner-stop-typing', handleStopTyping);
        };
    }, []);

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

    const sendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !activeThread || sendingMessage) return;

        const content = newMessage.trim();
        setNewMessage('');
        setSendingMessage(true);

        // Optimistic update
        const optimisticMsg: DMMessage = {
            id: `opt-${Date.now()}`,
            senderId: user?.id || '',
            content,
            timestamp: new Date().toISOString(),
            read: false,
        };
        setActiveThread(prev => prev ? { ...prev, messages: [...prev.messages, optimisticMsg] } : prev);

        try {
            const res = await fetch(`${API}/api/dm/thread/${activeThread.partner.id}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({ content }),
            });
            if (res.ok) {
                const data = await res.json();
                // Replace optimistic with real
                setActiveThread(prev => prev ? {
                    ...prev,
                    messages: prev.messages.map(m => m.id === optimisticMsg.id ? data.message : m),
                } : prev);
                // Update thread list
                setThreads(prev => {
                    const exists = prev.find(t => t.partner.id === activeThread.partner.id);
                    if (exists) {
                        return prev.map(t => t.partner.id === activeThread.partner.id ? {
                            ...t, lastMessage: content, lastMessageAt: new Date().toISOString(),
                        } : t).sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
                    }
                    return [{
                        threadId: activeThread.threadId,
                        partner: activeThread.partner,
                        lastMessage: content,
                        lastMessageAt: new Date().toISOString(),
                        unread: 0,
                    }, ...prev];
                });
            }
        } catch { /* */ }
        setSendingMessage(false);
    };

    const filteredThreads = threads.filter(t =>
        t.partner.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="h-screen bg-[#0a0b14] flex flex-col">
            {/* Top Bar */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-[#0d0e1a] flex-shrink-0">
                <button onClick={() => navigate('/friends')} className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2">
                    <MessageCircle className="w-5 h-5 text-indigo-400" />
                    <h1 className="text-white font-semibold">Messages</h1>
                </div>
            </div>

            <div className="flex flex-1 min-h-0">
                {/* Sidebar: Thread List */}
                <div className="w-80 border-r border-white/5 flex flex-col bg-[#0d0e1a] flex-shrink-0">
                    {/* Search */}
                    <div className="p-3 border-b border-white/5">
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                            <input
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search messages..."
                                className="w-full bg-white/5 border border-white/5 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-500/50"
                            />
                        </div>
                    </div>

                    {/* Thread list */}
                    <div className="flex-1 overflow-y-auto">
                        {/* Show the currently active friend in sidebar if they're not in threads yet */}
                        {activeThread && !filteredThreads.find(t => t.partner.id === activeThread.partner.id) && (
                            <div className="w-full flex items-center gap-3 px-3 py-3 bg-indigo-500/10 border-r-2 border-indigo-500 cursor-default">
                                <Avatar name={activeThread.partner.name} size="md" />
                                <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium text-white truncate block">{activeThread.partner.name}</span>
                                    <p className="text-xs text-indigo-400 mt-0.5">New conversation</p>
                                </div>
                            </div>
                        )}
                        {filteredThreads.length === 0 && !activeThread && (
                            <div className="flex flex-col items-center justify-center h-48 text-center px-6">
                                <MessageCircle className="w-8 h-8 text-gray-700 mb-2" />
                                <p className="text-sm text-gray-500">No conversations yet.</p>
                                <p className="text-xs text-gray-600 mt-1">Go to Friends and tap the chat icon.</p>
                            </div>
                        )}
                        {filteredThreads.map(thread => (
                            <button
                                key={thread.threadId}
                                onClick={() => openThread(thread.partner.id, thread.partner.name)}
                                className={`w-full flex items-center gap-3 px-3 py-3 hover:bg-white/5 transition-colors text-left ${activeThread?.partner.id === thread.partner.id ? 'bg-indigo-500/10 border-r-2 border-indigo-500' : ''}`}
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
                                        <span className={`text-sm font-medium truncate ${thread.unread > 0 ? 'text-white' : 'text-gray-300'}`}>{thread.partner.name}</span>
                                        <span className="text-[10px] text-gray-600 flex-shrink-0 ml-2">{timeAgo(thread.lastMessageAt)}</span>
                                    </div>
                                    <p className={`text-xs truncate mt-0.5 ${thread.unread > 0 ? 'text-gray-300 font-medium' : 'text-gray-600'}`}>
                                        {thread.lastMessage || 'Start a conversation'}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>


                {/* Main Chat Area */}
                <div className="flex-1 flex flex-col min-w-0">
                    {!activeThread ? (
                        <div className="flex-1 flex items-center justify-center flex-col gap-3 text-center p-8">
                            <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
                                <MessageCircle className="w-8 h-8 text-indigo-400" />
                            </div>
                            <h2 className="text-white font-semibold text-lg">Your Messages</h2>
                            <p className="text-gray-500 text-sm max-w-xs">Send private messages to your friends. Go to <span className="text-indigo-400 cursor-pointer" onClick={() => navigate('/friends')}>Friends</span> and click Chat to start a conversation.</p>
                        </div>
                    ) : (
                        <>
                            {/* Chat Header */}
                            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 bg-[#0d0e1a] flex-shrink-0">
                                <Avatar name={activeThread.partner.name} size="md" />
                                <div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-white font-medium text-sm">{activeThread.partner.name}</span>
                                        <Circle className="w-2 h-2 fill-green-400 text-green-400" />
                                    </div>
                                    <div className="flex items-center gap-1 text-xs text-gray-500">
                                        <Star className="w-2.5 h-2.5 text-yellow-500 fill-yellow-500" />
                                        <span>{activeThread.partner.reputation} reputation</span>
                                    </div>
                                </div>
                            </div>

                            {/* Messages */}
                            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ minHeight: 0 }}>
                                {loading && (
                                    <div className="flex items-center justify-center py-8">
                                        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                )}
                                {activeThread.messages.length === 0 && !loading && (
                                    <div className="flex flex-col items-center justify-center py-16 text-center">
                                        <Avatar name={activeThread.partner.name} size="lg" />
                                        <p className="text-white font-medium mt-3">{activeThread.partner.name}</p>
                                        <p className="text-gray-500 text-sm mt-1">Say hi 👋</p>
                                    </div>
                                )}
                                {activeThread.messages.map((msg, idx) => {
                                    const isOwn = msg.senderId === user?.id;
                                    const prevMsg = activeThread.messages[idx - 1];
                                    const showAvatar = !isOwn && (idx === 0 || prevMsg?.senderId !== msg.senderId);
                                    return (
                                        <motion.div
                                            key={msg.id}
                                            initial={{ opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={`flex items-end gap-2 ${isOwn ? 'justify-end' : 'justify-start'}`}
                                        >
                                            {!isOwn && (
                                                <div className="w-7 h-7 flex-shrink-0">
                                                    {showAvatar && <Avatar name={activeThread.partner.name} size="sm" />}
                                                </div>
                                            )}
                                            <div className={`max-w-[70%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col`}>
                                                <div className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed break-words ${isOwn
                                                    ? 'bg-indigo-600 text-white rounded-br-sm'
                                                    : 'bg-[#1e2030] text-gray-100 rounded-bl-sm border border-white/5'
                                                    }`}>
                                                    {msg.content}
                                                </div>
                                                <span className="text-[10px] text-gray-600 mt-1 px-1">{timeAgo(msg.timestamp)}</span>
                                            </div>
                                        </motion.div>
                                    );
                                })}
                                {/* Partner typing indicator */}
                                <AnimatePresence>
                                    {partnerTyping && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 6 }}
                                            className="flex items-end gap-2"
                                        >
                                            <Avatar name={activeThread.partner.name} size="sm" />
                                            <div className="bg-[#1e2030] border border-white/5 px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-1">
                                                {[0, 1, 2].map(i => (
                                                    <span key={i} className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input */}
                            <form onSubmit={sendMessage} className="flex items-center gap-2 px-4 py-3 border-t border-white/5 bg-[#0d0e1a] flex-shrink-0">
                                <div className="flex-1 relative">
                                    <input
                                        value={newMessage}
                                        onChange={e => handleTypingInput(e.target.value)}
                                        placeholder={`Message ${activeThread.partner.name}...`}
                                        className="w-full bg-white/5 border border-white/10 rounded-full px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-500/60 transition-colors pr-12"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={!newMessage.trim() || sendingMessage}
                                    className="w-9 h-9 rounded-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-white transition-colors flex-shrink-0"
                                >
                                    <Send className="w-4 h-4" />
                                </button>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
