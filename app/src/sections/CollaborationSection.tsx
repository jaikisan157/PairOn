import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { MessageSquare, Layout, Link2, CheckCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

const features = [
  { icon: MessageSquare, label: 'Real-time chat' },
  { icon: Layout, label: 'Mini Kanban' },
  { icon: Link2, label: 'Submit via link' },
];

export function CollaborationSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

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
                  <Button className="pairon-btn-primary">
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
    </section>
  );
}
