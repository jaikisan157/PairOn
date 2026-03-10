import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Play, Clock, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import gsap from 'gsap';

export function HeroSection() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const cardRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // Auto-play entrance animation on load
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power2.out' as const } });

      // Card entrance
      tl.fromTo(
        cardRef.current,
        { opacity: 0, scale: 0.98, y: 24 },
        { opacity: 1, scale: 1, y: 0, duration: 0.8 }
      );

      // Headline words
      if (headlineRef.current) {
        const words = headlineRef.current.querySelectorAll('.word');
        tl.fromTo(
          words,
          { opacity: 0, y: 28 },
          { opacity: 1, y: 0, duration: 0.5, stagger: 0.04 },
          '-=0.4'
        );
      }
    });

    return () => ctx.revert();
  }, []);

  const handleStartMatching = () => {
    if (isAuthenticated) {
      navigate('/dashboard');
    } else {
      navigate('/register');
    }
  };

  return (
    <section className="relative min-h-screen w-full flex items-center justify-center overflow-hidden bg-pairon-bg dark:bg-gray-900 pt-24 pb-20">
      {/* Gradient Spotlight */}
      <div className="absolute inset-0 pairon-gradient-spotlight pointer-events-none" />

      {/* Main Card */}
      <motion.div
        ref={cardRef}
        className="relative w-[86vw] max-w-[1180px] min-h-[72vh] bg-white dark:bg-gray-800 rounded-[28px] shadow-card border border-black/[0.06] overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="flex flex-col lg:flex-row h-full">
          {/* Left Content */}
          <div className="flex-1 p-8 lg:p-12 xl:p-16 flex flex-col justify-center">
            {/* Eyebrow */}
            <motion.span
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              className="pairon-eyebrow mb-4"
            >
              Collaborate in Micro-Sprints
            </motion.span>

            {/* Headline */}
            <h1
              ref={headlineRef}
              className="font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-gray-900 dark:text-white mb-6"
            >
              <span className="word inline-block">Match.</span>{' '}
              <span className="word inline-block">Build.</span>{' '}
              <span className="word inline-block text-pairon-accent">Earn.</span>
            </h1>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45, duration: 0.4 }}
              className="text-lg lg:text-xl text-gray-600 dark:text-gray-300 mb-8 max-w-md"
            >
              PairOn pairs you with a collaborator for timed challenges. Chat, plan, ship—and earn reputation.
            </motion.p>

            {/* CTA Row */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6, duration: 0.4 }}
              className="flex flex-wrap gap-4 mb-6"
            >
              <Button
                onClick={handleStartMatching}
                className="pairon-btn-primary text-base px-8 py-4 h-auto"
              >
                Start matching
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
              <Button
                variant="outline"
                className="pairon-btn-secondary text-base px-8 py-4 h-auto"
                onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
              >
                <Play className="mr-2 w-5 h-5" />
                See how it works
              </Button>
            </motion.div>

            {/* Micro Note */}
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.75, duration: 0.4 }}
              className="text-sm text-gray-500 dark:text-gray-400"
            >
              Free to start · No credit card required
            </motion.p>
          </div>

          {/* Right Image Panel */}
          <div className="hidden lg:block relative w-[41%] p-6 pb-10">
            <motion.div
              initial={{ opacity: 0, x: 60, scale: 0.985 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ delay: 0.25, duration: 0.6, ease: [0.33, 1, 0.68, 1] }}
              className="relative h-full rounded-[22px] overflow-hidden"
            >
              <img
                src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&h=1000&fit=crop"
                alt="Collaboration"
                className="w-full h-full object-cover"
              />
              {/* Overlay gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
            </motion.div>

            {/* Floating Badge */}
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.75, duration: 0.4 }}
              className="absolute bottom-12 left-8 bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-badge animate-float"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-pairon-accent-light dark:bg-pairon-accent/20 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-pairon-accent" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    You matched with Alex
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Product · 48 min
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Feature Pills */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.4 }}
        className="mt-6 hidden lg:flex items-center justify-center gap-6"
      >
        {[
          'Real-time matching',
          'Built-in workspace',
          'Earn credits',
        ].map((feature) => (
          <div
            key={feature}
            className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"
          >
            <CheckCircle className="w-4 h-4 text-pairon-accent" />
            {feature}
          </div>
        ))}
      </motion.div>
    </section>
  );
}
