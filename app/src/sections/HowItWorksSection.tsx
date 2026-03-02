import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { UserPlus, Users, Trophy } from 'lucide-react';

const steps = [
  {
    icon: UserPlus,
    title: 'Create your profile',
    description: 'Add skills, interests, and availability. The more complete your profile, the better your matches.',
    color: 'bg-blue-50 dark:bg-blue-900/20',
    iconColor: 'text-blue-500',
  },
  {
    icon: Users,
    title: 'Get matched',
    description: 'We pair you based on complementary skills, shared interests, and reputation scores.',
    color: 'bg-pairon-accent-light dark:bg-pairon-accent/20',
    iconColor: 'text-pairon-accent',
  },
  {
    icon: Trophy,
    title: 'Collaborate & earn',
    description: 'Chat, plan, submit your work—and collect credits to unlock premium features.',
    color: 'bg-purple-50 dark:bg-purple-900/20',
    iconColor: 'text-purple-500',
  },
];

export function HowItWorksSection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });

  return (
    <section
      id="how-it-works"
      className="relative py-20 lg:py-32 bg-pairon-bg dark:bg-gray-900"
    >
      {/* Subtle gradient background */}
      <div className="absolute inset-0 pairon-gradient-spotlight-left opacity-50 pointer-events-none" />

      <div className="relative w-full px-4 sm:px-6 lg:px-8 xl:px-12">
        <div className="max-w-6xl mx-auto">
          {/* Section Header */}
          <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 24 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <span className="pairon-eyebrow mb-4 block">How It Works</span>
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white">
              Three steps to your first sprint
            </h2>
          </motion.div>

          {/* Steps Grid */}
          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            {steps.map((step, index) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 40, scale: 0.98 }}
                animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
                transition={{
                  duration: 0.5,
                  delay: index * 0.12,
                  ease: 'easeOut',
                }}
                className="group"
              >
                <div className="bg-white dark:bg-gray-800 rounded-[22px] p-8 shadow-card hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300 h-full">
                  {/* Icon */}
                  <div
                    className={`w-14 h-14 rounded-2xl ${step.color} flex items-center justify-center mb-6 group-hover:scale-105 transition-transform`}
                  >
                    <step.icon className={`w-7 h-7 ${step.iconColor}`} />
                  </div>

                  {/* Step Number */}
                  <span className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-2 block">
                    Step {index + 1}
                  </span>

                  {/* Title */}
                  <h3 className="font-display text-xl font-semibold text-gray-900 dark:text-white mb-3">
                    {step.title}
                  </h3>

                  {/* Description */}
                  <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
