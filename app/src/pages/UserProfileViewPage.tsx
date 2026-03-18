import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Star, Zap, CheckCircle, Award } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';

interface PublicUser {
  id: string;
  name: string;
  bio?: string;
  avatar?: string;
  skills: string[];
  interests: string[];
  experienceLevel: string;
  reputation: number;
  completedProjects: number;
  badges: string[];
  isOnline: boolean;
  createdAt: string;
}

export function UserProfileViewPage() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId) return;
    // If viewing own profile, redirect to /profile
    if (me && me.id === userId) { navigate('/profile'); return; }

    const token = localStorage.getItem('pairon_token') || '';
    const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    fetch(`${API}/api/users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => { setProfile(data); setLoading(false); })
      .catch(() => { setError('Could not load profile.'); setLoading(false); });
  }, [userId, me, navigate]);

  const initials = profile?.name?.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) || '?';

  if (loading) return (
    <div className="min-h-screen bg-pairon-bg dark:bg-gray-900 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-pairon-accent/30 border-t-pairon-accent rounded-full animate-spin" />
    </div>
  );

  if (error || !profile) return (
    <div className="min-h-screen bg-pairon-bg dark:bg-gray-900 flex flex-col items-center justify-center gap-4">
      <p className="text-gray-500">User not found.</p>
      <Button onClick={() => navigate(-1)} variant="outline">Go back</Button>
    </div>
  );

  return (
    <div className="min-h-screen bg-pairon-bg dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <h1 className="font-display font-semibold text-gray-900 dark:text-white">{profile.name}'s Profile</h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Profile card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="bg-white dark:bg-gray-800 rounded-[24px] shadow-card p-8">
          <div className="flex items-center gap-6">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              {profile.avatar ? (
                <img src={profile.avatar} alt={profile.name} className="w-24 h-24 rounded-full object-cover border-4 border-pairon-accent-light" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-pairon-accent to-purple-600 flex items-center justify-center text-white text-2xl font-bold border-4 border-pairon-accent-light">
                  {initials}
                </div>
              )}
              <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white dark:border-gray-800 ${profile.isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h2 className="font-display text-2xl font-bold text-gray-900 dark:text-white truncate">{profile.name}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${profile.isOnline ? 'bg-green-100 text-green-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                  {profile.isOnline ? '🟢 Online' : 'Offline'}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 mb-2">
                <span className="capitalize px-3 py-1 bg-pairon-accent-light dark:bg-pairon-accent/10 text-pairon-accent text-sm font-medium rounded-full">{profile.experienceLevel}</span>
                <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-sm rounded-full">Joined {new Date(profile.createdAt).toLocaleDateString()}</span>
              </div>
              {/* Stats */}
              <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 text-yellow-500" />{profile.reputation} rep</span>
                <span className="flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-green-500" />{profile.completedProjects} projects</span>
              </div>
            </div>
          </div>

          {profile.bio && (
            <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Bio</h3>
              <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{profile.bio}</p>
            </div>
          )}
        </motion.div>

        {/* Skills */}
        {profile.skills.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white dark:bg-gray-800 rounded-[24px] shadow-card p-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2"><Zap className="w-3.5 h-3.5" />Skills</h3>
            <div className="flex flex-wrap gap-2">
              {profile.skills.map(s => (
                <span key={s} className="px-3 py-1 bg-pairon-accent-light dark:bg-pairon-accent/10 text-pairon-accent text-sm rounded-full font-medium">{s}</span>
              ))}
            </div>
          </motion.div>
        )}

        {/* Interests */}
        {profile.interests.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-white dark:bg-gray-800 rounded-[24px] shadow-card p-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2"><Award className="w-3.5 h-3.5" />Interests</h3>
            <div className="flex flex-wrap gap-2">
              {profile.interests.map(i => (
                <span key={i} className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-sm rounded-full">{i}</span>
              ))}
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
