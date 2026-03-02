import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Star, ThumbsUp, Award, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ratingOptions = [
  { label: 'Helpful', icon: ThumbsUp, color: 'bg-yellow-100 text-yellow-600' },
  { label: 'Very helpful', icon: Star, color: 'bg-blue-100 text-blue-600' },
  { label: 'Exceptional', icon: Award, color: 'bg-purple-100 text-purple-600' },
];

export function ReputationSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section className="relative py-20 lg:py-32 bg-pairon-bg dark:bg-gray-900">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 pairon-gradient-spotlight opacity-50 pointer-events-none" />

      <div className="relative w-full px-4 sm:px-6 lg:px-8 xl:px-12">
        <div ref={ref} className="max-w-6xl mx-auto">
          {/* Section Header */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <span className="pairon-eyebrow mb-4 block">Reputation</span>
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white">
              Build trust with every match.
            </h2>
          </motion.div>

          {/* Two Cards */}
          <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
            {/* Rate Your Partner Card */}
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.98 }}
              animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="bg-white dark:bg-gray-800 rounded-[22px] p-8 shadow-card hover:shadow-card-hover transition-shadow"
            >
              <h3 className="font-display text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Rate your partner
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                After each session, share how it went. Ratings keep the community helpful.
              </p>

              {/* Rating Options */}
              <div className="space-y-3">
                {ratingOptions.map((option, index) => (
                  <motion.div
                    key={option.label}
                    initial={{ opacity: 0, x: -20 }}
                    animate={isInView ? { opacity: 1, x: 0 } : {}}
                    transition={{ delay: 0.2 + index * 0.08, duration: 0.3 }}
                    className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                  >
                    <div className={`w-10 h-10 rounded-lg ${option.color} flex items-center justify-center`}>
                      <option.icon className="w-5 h-5" />
                    </div>
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {option.label}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Your Reputation Card */}
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.98 }}
              animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-white dark:bg-gray-800 rounded-[22px] p-8 shadow-card hover:shadow-card-hover transition-shadow"
            >
              <h3 className="font-display text-xl font-semibold text-gray-900 dark:text-white mb-3">
                Your reputation
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Higher reputation improves your match priority and unlocks badges.
              </p>

              {/* Reputation Stats */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-2xl bg-pairon-accent-light dark:bg-pairon-accent/20 flex items-center justify-center">
                  <TrendingUp className="w-8 h-8 text-pairon-accent" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-gray-900 dark:text-white">
                    4.7
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Average rating
                  </p>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                {[
                  { label: 'Sessions', value: '12' },
                  { label: 'Ratings', value: '28' },
                  { label: 'Badges', value: '5' },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="text-center p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50"
                  >
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {stat.value}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>

              <Button variant="outline" className="w-full">
                View profile
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
