import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Coins, ArrowRight, Plus, Minus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CREDIT_COSTS } from '@/data/constants';

const earnActions = [
  'Complete a sprint',
  'Submit project link',
  'Great feedback',
];

const spendActions = [
  { label: 'Priority matching', cost: CREDIT_COSTS.priority_matching },
  { label: 'Profile boost', cost: CREDIT_COSTS.profile_boost },
  { label: 'Advanced ideas', cost: CREDIT_COSTS.unlock_ideas },
];

export function CreditSystemSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section className="relative py-20 lg:py-32 bg-pairon-bg dark:bg-gray-900 overflow-hidden">
      {/* Gradient Spotlight */}
      <div className="absolute inset-0 pairon-gradient-spotlight-left opacity-60 pointer-events-none" />

      <div className="relative w-full px-4 sm:px-6 lg:px-8 xl:px-12">
        <div ref={ref} className="max-w-6xl mx-auto">
          {/* Main Card */}
          <motion.div
            initial={{ opacity: 0, x: 60, scale: 0.96 }}
            animate={isInView ? { opacity: 1, x: 0, scale: 1 } : {}}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="bg-white dark:bg-gray-800 rounded-[28px] shadow-card border border-black/[0.06] overflow-hidden"
          >
            <div className="flex flex-col lg:flex-row">
              {/* Left Content */}
              <div className="flex-1 p-8 lg:p-12 xl:p-16">
                {/* Eyebrow */}
                <motion.span
                  initial={{ opacity: 0, y: 10 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.2, duration: 0.4 }}
                  className="pairon-eyebrow mb-4 block"
                >
                  Credit System
                </motion.span>

                {/* Headline */}
                <motion.h2
                  initial={{ opacity: 0, y: 24 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.1, duration: 0.5 }}
                  className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-6"
                >
                  Earn as you ship.
                </motion.h2>

                {/* Description */}
                <motion.p
                  initial={{ opacity: 0, y: 16 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.2, duration: 0.4 }}
                  className="text-lg text-gray-600 dark:text-gray-300 mb-8 max-w-md"
                >
                  Complete sessions, submit work, and receive positive feedback to grow your balance.
                </motion.p>

                {/* Earn vs Spend */}
                <motion.div
                  initial={{ opacity: 0, y: 18 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.3, duration: 0.4 }}
                  className="grid sm:grid-cols-2 gap-6 mb-8"
                >
                  {/* Earn Column */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <Plus className="w-4 h-4 text-pairon-accent" />
                      Earn credits
                    </h4>
                    <ul className="space-y-2">
                      {earnActions.map((action, index) => (
                        <motion.li
                          key={action}
                          initial={{ opacity: 0, x: -20 }}
                          animate={isInView ? { opacity: 1, x: 0 } : {}}
                          transition={{ delay: 0.35 + index * 0.06, duration: 0.3 }}
                          className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-pairon-accent" />
                          {action}
                        </motion.li>
                      ))}
                    </ul>
                  </div>

                  {/* Spend Column */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <Minus className="w-4 h-4 text-orange-500" />
                      Spend credits
                    </h4>
                    <ul className="space-y-2">
                      {spendActions.map((action, index) => (
                        <motion.li
                          key={action.label}
                          initial={{ opacity: 0, x: -20 }}
                          animate={isInView ? { opacity: 1, x: 0 } : {}}
                          transition={{ delay: 0.4 + index * 0.06, duration: 0.3 }}
                          className="text-sm text-gray-600 dark:text-gray-400 flex items-center justify-between"
                        >
                          <span className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                            {action.label}
                          </span>
                          <span className="text-xs font-medium text-orange-500">
                            {action.cost}
                          </span>
                        </motion.li>
                      ))}
                    </ul>
                  </div>
                </motion.div>

                {/* CTA */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.5, duration: 0.4 }}
                >
                  <Button className="pairon-btn-primary">
                    See rewards
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </Button>
                </motion.div>
              </div>

              {/* Right Image Panel */}
              <div className="hidden lg:block relative w-[45%] p-6">
                <motion.div
                  initial={{ opacity: 0, x: 40, scale: 0.985 }}
                  animate={isInView ? { opacity: 1, x: 0, scale: 1 } : {}}
                  transition={{ delay: 0.3, duration: 0.5 }}
                  className="relative h-full rounded-[22px] overflow-hidden"
                >
                  <img
                    src="https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=800&h=1000&fit=crop"
                    alt="Team celebration"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                </motion.div>

                {/* Floating Credits Badge */}
                <motion.div
                  initial={{ opacity: 0, y: 12, scale: 0.95 }}
                  animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
                  transition={{ delay: 0.6, duration: 0.4 }}
                  className="absolute bottom-12 left-8 bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-badge animate-float"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-pairon-accent-light dark:bg-pairon-accent/20 flex items-center justify-center">
                      <Coins className="w-5 h-5 text-pairon-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        Credits earned
                      </p>
                      <p className="text-lg font-bold text-pairon-accent">
                        +120
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
