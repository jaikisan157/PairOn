import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Users,
  Activity,
  AlertTriangle,
  Ban,
  Settings,
  TrendingUp,
  Clock,
  Shield,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Mock admin data
const MOCK_STATS = {
  activeSessions: 24,
  totalUsers: 1247,
  matchesToday: 156,
  reportedUsers: 3,
};

const MOCK_ACTIVE_SESSIONS = [
  { id: '1', users: ['Alex', 'Sarah'], mode: '3-hour sprint', startedAt: '2:30 PM', duration: '45 min' },
  { id: '2', users: ['Mike', 'Emma'], mode: '48-hour challenge', startedAt: '10:00 AM', duration: '4 hours' },
  { id: '3', users: ['John', 'Lisa'], mode: '7-day build', startedAt: 'Yesterday', duration: '1 day' },
];

const MOCK_REPORTS = [
  { id: '1', reporter: 'User123', reported: 'BadActor', reason: 'Inappropriate behavior', status: 'pending' },
  { id: '2', reporter: 'DevJoe', reported: 'Spammer99', reason: 'Spam messages', status: 'pending' },
];

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'sessions' | 'reports' | 'settings'>('overview');
  const [searchQuery, setSearchQuery] = useState('');

  const stats = [
    { label: 'Active Sessions', value: MOCK_STATS.activeSessions, icon: Activity, color: 'bg-green-100 text-green-600' },
    { label: 'Total Users', value: MOCK_STATS.totalUsers, icon: Users, color: 'bg-blue-100 text-blue-600' },
    { label: 'Matches Today', value: MOCK_STATS.matchesToday, icon: TrendingUp, color: 'bg-purple-100 text-purple-600' },
    { label: 'Reports', value: MOCK_STATS.reportedUsers, icon: AlertTriangle, color: 'bg-red-100 text-red-600' },
  ];

  return (
    <div className="min-h-screen bg-pairon-bg dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              </button>
              <div className="flex items-center gap-2">
                <Shield className="w-6 h-6 text-pairon-accent" />
                <h1 className="font-display font-semibold text-xl text-gray-900 dark:text-white">
                  Admin Dashboard
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search users..."
                  className="pl-9 w-64 rounded-full"
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1">
            {[
              { id: 'overview', label: 'Overview', icon: Activity },
              { id: 'sessions', label: 'Sessions', icon: Clock },
              { id: 'reports', label: 'Reports', icon: AlertTriangle },
              { id: 'settings', label: 'Settings', icon: Settings },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-pairon-accent text-pairon-accent'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-6xl mx-auto">
          {activeTab === 'overview' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {/* Stats Grid */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-card"
                  >
                    <div className={`w-12 h-12 rounded-xl ${stat.color} flex items-center justify-center mb-4`}>
                      <stat.icon className="w-6 h-6" />
                    </div>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white mb-1">
                      {stat.value}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>

              {/* Quick Actions */}
              <div className="bg-white dark:bg-gray-800 rounded-[28px] shadow-card p-8">
                <h2 className="font-display text-xl font-semibold text-gray-900 dark:text-white mb-6">
                  Quick Actions
                </h2>
                <div className="grid sm:grid-cols-3 gap-4">
                  <Button
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2"
                    onClick={() => setActiveTab('sessions')}
                  >
                    <Clock className="w-6 h-6" />
                    <span>View Active Sessions</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2"
                    onClick={() => setActiveTab('reports')}
                  >
                    <AlertTriangle className="w-6 h-6" />
                    <span>Review Reports</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-auto py-4 flex flex-col items-center gap-2"
                    onClick={() => setActiveTab('settings')}
                  >
                    <Settings className="w-6 h-6" />
                    <span>Adjust Settings</span>
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'sessions' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-gray-800 rounded-[28px] shadow-card p-8"
            >
              <h2 className="font-display text-xl font-semibold text-gray-900 dark:text-white mb-6">
                Active Sessions ({MOCK_ACTIVE_SESSIONS.length})
              </h2>
              <div className="space-y-4">
                {MOCK_ACTIVE_SESSIONS.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl"
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {session.users.join(' + ')}
                      </p>
                      <p className="text-sm text-gray-500">
                        {session.mode} · Started {session.startedAt}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-gray-500">
                        {session.duration}
                      </span>
                      <Button variant="outline" size="sm">
                        Monitor
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'reports' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-gray-800 rounded-[28px] shadow-card p-8"
            >
              <h2 className="font-display text-xl font-semibold text-gray-900 dark:text-white mb-6">
                User Reports ({MOCK_REPORTS.length})
              </h2>
              <div className="space-y-4">
                {MOCK_REPORTS.map((report) => (
                  <div
                    key={report.id}
                    className="flex items-center justify-between p-4 bg-red-50 dark:bg-red-900/10 rounded-xl"
                  >
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {report.reported} reported by {report.reporter}
                      </p>
                      <p className="text-sm text-gray-500">
                        Reason: {report.reason}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                      >
                        <Ban className="w-4 h-4 mr-1" />
                        Ban
                      </Button>
                      <Button variant="outline" size="sm">
                        Dismiss
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white dark:bg-gray-800 rounded-[28px] shadow-card p-8"
            >
              <h2 className="font-display text-xl font-semibold text-gray-900 dark:text-white mb-6">
                Credit System Settings
              </h2>
              <div className="space-y-6">
                {[
                  { label: 'Session completion reward', value: 50, unit: 'credits' },
                  { label: 'Submission reward', value: 30, unit: 'credits' },
                  { label: 'Positive feedback reward', value: 40, unit: 'credits' },
                  { label: 'Daily credit cap', value: 200, unit: 'credits' },
                  { label: 'Priority matching cost', value: 100, unit: 'credits' },
                ].map((setting) => (
                  <div
                    key={setting.label}
                    className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl"
                  >
                    <span className="text-gray-700 dark:text-gray-300">
                      {setting.label}
                    </span>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        defaultValue={setting.value}
                        className="w-24 text-right"
                      />
                      <span className="text-sm text-gray-500 w-16">
                        {setting.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <Button className="mt-6 pairon-btn-primary">
                Save Changes
              </Button>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}
