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

// Decode the userId from the JWT stored in localStorage
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

    // Decode my own userId directly from JWT — reliable, no AuthContext timing issues
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
            // Only append if the message is from the person we're currently chatting with
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

        // Show optimistically on the right side immediately
        const tmpId = `tmp-${Date.now()}`;
        const tmpMsg: Msg = {
            id: tmpId,
            senderId: myId,          // use the decoded userId so left/right is correct
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

            // Replace tmp with the server-confirmed message
            setMessages(prev => prev.map(m => m.id === tmpId ? data.message : m));
        } catch (err: any) {
            // Remove the failed optimistic message and restore text
            setMessages(prev => prev.filter(m => m.id !== tmpId));
            setText(content);
            setError('Failed to send: ' + err.message);
        }

        setSending(false);
        inputRef.current?.focus();
    };

    const avatarLetter = friendName.charAt(0).toUpperCase();
    const avatarColors = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#3b82f6'];
    const avatarColor  = avatarColors[friendName.charCodeAt(0) % avatarColors.length];

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', height: '100vh',
            background: '#0a0b14', color: 'white', fontFamily: 'Inter, system-ui, sans-serif',
        }}>
            {/* ── Header ── */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)',
                background: '#0d0e1a', flexShrink: 0,
            }}>
                <button
                    onClick={() => navigate('/friends')}
                    style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', padding: 6, borderRadius: 8 }}
                >
                    <ArrowLeft size={20} />
                </button>
                <div style={{
                    width: 38, height: 38, borderRadius: '50%',
                    background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}99)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 16, flexShrink: 0,
                }}>
                    {avatarLetter}
                </div>
                <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{friendName}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>Direct Message</div>
                </div>
            </div>

            {/* ── Error banner ── */}
            {error && (
                <div style={{
                    background: '#450a0a', color: '#fca5a5',
                    padding: '8px 16px', fontSize: 13, flexShrink: 0,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <span>{error}</span>
                    <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: 16 }}>✕</button>
                </div>
            )}

            {/* ── Messages ── */}
            <div style={{
                flex: 1, overflowY: 'auto', padding: '16px 16px 8px',
                display: 'flex', flexDirection: 'column', gap: 4,
            }}>
                {messages.length === 0 && (
                    <div style={{ margin: 'auto', textAlign: 'center', color: '#4b5563' }}>
                        <div style={{ fontSize: 36, marginBottom: 10 }}>👋</div>
                        <div style={{ fontWeight: 600, color: '#6b7280' }}>{friendName}</div>
                        <div style={{ fontSize: 13, marginTop: 4 }}>Start the conversation!</div>
                    </div>
                )}

                {messages.map((msg, i) => {
                    const mine = msg.senderId === myId;
                    const prev = messages[i - 1];
                    // Group consecutive messages from the same sender
                    const showMeta = !prev || prev.senderId !== msg.senderId;

                    return (
                        <div key={msg.id} style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: mine ? 'flex-end' : 'flex-start',
                            marginTop: showMeta ? 12 : 2,
                        }}>
                            {/* Sender label (only on first in group, for partner only) */}
                            {!mine && showMeta && (
                                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2, paddingLeft: 4 }}>
                                    {friendName}
                                </div>
                            )}
                            <div style={{
                                maxWidth: '70%',
                                padding: '9px 14px',
                                borderRadius: mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                                background: mine ? '#6366f1' : '#1e2030',
                                border: mine ? 'none' : '1px solid rgba(255,255,255,0.06)',
                                color: 'white',
                                fontSize: 14,
                                lineHeight: 1.55,
                                wordBreak: 'break-word',
                            }}>
                                {msg.content}
                            </div>
                            <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2, paddingInline: 4 }}>
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
                style={{
                    display: 'flex', gap: 8, padding: '10px 16px 14px',
                    borderTop: '1px solid rgba(255,255,255,0.07)',
                    background: '#0d0e1a', flexShrink: 0,
                }}
            >
                <input
                    ref={inputRef}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e as any); } }}
                    placeholder={`Message ${friendName}...`}
                    autoComplete="off"
                    disabled={sending}
                    style={{
                        flex: 1, background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24,
                        padding: '10px 16px', color: 'white', fontSize: 14, outline: 'none',
                        transition: 'border-color 0.2s',
                    }}
                    onFocus={e => (e.target.style.borderColor = 'rgba(99,102,241,0.7)')}
                    onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
                />
                <button
                    type="submit"
                    disabled={!text.trim() || sending}
                    style={{
                        width: 42, height: 42, borderRadius: '50%',
                        background: text.trim() && !sending ? '#6366f1' : '#374151',
                        border: 'none', color: 'white',
                        cursor: text.trim() && !sending ? 'pointer' : 'not-allowed',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, transition: 'background 0.2s',
                    }}
                >
                    {sending
                        ? <div style={{ width: 16, height: 16, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                        : <Send size={16} />
                    }
                </button>
            </form>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                ::-webkit-scrollbar { width: 4px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
            `}</style>
        </div>
    );
}
