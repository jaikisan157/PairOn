import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { Shield, Scale, Users } from 'lucide-react';

const safetyFeatures = [
  {
    icon: Shield,
    title: 'Report anytime',
    description: 'Easy reporting system to maintain a respectful community.',
    color: 'bg-red-50 dark:bg-red-900/20',
    iconColor: 'text-red-500',
  },
  {
    icon: Scale,
    title: 'Fair credit caps',
    description: 'Daily limits prevent abuse and ensure fair play.',
    color: 'bg-blue-50 dark:bg-blue-900/20',
    iconColor: 'text-blue-500',
  },
  {
    icon: Users,
    title: 'Active moderation',
    description: 'Our team reviews reports and takes action quickly.',
    color: 'bg-green-50 dark:bg-green-900/20',
    iconColor: 'text-green-500',
  },
];

export function SafetySection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section
      id="safety"
      className="relative py-20 lg:py-32 bg-pairon-bg dark:bg-gray-900"
    >
      {/* Subtle gradient background */}
      <div className="absolute inset-0 pairon-gradient-spotlight-left opacity-50 pointer-events-none" />

      <div className="relative w-full px-4 sm:px-6 lg:px-8 xl:px-12">
        <div ref={ref} className="max-w-4xl mx-auto">
          {/* Section Header */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <span className="pairon-eyebrow mb-4 block">Safety</span>
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Built for respect.
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Session timeouts, one-evaluation-per-match, and daily caps keep the system fair.
            </p>
          </motion.div>

          {/* Safety Cards */}
          <div className="grid sm:grid-cols-3 gap-6">
            {safetyFeatures.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className="bg-white dark:bg-gray-800 rounded-[22px] p-6 shadow-card hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 text-center"
              >
                {/* Icon */}
                <div
                  className={`w-14 h-14 rounded-2xl ${feature.color} flex items-center justify-center mx-auto mb-4`}
                >
                  <feature.icon className={`w-7 h-7 ${feature.iconColor}`} />
                </div>

                {/* Title */}
                <h3 className="font-display text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  {feature.title}
                </h3>

                {/* Description */}
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
