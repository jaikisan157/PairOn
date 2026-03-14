import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Send, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
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

function fmt(ts: string) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function MessagesPage() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const friendId   = searchParams.get('friendId') || '';
    const friendName = searchParams.get('friendName') || 'Chat';

    const [messages, setMessages] = useState<Msg[]>([]);
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef  = useRef<HTMLInputElement>(null);

    // Load messages on mount
    useEffect(() => {
        if (!friendId) return;
        fetch(`${API}/api/dm/thread/${friendId}`, {
            headers: { Authorization: `Bearer ${getToken()}` },
        })
            .then(r => r.json())
            .then(d => {
                if (d.messages) setMessages(d.messages);
            })
            .catch(() => setError('Could not load messages.'));
    }, [friendId]);

    // Scroll to bottom whenever messages change
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Real-time: listen for incoming messages from this friend
    useEffect(() => {
        const sock = socketService.getSocket();
        if (!sock) return;
        const handler = (data: { message: Msg; fromId: string }) => {
            if (data.fromId === friendId) {
                setMessages(prev => [...prev, data.message]);
            }
        };
        sock.on('dm:new-message', handler);
        return () => { sock.off('dm:new-message', handler); };
    }, [friendId]);

    const send = async (e: React.FormEvent) => {
        e.preventDefault();
        const content = text.trim();
        if (!content || sending) return;
        setText('');
        setSending(true);
        setError('');

        // Optimistic
        const tmp: Msg = {
            id: `tmp-${Date.now()}`,
            senderId: user?.id || '',
            content,
            timestamp: new Date().toISOString(),
        };
        setMessages(prev => [...prev, tmp]);

        try {
            const res = await fetch(`${API}/api/dm/thread/${friendId}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
                body: JSON.stringify({ content }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Send failed');
            // Replace tmp with real
            setMessages(prev => prev.map(m => m.id === tmp.id ? data.message : m));
        } catch (err: any) {
            setError(err.message);
            // Remove failed optimistic message
            setMessages(prev => prev.filter(m => m.id !== tmp.id));
            setText(content); // restore text
        }
        setSending(false);
        inputRef.current?.focus();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0b14', color: 'white', fontFamily: 'Inter, sans-serif' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', background: '#0d0e1a', flexShrink: 0 }}>
                <button onClick={() => navigate('/friends')} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', padding: 6, borderRadius: 8 }}>
                    <ArrowLeft size={20} />
                </button>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15 }}>
                    {friendName.charAt(0).toUpperCase()}
                </div>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{friendName}</span>
            </div>

            {/* Error */}
            {error && (
                <div style={{ background: '#450a0a', color: '#fca5a5', padding: '8px 16px', fontSize: 13, flexShrink: 0 }}>
                    {error}
                </div>
            )}

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {messages.length === 0 && (
                    <div style={{ margin: 'auto', textAlign: 'center', color: '#6b7280' }}>
                        <div style={{ fontSize: 32, marginBottom: 8 }}>👋</div>
                        <p style={{ fontSize: 14 }}>Say hi to {friendName}!</p>
                    </div>
                )}
                {messages.map(msg => {
                    const mine = msg.senderId === user?.id;
                    return (
                        <div key={msg.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                            <div style={{ maxWidth: '70%' }}>
                                <div style={{
                                    padding: '10px 14px',
                                    borderRadius: mine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                                    background: mine ? '#6366f1' : '#1e2030',
                                    color: 'white',
                                    fontSize: 14,
                                    lineHeight: 1.5,
                                    wordBreak: 'break-word',
                                    border: mine ? 'none' : '1px solid rgba(255,255,255,0.06)',
                                }}>
                                    {msg.content}
                                </div>
                                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 3, textAlign: mine ? 'right' : 'left', paddingInline: 4 }}>
                                    {fmt(msg.timestamp)}
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={bottomRef} />
            </div>

            {/* Input */}
            <form onSubmit={send} style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.07)', background: '#0d0e1a', flexShrink: 0 }}>
                <input
                    ref={inputRef}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder={`Message ${friendName}...`}
                    autoComplete="off"
                    style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: '10px 16px', color: 'white', fontSize: 14, outline: 'none' }}
                    onFocus={e => (e.target.style.borderColor = 'rgba(99,102,241,0.6)')}
                    onBlur={e => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
                />
                <button
                    type="submit"
                    disabled={!text.trim() || sending}
                    style={{ width: 40, height: 40, borderRadius: '50%', background: text.trim() ? '#6366f1' : '#374151', border: 'none', color: 'white', cursor: text.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.2s' }}
                >
                    <Send size={16} />
                </button>
            </form>
        </div>
    );
}
