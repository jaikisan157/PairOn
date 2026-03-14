import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Edit2,
  Save,
  Zap,
  Star,
  Trophy,
  Clock,
  Award,
  CheckCircle,
  Sun,
  Moon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { SKILLS_LIST, INTERESTS_LIST } from '@/data/constants';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

export function ProfilePage() {
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [isEditing, setIsEditing] = useState(false);
  const [editedUser, setEditedUser] = useState(user);
  const [searchParams] = useSearchParams();
  const [githubStatus, setGithubStatus] = useState<{ connected: boolean; username: string | null } | null>(null);
  const [githubConnecting, setGithubConnecting] = useState(false);
  const [githubMsg, setGithubMsg] = useState('');

  // Fetch GitHub connection status
  useEffect(() => {
    const token = localStorage.getItem('pairon_token') || '';
    const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    fetch(`${API}/api/auth/github/status`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setGithubStatus(data))
      .catch(() => {});
    // Handle OAuth callback result
    const ghParam = searchParams.get('github');
    if (ghParam === 'success') {
      const uname = searchParams.get('username') || '';
      setGithubMsg(`✓ GitHub connected${uname ? ` as @${uname}` : ''}!`);
      setGithubStatus({ connected: true, username: uname });
    } else if (ghParam === 'error') {
      setGithubMsg(`GitHub connection failed: ${searchParams.get('reason') || 'unknown error'}`);
    }
  }, []);

  const handleSave = async () => {
    if (editedUser) {
      await updateProfile({
        name: editedUser.name,
        bio: editedUser.bio,
        skills: editedUser.skills,
        interests: editedUser.interests,
        experienceLevel: editedUser.experienceLevel,
      });
      setIsEditing(false);
    }
  };

  const toggleSkill = (skill: string) => {
    if (!editedUser) return;
    const newSkills = editedUser.skills.includes(skill)
      ? editedUser.skills.filter((s) => s !== skill)
      : [...editedUser.skills, skill];
    setEditedUser({ ...editedUser, skills: newSkills });
  };

  const toggleInterest = (interest: string) => {
    if (!editedUser) return;
    const newInterests = editedUser.interests.includes(interest)
      ? editedUser.interests.filter((i) => i !== interest)
      : [...editedUser.interests, interest];
    setEditedUser({ ...editedUser, interests: newInterests });
  };

  if (!user) return null;

  const displayUser = isEditing ? editedUser : user;

  const stats = [
    { label: 'Credits', value: user.credits, icon: Zap, color: 'bg-pairon-accent-light text-pairon-accent' },
    { label: 'Reputation', value: user.reputation, icon: Star, color: 'bg-yellow-100 text-yellow-600' },
    { label: 'Projects', value: user.completedProjects, icon: Trophy, color: 'bg-purple-100 text-purple-600' },
    { label: 'Hours', value: 48, icon: Clock, color: 'bg-blue-100 text-blue-600' },
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
              <h1 className="font-display font-semibold text-xl text-gray-900 dark:text-white">
                Profile
              </h1>
            </div>

            <div className="flex items-center gap-2">
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => (isEditing ? handleSave() : setIsEditing(true))}
                className="flex items-center gap-2"
              >
                {isEditing ? (
                  <>
                    <Save className="w-4 h-4" />
                    Save
                  </>
                ) : (
                  <>
                    <Edit2 className="w-4 h-4" />
                    Edit
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Profile Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-gray-800 rounded-[28px] shadow-card p-8 mb-8"
          >
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* Avatar */}
              <div className="relative">
                <img
                  src={user.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&h=200&fit=crop&crop=face'}
                  alt={user.name}
                  className="w-24 h-24 rounded-full object-cover border-4 border-pairon-accent-light"
                />
                <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-pairon-accent rounded-full flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-white" />
                </div>
              </div>

              {/* Info */}
              <div className="text-center sm:text-left flex-1">
                {isEditing ? (
                  <Input
                    value={displayUser?.name}
                    onChange={(e) => setEditedUser((prev) => prev ? { ...prev, name: e.target.value } : null)}
                    className="text-2xl font-display font-bold mb-2"
                  />
                ) : (
                  <h2 className="font-display text-2xl font-bold text-gray-900 dark:text-white mb-1">
                    {user.name}
                  </h2>
                )}
                <p className="text-gray-500 dark:text-gray-400 mb-2">{user.email}</p>
                <div className="flex items-center gap-2 justify-center sm:justify-start">
                  <span className="px-3 py-1 bg-pairon-accent-light dark:bg-pairon-accent/10 text-pairon-accent text-sm font-medium rounded-full capitalize">
                    {user.experienceLevel}
                  </span>
                  <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-sm rounded-full">
                    Member since {new Date(user.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Bio */}
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Bio
              </h3>
              {isEditing ? (
                <textarea
                  value={displayUser?.bio}
                  onChange={(e) => setEditedUser((prev) => prev ? { ...prev, bio: e.target.value } : null)}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none h-24"
                />
              ) : (
                <p className="text-gray-700 dark:text-gray-300">
                  {user.bio || 'No bio yet. Edit your profile to add one!'}
                </p>
              )}
            </div>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
          >
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-card text-center"
              >
                <div className={`w-12 h-12 rounded-xl ${stat.color} flex items-center justify-center mx-auto mb-3`}>
                  <stat.icon className="w-6 h-6" />
                </div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                  {stat.value}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {stat.label}
                </p>
              </div>
            ))}
          </motion.div>

          {/* Skills */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-white dark:bg-gray-800 rounded-[28px] shadow-card p-8 mb-8"
          >
            <h3 className="font-display text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Skills
            </h3>
            {isEditing ? (
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2">
                {SKILLS_LIST.map((skill) => (
                  <button
                    key={skill}
                    onClick={() => toggleSkill(skill)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm transition-colors',
                      displayUser?.skills.includes(skill)
                        ? 'bg-pairon-accent text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                    )}
                  >
                    {skill}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {user.skills.length > 0 ? (
                  user.skills.map((skill) => (
                    <span
                      key={skill}
                      className="px-3 py-1.5 bg-pairon-accent-light dark:bg-pairon-accent/10 text-pairon-accent text-sm font-medium rounded-full"
                    >
                      {skill}
                    </span>
                  ))
                ) : (
                  <p className="text-gray-500">No skills added yet.</p>
                )}
              </div>
            )}
          </motion.div>

          {/* Interests */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-white dark:bg-gray-800 rounded-[28px] shadow-card p-8 mb-8"
          >
            <h3 className="font-display text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Interests
            </h3>
            {isEditing ? (
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto p-2">
                {INTERESTS_LIST.map((interest) => (
                  <button
                    key={interest}
                    onClick={() => toggleInterest(interest)}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-sm transition-colors',
                      displayUser?.interests.includes(interest)
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                    )}
                  >
                    {interest}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {user.interests.length > 0 ? (
                  user.interests.map((interest) => (
                    <span
                      key={interest}
                      className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 text-sm font-medium rounded-full"
                    >
                      {interest}
                    </span>
                  ))
                ) : (
                  <p className="text-gray-500">No interests added yet.</p>
                )}
              </div>
            )}
          </motion.div>

          {/* GitHub Integration */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="bg-white dark:bg-gray-800 rounded-[28px] shadow-card p-8 mb-8"
          >
            <div className="flex items-center gap-3 mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-gray-700 dark:text-gray-300"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
              <h3 className="font-display text-lg font-semibold text-gray-900 dark:text-white">GitHub Integration</h3>
            </div>

            {githubMsg && (
              <p className={`text-sm mb-4 font-medium ${githubMsg.startsWith('✓') ? 'text-green-600' : 'text-red-500'}`}>{githubMsg}</p>
            )}

            {githubStatus?.connected ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-600 dark:text-green-400 font-semibold">✓ Connected as <span className="font-mono">@{githubStatus.username}</span></p>
                  <p className="text-xs text-gray-500 mt-1">Your GitHub account is linked. Push to GitHub works from the IDE.</p>
                </div>
                <button
                  onClick={async () => {
                    const token = localStorage.getItem('pairon_token') || '';
                    const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
                    await fetch(`${API}/api/auth/github/disconnect`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
                    setGithubStatus({ connected: false, username: null });
                    setGithubMsg('GitHub disconnected.');
                  }}
                  className="text-xs text-red-500 hover:text-red-600 border border-red-200 dark:border-red-800 px-3 py-1.5 rounded-xl transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Connect your GitHub account to push projects directly from the IDE — no tokens needed.</p>
                <button
                  disabled={githubConnecting}
                  onClick={async () => {
                    setGithubConnecting(true);
                    const token = localStorage.getItem('pairon_token') || '';
                    const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
                    const res = await fetch(`${API}/api/auth/github/connect`, { headers: { Authorization: `Bearer ${token}` } });
                    const data = await res.json();
                    if (data.url) window.location.href = data.url;
                    else setGithubMsg('GitHub OAuth not configured on server.');
                    setGithubConnecting(false);
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 hover:bg-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                  {githubConnecting ? 'Redirecting...' : 'Connect GitHub'}
                </button>
              </div>
            )}
          </motion.div>

          {/* Badges */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-white dark:bg-gray-800 rounded-[28px] shadow-card p-8"
          >
            <h3 className="font-display text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Badges
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {user.badges.length > 0 ? (
                user.badges.map((badge) => (
                  <div
                    key={badge.id}
                    className="flex items-center gap-3 p-4 bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 rounded-xl"
                  >
                    <div className="w-10 h-10 rounded-full bg-yellow-400 flex items-center justify-center">
                      <Award className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white text-sm">
                        {badge.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(badge.earnedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500 col-span-full">No badges earned yet.</p>
              )}
            </div>
          </motion.div>
        </div>
      </main>
    </div>
  );
}
