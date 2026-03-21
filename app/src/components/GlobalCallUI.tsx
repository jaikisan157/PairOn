import { useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, PhoneOff, PhoneIncoming, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { useCall } from '@/context/CallContext';

const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

export function GlobalCallUI() {
  const {
    callStatus, callPartnerName, callDuration, isMuted, isSpeakerOn,
    callBarPos, setCallBarPos,
    acceptCall, declineCall, endCall, toggleMute, toggleSpeaker,
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
              initial={{ scale: 0.85, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.85, y: 20 }}
              style={{
                background: '#111827',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 24,
                padding: '40px 48px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
                minWidth: 300,
                boxShadow: '0 32px 64px rgba(0,0,0,0.6)',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            >
              {/* Pulsing ring */}
              <div style={{ position: 'relative', width: 88, height: 88 }}>
                <span style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: 'rgba(16,185,129,0.35)',
                  animation: 'callPing 1.4s ease-out infinite',
                }} />
                <div style={{
                  width: 88, height: 88, borderRadius: '50%',
                  background: 'linear-gradient(135deg,#10b981,#059669)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 0 0 rgba(16,185,129,0.6)',
                }}>
                  <PhoneIncoming style={{ width: 38, height: 38, color: 'white' }} />
                </div>
              </div>

              <div style={{ textAlign: 'center' }}>
                <p style={{ color: 'white', fontSize: 19, fontWeight: 700, margin: 0 }}>
                  {callPartnerName ?? 'Someone'} is calling…
                </p>
                <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 5 }}>Voice call</p>
              </div>

              <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
                {/* Decline */}
                <button
                  onClick={declineCall}
                  title="Decline"
                  style={{
                    width: 64, height: 64, borderRadius: '50%',
                    background: '#ef4444', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 16px rgba(239,68,68,0.4)',
                    transition: 'transform 0.15s, background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#dc2626')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#ef4444')}
                >
                  <PhoneOff style={{ width: 28, height: 28, color: 'white' }} />
                </button>

                {/* Accept */}
                <button
                  onClick={acceptCall}
                  title="Accept"
                  style={{
                    width: 64, height: 64, borderRadius: '50%',
                    background: '#10b981', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 16px rgba(16,185,129,0.4)',
                    transition: 'transform 0.15s, background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#059669')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#10b981')}
                >
                  <Phone style={{ width: 28, height: 28, color: 'white' }} />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Calling (outgoing, waiting for pickup) ──────────────────────── */}
      <AnimatePresence>
        {callStatus === 'calling' && (
          <motion.div
            key="outgoing-call"
            initial={{ opacity: 0, scale: 0.7, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.7, y: 20 }}
            style={{
              position: 'fixed',
              bottom: '2rem',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 99998,
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'rgba(10,15,26,0.97)',
              backdropFilter: 'blur(14px)',
              color: 'white',
              borderRadius: 999,
              padding: '12px 20px',
              boxShadow: '0 8px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.07)',
              fontFamily: 'Inter, system-ui, sans-serif',
              minWidth: 220,
            }}
          >
            {/* Pulsing phone icon */}
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg,#10b981,#059669)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'callPulse 1.5s ease infinite',
            }}>
              <Phone style={{ width: 18, height: 18, color: 'white' }} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                Calling {callPartnerName ?? '…'}
              </span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>Waiting for answer...</span>
            </div>

            {/* Cancel */}
            <button
              onClick={() => endCall(true)}
              title="Cancel call"
              style={{
                width: 36, height: 36, borderRadius: '50%',
                background: '#ef4444', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginLeft: 8,
                transition: 'background 0.2s',
              }}
            >
              <PhoneOff style={{ width: 16, height: 16, color: 'white' }} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Active call — draggable floating pill ───────────────────────── */}
      <AnimatePresence>
        {(callStatus === 'connected' || callStatus === 'reconnecting') && (
          <motion.div
            key="active-call"
            initial={{ opacity: 0, scale: 0.7, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.7, y: 20 }}
            onMouseDown={onDragStart}
            onTouchStart={onDragStart}
            style={{
              position: 'fixed',
              bottom: `calc(1.5rem - ${callBarPos.y}px)`,
              left: `calc(50% + ${callBarPos.x}px)`,
              transform: 'translateX(-50%)',
              zIndex: 99998,
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(10,15,26,0.97)',
              backdropFilter: 'blur(14px)',
              color: 'white',
              borderRadius: 999,
              padding: '10px 18px',
              boxShadow: '0 8px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.07)',
              cursor: dragStartRef.current ? 'grabbing' : 'grab',
              userSelect: 'none',
              touchAction: 'none',
              fontFamily: 'Inter, system-ui, sans-serif',
              minWidth: 200,
            }}
          >
            {/* Drag handle */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, opacity: 0.25, marginRight: 2, flexShrink: 0 }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 14, height: 1.5, background: 'white', borderRadius: 1 }} />)}
            </div>

            {/* Live indicator */}
            <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: callStatus === 'reconnecting' ? '#f59e0b' : '#10b981',
              boxShadow: callStatus === 'reconnecting' ? '0 0 6px #f59e0b' : '0 0 6px #10b981',
              animation: 'callPulse 2s ease infinite' }} />

            {/* Duration */}
            <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
              fontFamily: "'Courier New', monospace", minWidth: 36 }}>
              {fmt(callDuration)}
            </span>

            {/* Partner name or reconnecting label */}
            <span style={{ fontSize: 12, color: callStatus === 'reconnecting' ? '#f59e0b' : '#9ca3af', maxWidth: 120,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {callStatus === 'reconnecting' ? 'Reconnecting…' : callPartnerName}
            </span>

            <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.12)', flexShrink: 0 }} />

            {/* Mute */}
            <button
              onMouseDown={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              onClick={toggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
              style={{
                width: 34, height: 34, borderRadius: '50%', border: 'none', flexShrink: 0,
                background: isMuted ? '#ef4444' : 'rgba(255,255,255,0.1)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.2s',
              }}
            >
              {isMuted
                ? <MicOff style={{ width: 15, height: 15, color: 'white' }} />
                : <Mic    style={{ width: 15, height: 15, color: 'white' }} />}
            </button>

            {/* Speaker */}
            <button
              onMouseDown={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              onClick={toggleSpeaker}
              title={isSpeakerOn ? 'Speaker on' : 'Speaker off'}
              style={{
                width: 34, height: 34, borderRadius: '50%', border: 'none', flexShrink: 0,
                background: isSpeakerOn ? '#10b981' : 'rgba(255,255,255,0.1)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.2s',
              }}
            >
              {isSpeakerOn
                ? <Volume2  style={{ width: 15, height: 15, color: 'white' }} />
                : <VolumeX  style={{ width: 15, height: 15, color: 'white' }} />}
            </button>

            {/* End */}
            <button
              onMouseDown={e => e.stopPropagation()}
              onTouchStart={e => e.stopPropagation()}
              onClick={() => endCall(true)}
              title="End call"
              style={{
                width: 34, height: 34, borderRadius: '50%',
                background: '#ef4444', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, transition: 'background 0.2s',
              }}
            >
              <PhoneOff style={{ width: 15, height: 15, color: 'white' }} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Keyframes */}
      <style>{`
        @keyframes callPing {
          0%   { transform: scale(1);   opacity: 0.6; }
          80%  { transform: scale(2.2); opacity: 0;   }
          100% { transform: scale(2.2); opacity: 0;   }
        }
        @keyframes callPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
      `}
      </style>
    </>
  );
}
