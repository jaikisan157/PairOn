import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Sparkles, Lock, Zap, Gift, BarChart2, ShieldCheck, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';

const upcomingFeatures = [
  { icon: Zap, title: 'Earn Credits', desc: 'Complete collaborations, submit projects and earn credits that unlock rewards.' },
  { icon: Gift, title: 'Redeem Rewards', desc: 'Trade credits for premium features, extended sessions, and priority matching.' },
  { icon: BarChart2, title: 'Credit Leaderboard', desc: 'See how you rank against other builders. Compete, collaborate, and climb.' },
  { icon: ShieldCheck, title: 'Trust Bonuses', desc: 'Higher reputation earns passive credit bonuses every week.' },
  { icon: Clock, title: 'Streak Rewards', desc: 'Daily collaboration streaks multiply your credit earnings.' },
  { icon: Sparkles, title: 'Achievements', desc: 'Unlock rare badges and credit packages by hitting milestones.' },
];

export function CreditsPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-pairon-bg dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200 dark:border-white/5 px-6 py-4 flex items-center gap-4 bg-white dark:bg-gray-900">
        <button
          onClick={() => navigate('/dashboard')}
          className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-500 dark:text-gray-400" />
        </button>
        <div>
          <h1 className="font-bold text-gray-900 dark:text-white text-lg">Credits & Rewards</h1>
          <p className="text-xs text-pairon-accent">Coming soon</p>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16 max-w-2xl"
        >
          {/* Animated lock orb */}
          <div className="relative w-24 h-24 mx-auto mb-8">
            <div className="absolute inset-0 rounded-full bg-pairon-accent/20 animate-ping" />
            <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-pairon-accent/30 to-emerald-500/30 border border-pairon-accent/40 flex items-center justify-center backdrop-blur dark:from-pairon-accent/20 dark:to-emerald-600/20">
              <Lock className="w-10 h-10 text-pairon-accent" />
            </div>
          </div>

          <span className="inline-block bg-pairon-accent/10 border border-pairon-accent/20 text-pairon-accent text-xs font-semibold px-4 py-1.5 rounded-full mb-4 uppercase tracking-widest">
            Upcoming Feature
          </span>
          <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4 leading-tight">
            A whole rewards ecosystem<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-pairon-accent to-emerald-500">is on its way.</span>
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-lg leading-relaxed">
            We're building a full credit & rewards system to make every collaboration count. Earn credits, unlock perks, and climb the leaderboard — stay tuned.
          </p>
        </motion.div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-4xl mb-12">
          {upcomingFeatures.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.08 }}
              className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/8 rounded-2xl p-6 backdrop-blur-sm relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-pairon-accent/5 to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="w-10 h-10 rounded-xl bg-pairon-accent/15 flex items-center justify-center mb-4">
                <f.icon className="w-5 h-5 text-pairon-accent" />
              </div>
              <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{f.title}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">{f.desc}</p>
              <div className="absolute top-3 right-3">
                <span className="text-[10px] bg-amber-50 dark:bg-yellow-500/10 text-amber-600 dark:text-yellow-400 border border-amber-200 dark:border-yellow-500/20 px-2 py-0.5 rounded-full font-medium">Soon</span>
              </div>
            </motion.div>
          ))}
        </div>

        <Button
          onClick={() => navigate('/dashboard')}
          className="pairon-btn-primary rounded-xl px-8"
        >
          Back to Dashboard
        </Button>
      </main>
    </div>
  );
}
