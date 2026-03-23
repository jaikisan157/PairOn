import { useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, PhoneIncoming, Mic, MicOff, Volume2 } from 'lucide-react';
import { useCall } from '@/context/CallContext';

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

// Bar dimensions (keep in sync with the rendered bar width/height)
const BAR_W = 300;
const BAR_H = 56;
const PAD   = 12; // minimum distance from viewport edge

export function GlobalCallUI() {
  const {
    callStatus, callPartnerName, callDuration, isMuted, volume,
    callBarPos, setCallBarPos,
    acceptCall, declineCall, endCall, toggleMute, setVolume,
  } = useCall();

  // Track whether the user is actively dragging (suppress button clicks on drag release)
  const isDraggingRef   = useRef(false);
  const didMoveRef      = useRef(false);
  const dragStartRef    = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);

  // Clamp position so bar never leaves viewport
  const clamp = useCallback((x: number, y: number) => {
    const maxX =  (window.innerWidth  / 2) - PAD - BAR_W / 2;
    const minX = -(window.innerWidth  / 2) + PAD + BAR_W / 2;
    const maxY =  (window.innerHeight / 2) - PAD - BAR_H / 2 - 24; // 24 = bottom offset
    // allow going up but not below the bottom
    const minY = -(window.innerHeight - BAR_H - 24 - PAD) + (window.innerHeight / 2);
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  }, []);

  const onDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // Only start drag on the bar background itself, not on buttons/inputs
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' ||
        target.closest('button') || target.closest('input')) return;

    e.preventDefault();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartRef.current = { mx: clientX, my: clientY, px: callBarPos.x, py: callBarPos.y };
    isDraggingRef.current = true;
    didMoveRef.current = false;

    const onMove = (ev: MouseEvent | TouchEvent) => {
      if (!dragStartRef.current) return;
      const cx = 'touches' in ev ? (ev as TouchEvent).touches[0].clientX : (ev as MouseEvent).clientX;
      const cy = 'touches' in ev ? (ev as TouchEvent).touches[0].clientY : (ev as MouseEvent).clientY;
      const dx = cx - dragStartRef.current.mx;
      const dy = cy - dragStartRef.current.my;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didMoveRef.current = true;
      setCallBarPos(clamp(
        dragStartRef.current.px + dx,
        dragStartRef.current.py - dy, // y is inverted (measured from bottom)
      ));
    };

    const onUp = () => {
      isDraggingRef.current = false;
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
  }, [callBarPos, setCallBarPos, clamp]);

  // Re-clamp if window resizes
  useEffect(() => {
    const onResize = () => setCallBarPos(prev => clamp(prev.x, prev.y));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clamp, setCallBarPos]);

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
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
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
                <button onClick={() => declineCall()} style={{
                  width: 56, height: 56, borderRadius: '50%', border: 'none',
                  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', boxShadow: '0 4px 16px rgba(239,68,68,0.4)',
                }}>
                  <PhoneOff style={{ width: 24, height: 24, color: 'white' }} />
                </button>
                <button onClick={() => acceptCall()} style={{
                  width: 56, height: 56, borderRadius: '50%', border: 'none',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', boxShadow: '0 4px 16px rgba(16,185,129,0.4)',
                }}>
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
              width: BAR_W,
              // Prevent bar from going below viewport
              maxHeight: 'calc(100vh - 12px)',
            }}
          >
            {/* Outer container — handles drag, pointer-events split from controls */}
            <div
              onMouseDown={onDragStart}
              onTouchStart={onDragStart}
              style={{
                background: callStatus === 'reconnecting'
                  ? 'linear-gradient(135deg, #d97706, #b45309)'
                  : callStatus === 'calling'
                    ? 'linear-gradient(135deg, #6366f1, #4f46e5)'
                    : 'linear-gradient(135deg, #10b981, #059669)',
                borderRadius: 50,
                padding: '10px 16px',
                display: 'flex', alignItems: 'center', gap: 10,
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                cursor: isDraggingRef.current ? 'grabbing' : 'grab',
                userSelect: 'none',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              {/* Status icon */}
              <div style={{
                width: 34, height: 34, borderRadius: '50%',
                background: 'rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {callStatus === 'reconnecting' ? (
                  <div style={{
                    width: 16, height: 16, border: '2px solid white',
                    borderTopColor: 'transparent', borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                ) : (
                  <Phone style={{ width: 16, height: 16, color: 'white',
                    ...(callStatus === 'calling' ? { animation: 'callPulse 1.5s ease-in-out infinite' } : {}) }} />
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: 'white', fontSize: 12, fontWeight: 600, margin: 0,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {callPartnerName || 'Partner'}
                </p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, margin: 0 }}>
                  {callStatus === 'reconnecting' ? 'Reconnecting...'
                    : callStatus === 'calling' ? 'Calling...'
                    : fmt(callDuration)}
                </p>
              </div>

              {/* Controls — IMPORTANT: pointer-events: auto; stops drag from capturing clicks */}
              {callStatus === 'connected' && (
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}
                  onMouseDown={e => e.stopPropagation()}
                  onTouchStart={e => e.stopPropagation()}
                >
                  {/* Mute button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                    style={{
                      width: 30, height: 30, borderRadius: '50%', border: 'none',
                      background: isMuted ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
                    }}
                    title={isMuted ? 'Unmute mic' : 'Mute mic'}
                  >
                    {isMuted
                      ? <MicOff style={{ width: 13, height: 13, color: '#fca5a5' }} />
                      : <Mic style={{ width: 13, height: 13, color: 'white' }} />}
                  </button>

                  {/* Volume icon + slider */}
                  <Volume2 style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.8)', flexShrink: 0 }} />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: 56, height: 4, cursor: 'pointer',
                      accentColor: 'white', flexShrink: 0,
                      touchAction: 'none',
                    }}
                    title={`Volume: ${volume}%`}
                  />
                </div>
              )}

              {/* End call */}
              <button
                onClick={(e) => { e.stopPropagation(); endCall(true); }}
                onMouseDown={e => e.stopPropagation()}
                onTouchStart={e => e.stopPropagation()}
                style={{
                  width: 32, height: 32, borderRadius: '50%', border: 'none',
                  background: '#ef4444',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0, pointerEvents: 'auto',
                }}
                title="End call"
              >
                <PhoneOff style={{ width: 14, height: 14, color: 'white' }} />
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
