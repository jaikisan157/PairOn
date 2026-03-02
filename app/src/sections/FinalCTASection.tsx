import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';

export function FinalCTASection() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const handleStartMatching = () => {
    if (isAuthenticated) {
      navigate('/dashboard');
    } else {
      navigate('/register');
    }
  };

  return (
    <section className="relative py-20 lg:py-32 bg-pairon-bg dark:bg-gray-900">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 pairon-gradient-spotlight-left opacity-60 pointer-events-none" />

      <div className="relative w-full px-4 sm:px-6 lg:px-8 xl:px-12">
        <div ref={ref} className="max-w-4xl mx-auto">
          {/* CTA Card */}
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
            transition={{ duration: 0.5 }}
            className="bg-white dark:bg-gray-800 rounded-[28px] p-8 lg:p-16 shadow-card text-center"
          >
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Ready to build together?
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 max-w-xl mx-auto">
              Create your profile, pick a mode, and meet your next collaborator.
            </p>

            <div className="flex flex-wrap justify-center gap-4">
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
                onClick={() => window.open('mailto:support@pairon.app')}
              >
                <Mail className="mr-2 w-5 h-5" />
                Contact support
              </Button>
            </div>
          </motion.div>

          {/* Footer */}
          <motion.footer
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-16 pt-8 border-t border-gray-200 dark:border-gray-800"
          >
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              {/* Copyright */}
              <p className="text-sm text-gray-500 dark:text-gray-400">
                © {new Date().getFullYear()} PairOn. All rights reserved.
              </p>

              {/* Links */}
              <div className="flex items-center gap-6">
                {['Privacy', 'Terms', 'Support'].map((link) => (
                  <a
                    key={link}
                    href="#"
                    className="text-sm text-gray-500 dark:text-gray-400 hover:text-pairon-accent transition-colors"
                  >
                    {link}
                  </a>
                ))}
              </div>
            </div>
          </motion.footer>
        </div>
      </div>
    </section>
  );
}
