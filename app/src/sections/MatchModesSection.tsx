import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Zap, Target, Calendar, Clock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MATCH_MODES } from '@/data/constants';
import { formatDuration } from '@/lib/utils';

const iconMap = {
  zap: Zap,
  target: Target,
  calendar: Calendar,
};

export function MatchModesSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section
      id="modes"
      className="relative py-20 lg:py-32 bg-pairon-bg dark:bg-gray-900 overflow-hidden"
    >
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
                  Match Modes
                </motion.span>

                {/* Headline */}
                <motion.h2
                  initial={{ opacity: 0, y: 24 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.1, duration: 0.5 }}
                  className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-6"
                >
                  Pick your pace.
                </motion.h2>

                {/* Description */}
                <motion.p
                  initial={{ opacity: 0, y: 16 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.2, duration: 0.4 }}
                  className="text-lg text-gray-600 dark:text-gray-300 mb-8 max-w-md"
                >
                  From a focused evening sprint to a full-week build. Choose a mode that fits your calendar.
                </motion.p>

                {/* Mode Chips */}
                <motion.div
                  initial={{ opacity: 0, y: 18 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.3, duration: 0.4 }}
                  className="flex flex-wrap gap-3 mb-8"
                >
                  {MATCH_MODES.map((mode, index) => {
                    const Icon = iconMap[mode.icon as keyof typeof iconMap];
                    return (
                      <motion.div
                        key={mode.id}
                        initial={{ opacity: 0, y: 18, scale: 0.98 }}
                        animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
                        transition={{ delay: 0.35 + index * 0.06, duration: 0.3 }}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-full text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-pairon-accent-light dark:hover:bg-pairon-accent/20 hover:text-pairon-accent transition-colors cursor-default"
                      >
                        <Icon className="w-4 h-4" />
                        {mode.name}
                      </motion.div>
                    );
                  })}
                </motion.div>

                {/* CTA */}
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.5, duration: 0.4 }}
                >
                  <Button className="pairon-btn-primary">
                    Set your schedule
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
                    src="https://images.unsplash.com/photo-1551434678-e076c223a692?w=800&h=1000&fit=crop"
                    alt="Focus work"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                </motion.div>

                {/* Floating Timer Badge */}
                <motion.div
                  initial={{ opacity: 0, y: 12, scale: 0.95 }}
                  animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
                  transition={{ delay: 0.6, duration: 0.4 }}
                  className="absolute bottom-12 left-8 bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-badge animate-float"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-pairon-accent-light dark:bg-pairon-accent/20 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-pairon-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        Session ends in
                      </p>
                      <p className="text-lg font-bold text-pairon-accent">
                        24:00
                      </p>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          </motion.div>

          {/* Mode Cards Below */}
          <div className="grid md:grid-cols-3 gap-6 mt-8">
            {MATCH_MODES.map((mode, index) => {
              const Icon = iconMap[mode.icon as keyof typeof iconMap];
              return (
                <motion.div
                  key={mode.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.5 + index * 0.1, duration: 0.4 }}
                  className="bg-white dark:bg-gray-800 rounded-[22px] p-6 shadow-card hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-pairon-accent-light dark:bg-pairon-accent/20 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-pairon-accent" />
                    </div>
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {formatDuration(mode.duration)}
                    </span>
                  </div>
                  <h3 className="font-display text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    {mode.name}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {mode.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
