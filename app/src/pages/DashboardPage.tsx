import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Zap,
  Coins,
  Star,
  Trophy,
  Target,
  Calendar,
  ArrowRight,
  LogOut,
  User,
  History,
  Sun,
  Moon,
  MessageCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useMatching } from '@/context/MatchingContext';
import { useTheme } from '@/context/ThemeContext';
import { MATCH_MODES } from '@/data/constants';
import { formatDuration } from '@/lib/utils';
import type { MatchMode } from '@/types';

const iconMap = {
  zap: Zap,
  target: Target,
  calendar: Calendar,
};

export function DashboardPage() {
  const [selectedMode, setSelectedMode] = useState<MatchMode | null>(null);
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { isSearching, searchMatch, currentMatch } = useMatching();
  const navigate = useNavigate();

  // Navigate to collaborate page when match is found
  useEffect(() => {
    if (currentMatch) {
      navigate('/collaborate');
    }
  }, [currentMatch, navigate]);

  const handleStartMatching = () => {
    if (!selectedMode) return;
    searchMatch(selectedMode);
  };

  const stats = [
    { label: 'Credits', value: user?.credits || 0, icon: Coins, color: 'text-pairon-accent' },
    { label: 'Reputation', value: user?.reputation || 0, icon: Star, color: 'text-yellow-500' },
    { label: 'Projects', value: user?.completedProjects || 0, icon: Trophy, color: 'text-purple-500' },
  ];

  return (
    <div className="min-h-screen bg-pairon-bg dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div
              onClick={() => navigate('/')}
              className="flex items-center gap-2 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-xl bg-pairon-accent flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <span className="font-display font-bold text-xl text-gray-900 dark:text-white">
                PairOn
              </span>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-pairon-accent-light dark:bg-pairon-accent/10 rounded-full">
                <Coins className="w-4 h-4 text-pairon-accent" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {user?.credits} credits
                </span>
              </div>
              <button
                onClick={() => navigate('/quick-connect')}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title="Quick Connect"
              >
                <MessageCircle className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <button
                onClick={toggleTheme}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                title={theme === 'light' ? 'Dark mode' : 'Light mode'}
              >
                {theme === 'light' ? (
                  <Moon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                ) : (
                  <Sun className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                )}
              </button>
              <button
                onClick={() => navigate('/profile')}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <User className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <button
                onClick={logout}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <LogOut className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Welcome */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h1 className="font-display text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Welcome back, {user?.name?.split(' ')[0]}!
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Ready to find your next collaborator?
            </p>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid sm:grid-cols-3 gap-4 mb-8"
          >
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-card"
              >
                <div className="flex items-center gap-3 mb-2">
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {stat.label}
                  </span>
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {stat.value}
                </p>
              </div>
            ))}
          </motion.div>

          {/* Match Modes */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-gray-800 rounded-[28px] shadow-card p-8 mb-8"
          >
            <h2 className="font-display text-xl font-semibold text-gray-900 dark:text-white mb-6">
              Choose your mode
            </h2>

            <div className="grid sm:grid-cols-3 gap-4 mb-6">
              {MATCH_MODES.map((mode) => {
                const Icon = iconMap[mode.icon as keyof typeof iconMap];
                const isSelected = selectedMode === mode.id;

                return (
                  <button
                    key={mode.id}
                    onClick={() => setSelectedMode(mode.id)}
                    className={`p-6 rounded-2xl border-2 text-left transition-all ${isSelected
                      ? 'border-pairon-accent bg-pairon-accent-light dark:bg-pairon-accent/10'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center mb-4 ${isSelected
                        ? 'bg-pairon-accent text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                        }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                      {mode.name}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                      {formatDuration(mode.duration)}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {mode.description}
                    </p>
                  </button>
                );
              })}
            </div>

            <Button
              onClick={handleStartMatching}
              disabled={!selectedMode || isSearching}
              className="w-full pairon-btn-primary py-4 h-auto text-base"
            >
              {isSearching ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Finding match...
                </>
              ) : (
                <>
                  Start matching
                  <ArrowRight className="ml-2 w-5 h-5" />
                </>
              )}
            </Button>
          </motion.div>

          {/* Recent Activity */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white dark:bg-gray-800 rounded-[28px] shadow-card p-8"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-xl font-semibold text-gray-900 dark:text-white">
                Recent sessions
              </h2>
              <button className="text-sm text-pairon-accent hover:underline flex items-center gap-1">
                View all
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="text-center py-8">
              <History className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400">
                No sessions yet. Start matching to build your first project!
              </p>
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
