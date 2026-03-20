import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Send, ArrowLeft } from 'lucide-react';
import { socketService } from '@/lib/socket';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';

interface Msg {
    id: string;
    senderId: string;
    content: string;
    timestamp: string;
}

function getToken() {
    return localStorage.getItem('pairon_token') || '';
}

function getMyUserId(): string {
    try {
        const token = getToken();
        if (!token) return '';
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.userId || '';
    } catch {
        return '';
    }
}

function fmt(ts: string) {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MessagesPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const friendId   = searchParams.get('friendId') || '';
    const friendName = searchParams.get('friendName') || 'Chat';

    const myId = getMyUserId();

    const [messages, setMessages] = useState<Msg[]>([]);
    const [text, setText]         = useState('');
    const [sending, setSending]   = useState(false);
    const [error, setError]       = useState('');
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef  = useRef<HTMLInputElement>(null);

    // ── Fetch message history on mount ──
    useEffect(() => {
        if (!friendId) return;
        setError('');
        fetch(`${API}/api/dm/thread/${friendId}`, {
            headers: { Authorization: `Bearer ${getToken()}` },
        })
            .then(async r => {
                const data = await r.json();
                if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
                setMessages(data.messages || []);
            })
            .catch(e => setError('Could not load messages: ' + e.message));
    }, [friendId]);

    // ── Auto-scroll to latest message ──
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // ── Real-time: receive message from this friend ──
    useEffect(() => {
        const sock = socketService.getSocket();
        if (!sock || !friendId) return;
        const handler = (data: { message: Msg; fromId: string }) => {
            if (data.fromId === friendId) {
                setMessages(prev => [...prev, data.message]);
            }
        };
        sock.on('dm:new-message', handler);
        return () => { sock.off('dm:new-message', handler); };
    }, [friendId]);

    // ── Send message ──
    const send = async (e: React.FormEvent) => {
        e.preventDefault();
        const content = text.trim();
        if (!content || sending) return;

        setText('');
        setSending(true);
        setError('');

        const tmpId = `tmp-${Date.now()}`;
        const tmpMsg: Msg = {
            id: tmpId,
            senderId: myId,
            content,
            timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, tmpMsg]);

        try {
            const res = await fetch(`${API}/api/dm/thread/${friendId}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({ content }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            setMessages(prev => prev.map(m => m.id === tmpId ? data.message : m));
        } catch (err: any) {
            setMessages(prev => prev.filter(m => m.id !== tmpId));
            setText(content);
            setError('Failed to send: ' + err.message);
        }

        setSending(false);
        inputRef.current?.focus();
    };

    const avatarLetter = friendName.charAt(0).toUpperCase();

    return (
        <div className="flex flex-col h-screen bg-pairon-bg dark:bg-gray-900 text-gray-900 dark:text-white font-sans">
            {/* ── Header ── */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-white/7 bg-white dark:bg-gray-900 shrink-0">
                <button
                    onClick={() => navigate(-1)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                >
                    <ArrowLeft size={20} />
                </button>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pairon-accent to-emerald-600 flex items-center justify-center text-white font-bold text-base shrink-0">
                    {avatarLetter}
                </div>
                <div>
                    <div className="font-semibold text-sm text-gray-900 dark:text-white">{friendName}</div>
                    <div className="text-[11px] text-gray-400 dark:text-gray-500">Direct Message</div>
                </div>
            </div>

            {/* ── Error banner ── */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 px-4 py-2 text-sm shrink-0 flex justify-between items-center border-b border-red-100 dark:border-red-900/50">
                    <span>{error}</span>
                    <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 dark:hover:text-red-200 font-bold text-lg leading-none">✕</button>
                </div>
            )}

            {/* ── Messages ── */}
            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2 flex flex-col gap-1 scroll-smooth">
                {messages.length === 0 && (
                    <div className="m-auto text-center text-gray-400 dark:text-gray-500">
                        <div className="text-4xl mb-2">👋</div>
                        <div className="font-semibold text-gray-500 dark:text-gray-400">{friendName}</div>
                        <div className="text-sm mt-1">Start the conversation!</div>
                    </div>
                )}

                {messages.map((msg, i) => {
                    const mine = msg.senderId === myId;
                    const prev = messages[i - 1];
                    const showMeta = !prev || prev.senderId !== msg.senderId;

                    return (
                        <div key={msg.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'} ${showMeta ? 'mt-3' : 'mt-0.5'}`}>
                            {!mine && showMeta && (
                                <div className="text-[11px] text-gray-400 dark:text-gray-500 mb-0.5 pl-1">{friendName}</div>
                            )}
                            <div
                                className={`max-w-[70%] px-3.5 py-2.5 text-sm leading-relaxed break-words ${
                                    mine
                                        ? 'bg-pairon-accent text-white rounded-[18px_18px_4px_18px]'
                                        : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-white/6 text-gray-900 dark:text-white rounded-[18px_18px_18px_4px]'
                                }`}
                            >
                                {msg.content}
                            </div>
                            <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 px-1">
                                {fmt(msg.timestamp)}
                            </div>
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>

            {/* ── Input ── */}
            <form
                onSubmit={send}
                className="flex gap-2 px-4 py-3 border-t border-gray-200 dark:border-white/7 bg-white dark:bg-gray-900 shrink-0"
            >
                <input
                    ref={inputRef}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e as any); } }}
                    placeholder={`Message ${friendName}...`}
                    autoComplete="off"
                    disabled={sending}
                    className="flex-1 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-full px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 outline-none focus:border-pairon-accent dark:focus:border-pairon-accent transition-colors"
                />
                <button
                    type="submit"
                    disabled={!text.trim() || sending}
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                        text.trim() && !sending
                            ? 'bg-pairon-accent hover:bg-pairon-accent/90 text-white cursor-pointer'
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                    }`}
                >
                    {sending
                        ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <Send size={16} />
                    }
                </button>
            </form>
        </div>
    );
}
