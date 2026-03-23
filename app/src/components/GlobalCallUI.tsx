import { useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, PhoneIncoming, Mic, MicOff, Volume2 } from 'lucide-react';
import { useCall } from '@/context/CallContext';

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

export function GlobalCallUI() {
  const {
    callStatus, callPartnerName, callDuration, isMuted, volume, setVolume,
    callBarPos, setCallBarPos,
    acceptCall, declineCall, endCall, toggleMute,
  } = useCall();

  const dragStartRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  const onDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartRef.current = { mx: clientX, my: clientY, px: callBarPos.x, py: callBarPos.y };

    const onMove = (ev: MouseEvent | TouchEvent) => {
      if (!dragStartRef.current) return;
      const cx = 'touches' in ev ? (ev as TouchEvent).touches[0].clientX : (ev as MouseEvent).clientX;
      const cy = 'touches' in ev ? (ev as TouchEvent).touches[0].clientY : (ev as MouseEvent).clientY;
      setCallBarPos({
        x: dragStartRef.current.px + (cx - dragStartRef.current.mx),
        y: dragStartRef.current.py + (cy - dragStartRef.current.my),
      });
    };
    const onUp = () => {
      dragStartRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
  }, [callBarPos, setCallBarPos]);

  if (callStatus === 'idle') return null;

  return (
    <>
      {/* ── Incoming call modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {callStatus === 'ringing' && (
          <motion.div
            key="incoming-call"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 99999,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
            }}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              style={{
                background: '#1a1d2e', borderRadius: 28,
                padding: '40px 36px', textAlign: 'center',
                boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
                fontFamily: 'Inter, system-ui, sans-serif',
                minWidth: 300,
              }}
            >
              {/* Pulsing ring */}
              <div style={{ position: 'relative', width: 88, height: 88, margin: '0 auto 20px' }}>
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  animation: 'callPulse 1.5s ease-in-out infinite',
                }} />
                <div style={{
                  position: 'absolute', inset: 8, borderRadius: '50%',
                  background: '#1a1d2e', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <PhoneIncoming style={{ width: 32, height: 32, color: '#10b981' }} />
                </div>
              </div>

              <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 4 }}>Incoming call</p>
              <p style={{ color: 'white', fontSize: 20, fontWeight: 700, marginBottom: 28 }}>
                {callPartnerName || 'Partner'}
              </p>

              <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
                <button
                  onClick={() => declineCall()}
                  style={{
                    width: 56, height: 56, borderRadius: '50%', border: 'none',
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', boxShadow: '0 4px 16px rgba(239,68,68,0.4)',
                    transition: 'transform 0.1s',
                  }}
                  onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.92)')}
                  onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  <PhoneOff style={{ width: 24, height: 24, color: 'white' }} />
                </button>
                <button
                  onClick={() => acceptCall()}
                  style={{
                    width: 56, height: 56, borderRadius: '50%', border: 'none',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', boxShadow: '0 4px 16px rgba(16,185,129,0.4)',
                    transition: 'transform 0.1s',
                  }}
                  onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.92)')}
                  onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  <Phone style={{ width: 24, height: 24, color: 'white' }} />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Active call / calling / reconnecting bar ──────────────────── */}
      <AnimatePresence>
        {(callStatus === 'connected' || callStatus === 'calling' || callStatus === 'reconnecting') && (
          <motion.div
            key="call-bar"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            style={{
              position: 'fixed',
              bottom: 24 + callBarPos.y,
              left: `calc(50% + ${callBarPos.x}px)`,
              transform: 'translateX(-50%)',
              zIndex: 99998,
              fontFamily: 'Inter, system-ui, sans-serif',
            }}
          >
            <div
              onMouseDown={onDragStart}
              onTouchStart={onDragStart}
              style={{
                background: callStatus === 'reconnecting'
                  ? 'linear-gradient(135deg, #d97706, #b45309)'
                  : callStatus === 'calling'
                    ? 'linear-gradient(135deg, #6366f1, #4f46e5)'
                    : 'linear-gradient(135deg, #10b981, #059669)',
                borderRadius: 50, padding: '10px 20px',
                display: 'flex', alignItems: 'center', gap: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                cursor: 'grab', userSelect: 'none',
                minWidth: 280,
              }}
            >
              {/* Status icon */}
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {callStatus === 'reconnecting' ? (
                  <div style={{
                    width: 16, height: 16, border: '2px solid white',
                    borderTopColor: 'transparent', borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                ) : callStatus === 'calling' ? (
                  <Phone style={{ width: 18, height: 18, color: 'white', animation: 'callPulse 1.5s ease-in-out infinite' }} />
                ) : (
                  <Phone style={{ width: 18, height: 18, color: 'white' }} />
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: 'white', fontSize: 13, fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {callPartnerName || 'Partner'}
                </p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, margin: 0 }}>
                  {callStatus === 'reconnecting' ? 'Reconnecting...'
                    : callStatus === 'calling' ? 'Calling...'
                    : fmt(callDuration)}
                </p>
              </div>

              {/* Controls (only when connected) */}
              {callStatus === 'connected' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {/* Mute button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                    style={{
                      width: 32, height: 32, borderRadius: '50%', border: 'none',
                      background: isMuted ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.15)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
                    }}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted
                      ? <MicOff style={{ width: 14, height: 14, color: '#fca5a5' }} />
                      : <Mic style={{ width: 14, height: 14, color: 'white' }} />}
                  </button>
                  {/* Volume slider */}
                  <Volume2 style={{ width: 13, height: 13, color: 'rgba(255,255,255,0.7)', flexShrink: 0 }} />
                  <input
                    max={100}
                    value={volume}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onChange={(e) => { e.stopPropagation(); setVolume(Number(e.target.value)); }}
                    title={`Volume: ${volume}%`}
                    style={{
                      width: 64, height: 4, accentColor: 'white',
                      cursor: 'pointer', flexShrink: 0,
                    }}
                  />
                </div>
              )}

              {/* End call */}
              <button
                onClick={(e) => { e.stopPropagation(); endCall(true); }}
                style={{
                  width: 36, height: 36, borderRadius: '50%', border: 'none',
                  background: '#ef4444',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0,
                  transition: 'transform 0.1s',
                }}
                onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.9)')}
                onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                title="End call"
              >
                <PhoneOff style={{ width: 16, height: 16, color: 'white' }} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Animations */}
      <style>{`
        @keyframes callPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.12); opacity: 0.7; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
