import { useRef, useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, PhoneIncoming, Mic, MicOff, Volume2 } from 'lucide-react';
import { useCall } from '@/context/CallContext';

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

// The bar uses absolute pixel positioning from bottom-left corner.
// Position is stored as { x, y } where x = px from left, y = px from bottom.
const BAR_H = 52;
const EDGE_PAD = 8;

export function GlobalCallUI() {
  const {
    callStatus, callPartnerName, callDuration, isMuted, volume,
    callBarPos, setCallBarPos,
    acceptCall, declineCall, endCall, toggleMute, setVolume,
  } = useCall();

  const barRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const didMoveRef = useRef(false);

  // Detect mobile viewport
  const [isMobile, setIsMobile] = useState(window.innerWidth < 500);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 500);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Compute bar width dynamically
  const getBarW = useCallback(() => {
    return isMobile ? Math.min(window.innerWidth - EDGE_PAD * 2, 280) : 300;
  }, [isMobile]);

  // Clamp helper: ensures bar stays fully visible
  const clamp = useCallback((x: number, y: number) => {
    const barW = getBarW();
    const maxX = window.innerWidth - barW - EDGE_PAD;
    const minX = EDGE_PAD;
    const maxY = window.innerHeight - BAR_H - EDGE_PAD;
    const minY = EDGE_PAD;
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y)),
    };
  }, [getBarW]);

  // Initialize position to bottom-center on first render
  useEffect(() => {
    const barW = getBarW();
    setCallBarPos({
      x: (window.innerWidth - barW) / 2,
      y: EDGE_PAD + (isMobile ? 60 : 0), // above bottom nav on mobile
    });
  }, [isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Drag handlers (raw pointer events for reliability) ────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' ||
        target.closest('button') || target.closest('input')) return;

    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragStartRef.current = { mx: e.clientX, my: e.clientY, px: callBarPos.x, py: callBarPos.y };
    didMoveRef.current = false;
  }, [callBarPos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.mx;
    const dy = e.clientY - dragStartRef.current.my;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didMoveRef.current = true;
    setCallBarPos(clamp(
      dragStartRef.current.px + dx,
      dragStartRef.current.py - dy, // y is from bottom, so invert
    ));
  }, [clamp, setCallBarPos]);

  const onPointerUp = useCallback(() => {
    dragStartRef.current = null;
  }, []);

  // Re-clamp on resize
  useEffect(() => {
    const handler = () => setCallBarPos(prev => clamp(prev.x, prev.y));
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [clamp, setCallBarPos]);

  if (callStatus === 'idle') return null;

  const barW = getBarW();

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
              padding: 16,
            }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              style={{
                background: '#1a1d2e', borderRadius: 28,
                padding: isMobile ? '32px 24px' : '40px 36px', textAlign: 'center',
                boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
                fontFamily: 'Inter, system-ui, sans-serif',
                width: '100%', maxWidth: 320,
              }}
            >
              {/* Pulsing ring */}
              <div style={{ position: 'relative', width: 80, height: 80, margin: '0 auto 20px' }}>
                <div style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  animation: 'callPulse 1.5s ease-in-out infinite',
                }} />
                <div style={{
                  position: 'absolute', inset: 8, borderRadius: '50%',
                  background: '#1a1d2e', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <PhoneIncoming style={{ width: 28, height: 28, color: '#10b981' }} />
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
            ref={barRef}
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            style={{
              position: 'fixed',
              left: callBarPos.x,
              bottom: callBarPos.y,
              zIndex: 99998,
              fontFamily: 'Inter, system-ui, sans-serif',
              width: barW,
            }}
          >
            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              style={{
                background: callStatus === 'reconnecting'
                  ? 'linear-gradient(135deg, #d97706, #b45309)'
                  : callStatus === 'calling'
                    ? 'linear-gradient(135deg, #6366f1, #4f46e5)'
                    : 'linear-gradient(135deg, #10b981, #059669)',
                borderRadius: 50,
                padding: isMobile ? '8px 12px' : '10px 16px',
                display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10,
                boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                cursor: 'grab',
                userSelect: 'none',
                touchAction: 'none',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              {/* Status icon */}
              <div style={{
                width: isMobile ? 28 : 34, height: isMobile ? 28 : 34, borderRadius: '50%',
                background: 'rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {callStatus === 'reconnecting' ? (
                  <div style={{
                    width: 14, height: 14, border: '2px solid white',
                    borderTopColor: 'transparent', borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                ) : (
                  <Phone style={{ width: 14, height: 14, color: 'white',
                    ...(callStatus === 'calling' ? { animation: 'callPulse 1.5s ease-in-out infinite' } : {}) }} />
                )}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ color: 'white', fontSize: isMobile ? 11 : 12, fontWeight: 600, margin: 0,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {callPartnerName || 'Partner'}
                </p>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: isMobile ? 10 : 11, margin: 0 }}>
                  {callStatus === 'reconnecting' ? 'Reconnecting...'
                    : callStatus === 'calling' ? 'Calling...'
                    : fmt(callDuration)}
                </p>
              </div>

              {/* Controls */}
              {callStatus === 'connected' && (
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 4 : 6, pointerEvents: 'auto' }}
                  onPointerDown={e => e.stopPropagation()}
                >
                  {/* Mute button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                    style={{
                      width: isMobile ? 26 : 30, height: isMobile ? 26 : 30, borderRadius: '50%', border: 'none',
                      background: isMuted ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
                    }}
                    title={isMuted ? 'Unmute mic' : 'Mute mic'}
                  >
                    {isMuted
                      ? <MicOff style={{ width: 12, height: 12, color: '#fca5a5' }} />
                      : <Mic style={{ width: 12, height: 12, color: 'white' }} />}
                  </button>

                  {/* Volume — hide slider on mobile, just show icon */}
                  {!isMobile && (
                    <>
                      <Volume2 style={{ width: 12, height: 12, color: 'rgba(255,255,255,0.8)', flexShrink: 0 }} />
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={volume}
                        onChange={(e) => setVolume(Number(e.target.value))}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: 50, height: 4, cursor: 'pointer',
                          accentColor: 'white', flexShrink: 0,
                          touchAction: 'none',
                        }}
                        title={`Volume: ${volume}%`}
                      />
                    </>
                  )}
                </div>
              )}

              {/* End call */}
              <button
                onClick={(e) => { e.stopPropagation(); endCall(true); }}
                onPointerDown={e => e.stopPropagation()}
                style={{
                  width: isMobile ? 28 : 32, height: isMobile ? 28 : 32, borderRadius: '50%', border: 'none',
                  background: '#ef4444',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0, pointerEvents: 'auto',
                }}
                title="End call"
              >
                <PhoneOff style={{ width: 13, height: 13, color: 'white' }} />
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
      `}
      </style>
    </>
  );
}
