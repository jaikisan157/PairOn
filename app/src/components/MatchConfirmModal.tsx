import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, User2, ChevronDown, ChevronUp } from 'lucide-react';

interface MatchFoundData {
  pendingMatchId: string;
  partnerId: string;
  partnerName: string;
  partnerReputation: number;
  mode: 'sprint' | 'challenge' | 'build';
  projectIdea: {
    title: string;
    description: string;
    tasks?: { id: string; title: string }[];
  };
  expiresAt: number; // unix ms
}

interface MatchConfirmModalProps {
  data: MatchFoundData | null;
  onAccept: (pendingMatchId: string) => void;
  onDecline: (pendingMatchId: string) => void;
}

const MODE_LABELS: Record<string, { label: string; duration: string; color: string }> = {
  sprint:    { label: 'Sprint',    duration: '3 Hours',  color: '#10b981' },
  challenge: { label: 'Challenge', duration: '24 Hours', color: '#6366f1' },
  build:     { label: 'Build',     duration: '7 Days',   color: '#f59e0b' },
};

export function MatchConfirmModal({ data, onAccept, onDecline }: MatchConfirmModalProps) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [showTasks, setShowTasks] = useState(false);

  // Countdown timer
  useEffect(() => {
    if (!data) return;
    const tick = () => {
      const remaining = Math.max(0, Math.floor((data.expiresAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
    };
    tick();
    const interval = setInterval(tick, 500);
    return () => clearInterval(interval);
  }, [data]);

  // Auto-decline on timeout
  useEffect(() => {
    if (secondsLeft === 0 && data) {
      // Timer ran out — parent will handle the socket event
      // but let's close the modal after a moment
    }
  }, [secondsLeft, data]);

  const modeInfo = data ? MODE_LABELS[data.mode] : null;

  // Progress (0..1)
  const totalSeconds = data ? Math.floor((data.expiresAt - (Date.now() - secondsLeft * 1000)) / 1000) : 30;
  const progress = data ? secondsLeft / totalSeconds : 0;
  const circumference = 2 * Math.PI * 22; // radius 22

  return (
    <AnimatePresence>
      {data && (
        <motion.div
          key="match-confirm-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 99990,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
            padding: 16,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.85, opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            style={{
              background: 'linear-gradient(180deg, #16192a 0%, #0f1120 100%)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 24,
              padding: '32px 28px',
              width: '100%',
              maxWidth: 420,
              boxShadow: '0 32px 96px rgba(0,0,0,0.7)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Decorative glow */}
            <div style={{
              position: 'absolute', top: -60, right: -60,
              width: 180, height: 180, borderRadius: '50%',
              background: modeInfo ? `${modeInfo.color}22` : '#10b98122',
              filter: 'blur(40px)', pointerEvents: 'none',
            }} />

            {/* Header row — mode badge + countdown */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <span style={{
                background: modeInfo ? `${modeInfo.color}22` : '#10b98122',
                color: modeInfo?.color ?? '#10b981',
                border: `1px solid ${modeInfo ? modeInfo.color + '44' : '#10b98144'}`,
                borderRadius: 20, padding: '3px 12px', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.05em', textTransform: 'uppercase',
              }}>
                {modeInfo?.label} · {modeInfo?.duration}
              </span>

              {/* SVG countdown circle */}
              <div style={{ position: 'relative', width: 52, height: 52 }}>
                <svg width={52} height={52} style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx={26} cy={26} r={22} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={3} />
                  <circle
                    cx={26} cy={26} r={22} fill="none"
                    stroke={secondsLeft <= 5 ? '#ef4444' : (modeInfo?.color ?? '#10b981')}
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - Math.max(0, progress))}
                    style={{ transition: 'stroke-dashoffset 0.5s linear, stroke 0.3s' }}
                  />
                </svg>
                <span style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: secondsLeft <= 5 ? '#ef4444' : 'white',
                  fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                }}>
                  {secondsLeft}
                </span>
              </div>
            </div>

            {/* Match found title */}
            <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              🎯 Match Found
            </p>
            <h2 style={{ color: 'white', fontSize: 22, fontWeight: 800, margin: '0 0 20px' }}>
              You've been paired!
            </h2>

            {/* Partner info */}
            <div style={{
              background: 'rgba(255,255,255,0.05)', borderRadius: 14,
              padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
              marginBottom: 16, border: '1px solid rgba(255,255,255,0.07)',
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                background: `linear-gradient(135deg, ${modeInfo?.color ?? '#10b981'}, ${modeInfo?.color ?? '#10b981'}88)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <User2 style={{ width: 20, height: 20, color: 'white' }} />
              </div>
              <div>
                <p style={{ color: 'white', fontWeight: 700, fontSize: 15, margin: 0 }}>{data.partnerName}</p>
                <p style={{ color: '#9ca3af', fontSize: 12, margin: 0 }}>
                  ⭐ {data.partnerReputation ?? 0} reputation
                </p>
              </div>
            </div>

            {/* Project idea */}
            <div style={{
              background: 'rgba(255,255,255,0.04)', borderRadius: 14,
              padding: '14px 16px', marginBottom: 20,
              border: '1px solid rgba(255,255,255,0.07)',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: '#9ca3af', fontSize: 11, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Project Topic
                  </p>
                  <p style={{ color: 'white', fontWeight: 700, fontSize: 14, margin: '0 0 4px' }}>
                    {data.projectIdea?.title ?? 'Untitled Project'}
                  </p>
                  <p style={{ color: '#9ca3af', fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                    {data.projectIdea?.description ?? ''}
                  </p>
                </div>
              </div>

              {/* Tasks toggle */}
              {(data.projectIdea?.tasks?.length ?? 0) > 0 && (
                <button
                  onClick={() => setShowTasks(v => !v)}
                  style={{
                    marginTop: 10, background: 'none', border: 'none', cursor: 'pointer',
                    color: modeInfo?.color ?? '#10b981', fontSize: 12, fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: 4, padding: 0,
                  }}
                >
                  {showTasks ? <ChevronUp style={{ width: 14, height: 14 }} /> : <ChevronDown style={{ width: 14, height: 14 }} />}
                  {showTasks ? 'Hide tasks' : `View ${data.projectIdea.tasks!.length} tasks`}
                </button>
              )}
              <AnimatePresence>
                {showTasks && data.projectIdea?.tasks && (
                  <motion.ul
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', overflow: 'hidden' }}
                  >
                    {data.projectIdea.tasks.map((t) => (
                      <li key={t.id} style={{
                        color: '#d1d5db', fontSize: 12, padding: '3px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        <span style={{ color: modeInfo?.color ?? '#10b981', fontSize: 14 }}>›</span>
                        {t.title}
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>

            <p style={{ color: '#6b7280', fontSize: 12, textAlign: 'center', margin: '0 0 16px' }}>
              You can edit the project topic after connecting
            </p>

            {/* Accept / Decline */}
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => onDecline(data.pendingMatchId)}
                style={{
                  flex: 1, padding: '13px 0', borderRadius: 14, border: '1px solid rgba(239,68,68,0.3)',
                  background: 'rgba(239,68,68,0.1)', color: '#f87171', fontWeight: 700,
                  fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 6, transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.2)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; }}
              >
                <XCircle style={{ width: 16, height: 16 }} /> Decline
              </button>
              <button
                onClick={() => onAccept(data.pendingMatchId)}
                style={{
                  flex: 2, padding: '13px 0', borderRadius: 14, border: 'none',
                  background: `linear-gradient(135deg, ${modeInfo?.color ?? '#10b981'}, ${modeInfo?.color ?? '#059669'}cc)`,
                  color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  boxShadow: `0 4px 20px ${modeInfo ? modeInfo.color + '44' : '#10b98144'}`,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.9'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
              >
                <CheckCircle2 style={{ width: 16, height: 16 }} /> Accept & Connect
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export type { MatchFoundData };
