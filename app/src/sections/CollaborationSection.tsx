import { useRef, useState } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import { MessageSquare, Layout, Link2, CheckCircle, ArrowRight, X, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

const features = [
  { icon: MessageSquare, label: 'Real-time chat' },
  { icon: Layout, label: 'Mini Kanban' },
  { icon: Link2, label: 'Submit via link' },
];

// ── Demo workspace data ─────────────────────────────────────────────────────
const DEMO_MESSAGES = [
  { id: 1, sender: 'Alex', self: false, text: 'Hey! Should we start with the landing page or the API?', time: '2:01 PM' },
  { id: 2, sender: 'You', self: true, text: 'Let\'s do landing page first — I can handle the hero section.', time: '2:02 PM' },
  { id: 3, sender: 'Alex', self: false, text: 'Perfect 👌 I\'ll set up the nav and footer.', time: '2:03 PM' },
  { id: 4, sender: 'You', self: true, text: 'Done! Hero is pushed. Check the PR when you can.', time: '2:31 PM' },
  { id: 5, sender: 'Alex', self: false, text: 'Looks great! Merging now 🚀', time: '2:33 PM' },
];
const DEMO_TASKS = [
  { id: 1, label: 'Design hero section', done: true },
  { id: 2, label: 'Build navigation', done: true },
  { id: 3, label: 'Write API endpoints', done: false },
  { id: 4, label: 'Connect frontend to backend', done: false },
  { id: 5, label: 'Deploy to Vercel', done: false },
];
const DEMO_TABS = ['Chat', 'Tasks', 'Submit'];

function WorkspaceDemoModal({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState('Chat');

  return (
    <motion.div
      key="ws-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 99990,
        background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 24 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 640, background: '#111827',
          borderRadius: 20, overflow: 'hidden',
          boxShadow: '0 32px 100px rgba(0,0,0,0.8)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* Title bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)',
          background: '#0f1623',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, background: '#10b98120',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Layout style={{ width: 16, height: 16, color: '#10b981' }} />
            </div>
            <div>
              <p style={{ color: 'white', fontWeight: 700, fontSize: 13, margin: 0 }}>Workspace — Sprint Mode</p>
              <p style={{ color: '#6b7280', fontSize: 11, margin: 0 }}>🔴 Demo — read-only preview</p>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8,
            width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#9ca3af',
          }}>
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 4, padding: '10px 16px 0',
          background: '#0f1623', borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          {DEMO_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 14px', borderRadius: '8px 8px 0 0', fontSize: 13,
                fontWeight: activeTab === tab ? 700 : 400,
                color: activeTab === tab ? '#10b981' : '#6b7280',
                borderBottom: activeTab === tab ? '2px solid #10b981' : '2px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ height: 380, overflow: 'hidden', background: '#111827' }}>
          {/* Chat tab */}
          {activeTab === 'Chat' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {DEMO_MESSAGES.map(msg => (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: msg.self ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '72%', padding: '10px 14px', borderRadius: msg.self ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                      background: msg.self ? '#10b981' : '#1f2937',
                      color: msg.self ? 'white' : '#e5e7eb', fontSize: 13, lineHeight: 1.5,
                    }}>
                      {!msg.self && <p style={{ color: '#10b981', fontSize: 11, fontWeight: 700, margin: '0 0 4px' }}>{msg.sender}</p>}
                      <p style={{ margin: 0 }}>{msg.text}</p>
                      <p style={{ color: msg.self ? 'rgba(255,255,255,0.6)' : '#6b7280', fontSize: 10, margin: '4px 0 0', textAlign: 'right' }}>{msg.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              {/* Fake input */}
              <div style={{
                padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.07)',
                display: 'flex', gap: 10, alignItems: 'center',
              }}>
                <div style={{
                  flex: 1, background: '#1f2937', borderRadius: 24, padding: '10px 16px',
                  color: '#4b5563', fontSize: 13,
                }}>Type a message… (demo)</div>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', background: '#10b981',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.4,
                }}>
                  <Send style={{ width: 15, height: 15, color: 'white' }} />
                </div>
              </div>
            </div>
          )}

          {/* Tasks tab */}
          {activeTab === 'Tasks' && (
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Sprint Tasks</p>
              {DEMO_TASKS.map(task => (
                <div key={task.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 14px', borderRadius: 12,
                  background: '#1f2937', opacity: task.done ? 0.6 : 1,
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                    background: task.done ? '#10b981' : 'transparent',
                    border: task.done ? 'none' : '2px solid #374151',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {task.done && <CheckCircle style={{ width: 14, height: 14, color: 'white' }} />}
                  </div>
                  <span style={{
                    color: task.done ? '#6b7280' : '#e5e7eb', fontSize: 13,
                    textDecoration: task.done ? 'line-through' : 'none',
                  }}>{task.label}</span>
                  {!task.done && (
                    <span style={{
                      marginLeft: 'auto', fontSize: 11, color: '#f59e0b',
                      background: '#f59e0b20', padding: '2px 8px', borderRadius: 20,
                    }}>In progress</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Submit tab */}
          {activeTab === 'Submit' && (
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16, background: '#10b98120',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Link2 style={{ width: 28, height: 28, color: '#10b981' }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: 'white', fontWeight: 700, fontSize: 16, margin: '0 0 6px' }}>Submit your work</p>
                <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>Paste a GitHub link, Figma URL, or live site before time runs out.</p>
              </div>
              <div style={{
                width: '100%', maxWidth: 380, background: '#1f2937',
                borderRadius: 12, padding: '12px 16px',
                color: '#4b5563', fontSize: 13, border: '1px solid #374151',
              }}>https://github.com/… (demo)</div>
              <div style={{
                padding: '11px 28px', borderRadius: 12, background: '#10b981',
                color: 'white', fontSize: 14, fontWeight: 700, opacity: 0.5,
              }}>Submit →</div>
            </div>
          )}
        </div>

        {/* Demo notice */}
        <div style={{
          padding: '10px 20px', background: '#0f1623', borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <p style={{ color: '#6b7280', fontSize: 12, margin: 0 }}>
            👆 This is a read-only preview. Sign up to use the real workspace.
          </p>
          <button onClick={onClose} style={{
            background: '#10b981', border: 'none', borderRadius: 8,
            padding: '6px 14px', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>Sign up free</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function CollaborationSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  const [showDemo, setShowDemo] = useState(false);

  return (
    <section className="relative py-20 lg:py-32 bg-pairon-bg dark:bg-gray-900 overflow-hidden">
      {/* Gradient Spotlight */}
      <div className="absolute inset-0 pairon-gradient-spotlight opacity-60 pointer-events-none" />

      <div className="relative w-full px-4 sm:px-6 lg:px-8 xl:px-12">
        <div ref={ref} className="max-w-6xl mx-auto">
          {/* Main Card */}
          <motion.div
            initial={{ opacity: 0, x: -60, scale: 0.96 }}
            animate={isInView ? { opacity: 1, x: 0, scale: 1 } : {}}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="bg-white dark:bg-gray-800 rounded-[28px] shadow-card border border-black/[0.06] overflow-hidden"
          >
            <div className="flex flex-col lg:flex-row-reverse">
              {/* Right Content (on desktop) */}
              <div className="flex-1 p-8 lg:p-12 xl:p-16">
                {/* Eyebrow */}
                <motion.span
                  initial={{ opacity: 0, y: 10 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.2, duration: 0.4 }}
                  className="pairon-eyebrow mb-4 block"
                >
                  Collaboration
                </motion.span>

                {/* Headline */}
                <motion.h2
                  initial={{ opacity: 0, y: 24 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.1, duration: 0.5 }}
                  className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-6"
                >
                  A shared workspace.
                </motion.h2>

                {/* Description */}
                <motion.p
                  initial={{ opacity: 0, y: 16 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.2, duration: 0.4 }}
                  className="text-lg text-gray-600 dark:text-gray-300 mb-8 max-w-md"
                >
                  Chat in real time, keep tasks on a mini board, and submit your work when time's up.
                </motion.p>

                {/* Feature Bullets */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.3, duration: 0.4 }}
                  className="space-y-3 mb-8"
                >
                  {features.map((feature, index) => (
                    <motion.div
                      key={feature.label}
                      initial={{ opacity: 0, x: -30 }}
                      animate={isInView ? { opacity: 1, x: 0 } : {}}
                      transition={{ delay: 0.35 + index * 0.08, duration: 0.3 }}
                      className="flex items-center gap-3"
                    >
                      <div className="w-8 h-8 rounded-lg bg-pairon-accent-light dark:bg-pairon-accent/20 flex items-center justify-center">
                        <feature.icon className="w-4 h-4 text-pairon-accent" />
                      </div>
                      <span className="text-gray-700 dark:text-gray-300 font-medium">
                        {feature.label}
                      </span>
                    </motion.div>
                  ))}
                </motion.div>

                {/* CTA */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.5, duration: 0.4 }}
                >
                  <Button className="pairon-btn-primary" onClick={() => setShowDemo(true)}>
                    Preview the workspace
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </motion.div>
              </div>

              {/* Left Image Panel (on desktop) */}
              <div className="hidden lg:block relative w-[45%] p-6">
                <motion.div
                  initial={{ opacity: 0, x: -40, scale: 0.985 }}
                  animate={isInView ? { opacity: 1, x: 0, scale: 1 } : {}}
                  transition={{ delay: 0.3, duration: 0.5 }}
                  className="relative h-full rounded-[22px] overflow-hidden"
                >
                  <img
                    src="https://images.unsplash.com/photo-1531498860502-7c67cf02f657?w=800&h=1000&fit=crop"
                    alt="Collaboration workspace"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                </motion.div>

                {/* Floating Task Card */}
                <motion.div
                  initial={{ opacity: 0, y: 14, scale: 0.95 }}
                  animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
                  transition={{ delay: 0.6, duration: 0.4 }}
                  className="absolute bottom-12 right-8 bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-badge animate-float"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded border-2 border-pairon-accent flex items-center justify-center mt-0.5">
                      <CheckCircle className="w-3 h-3 text-pairon-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        Write a one-pager
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Today
                      </p>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Workspace Demo Modal */}
      <AnimatePresence>
        {showDemo && <WorkspaceDemoModal onClose={() => setShowDemo(false)} />}
      </AnimatePresence>
    </section>
  );
}
