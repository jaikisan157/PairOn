import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Star, Zap, CheckCircle, Award, UserPlus, MessageCircle, Check, Loader2, Calendar, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

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
  const [isFriend, setIsFriend] = useState(false);
  const [friendRequestSent, setFriendRequestSent] = useState(false);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [profileProjects, setProfileProjects] = useState<any[]>([]);
  const [profileProjectsLoading, setProfileProjectsLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    if (me && me.id === userId) { navigate('/profile'); return; }

    const token = localStorage.getItem('pairon_token') || '';
    const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    fetch(`${API}/api/users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => { setProfile(data); setLoading(false); })
      .catch(() => { setError('Could not load profile.'); setLoading(false); });

    // Fetch user public projects
    api.getUserProjects(userId)
      .then(data => {
        setProfileProjects(data.projects || []);
      })
      .catch(() => {
        setProfileProjects([]);
      })
      .finally(() => {
        setProfileProjectsLoading(false);
      });

    // Check if already friends
    api.getFriends().then(data => {
      if (data.friends?.some((f: any) => f.id === userId)) {
        setIsFriend(true);
      }
    }).catch(() => {});
  }, [userId, me, navigate]);

  const handleSendFriendRequest = useCallback(async () => {
    if (!userId) return;
    setSendingRequest(true);
    try {
      await api.sendFriendRequest(userId);
      setFriendRequestSent(true);
    } catch {
      // already sent or error
    }
    setSendingRequest(false);
  }, [userId]);

  const initials = profile?.name?.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) || '?';

  const getRepTier = (rep: number) => {
    if (rep >= 500) return { label: 'Expert', color: 'text-purple-500 bg-purple-100 dark:bg-purple-900/30' };
    if (rep >= 200) return { label: 'Advanced', color: 'text-blue-500 bg-blue-100 dark:bg-blue-900/30' };
    if (rep >= 50) return { label: 'Rising Star', color: 'text-yellow-500 bg-yellow-100 dark:bg-yellow-900/30' };
    return { label: 'Newcomer', color: 'text-gray-500 bg-gray-100 dark:bg-gray-700' };
  };

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

  const repTier = getRepTier(profile.reputation);
  const joinDate = new Date(profile.createdAt);
  const daysSinceJoin = Math.floor((Date.now() - joinDate.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="min-h-screen bg-pairon-bg dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-4 flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <h1 className="font-display font-semibold text-gray-900 dark:text-white truncate">{profile.name}&apos;s Profile</h1>
      </header>

      <main className="max-w-2xl mx-auto px-3 sm:px-4 py-6 sm:py-8 space-y-4 sm:space-y-6">
        {/* Profile card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="bg-white dark:bg-gray-800 rounded-2xl sm:rounded-[24px] shadow-card p-5 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-6">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              {profile.avatar ? (
                <img src={profile.avatar} alt={profile.name} className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-4 border-pairon-accent-light" />
              ) : (
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-pairon-accent to-purple-600 flex items-center justify-center text-white text-xl sm:text-2xl font-bold border-4 border-pairon-accent-light">
                  {initials}
                </div>
              )}
              <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white dark:border-gray-800 ${profile.isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
            </div>

            <div className="flex-1 min-w-0 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                <h2 className="font-display text-xl sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{profile.name}</h2>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${profile.isOnline ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>
                  {profile.isOnline ? '● Online' : 'Offline'}
                </span>
              </div>
              <div className="flex flex-wrap justify-center sm:justify-start gap-2 mb-3">
                <span className="capitalize px-3 py-1 bg-pairon-accent-light dark:bg-pairon-accent/10 text-pairon-accent text-sm font-medium rounded-full">{profile.experienceLevel}</span>
                <span className={`px-3 py-1 text-sm font-medium rounded-full ${repTier.color}`}>{repTier.label}</span>
              </div>
              {/* Stats row */}
              <div className="flex items-center justify-center sm:justify-start gap-5 text-sm text-gray-600 dark:text-gray-400">
                <span className="flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-yellow-500" />
                  <span className="font-semibold text-gray-900 dark:text-white">{profile.reputation}</span> rep
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="font-semibold text-gray-900 dark:text-white">{profile.completedProjects}</span> projects
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-blue-400" />
                  {daysSinceJoin}d ago
                </span>
              </div>
            </div>
          </div>

          {/* Bio */}
          {profile.bio && (
            <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-700">
              <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{profile.bio}</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-2">
            {isFriend ? (
              <>
                <Button
                  onClick={() => navigate(`/messages?friendId=${userId}&friendName=${encodeURIComponent(profile.name)}`)}
                  className="bg-pairon-accent hover:bg-pairon-accent/90 text-white rounded-xl flex-1 sm:flex-none"
                >
                  <MessageCircle className="w-4 h-4 mr-2" /> Message
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl text-gray-600 dark:text-gray-300 flex-1 sm:flex-none"
                  onClick={() => navigate('/friends')}
                >
                  <Check className="w-4 h-4 mr-2 text-green-500" /> Friends
                </Button>
              </>
            ) : friendRequestSent ? (
              <Button disabled className="rounded-xl flex-1 sm:flex-none">
                <Check className="w-4 h-4 mr-2" /> Request Sent
              </Button>
            ) : (
              <Button
                onClick={handleSendFriendRequest}
                disabled={sendingRequest}
                className="bg-pairon-accent hover:bg-pairon-accent/90 text-white rounded-xl flex-1 sm:flex-none"
              >
                {sendingRequest ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <UserPlus className="w-4 h-4 mr-2" />
                )}
                Add Friend
              </Button>
            )}
          </div>
        </motion.div>

        {/* Skills & Interests in a grid */}
        <div className="grid sm:grid-cols-2 gap-4">
          {/* Skills */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white dark:bg-gray-800 rounded-2xl sm:rounded-[24px] shadow-card p-5 sm:p-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2"><Zap className="w-3.5 h-3.5" />Skills</h3>
            {profile.skills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profile.skills.map(s => (
                  <span key={s} className="px-3 py-1 bg-pairon-accent-light dark:bg-pairon-accent/10 text-pairon-accent text-sm rounded-full font-medium">{s}</span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic">No skills listed yet</p>
            )}
          </motion.div>

          {/* Interests */}
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="bg-white dark:bg-gray-800 rounded-2xl sm:rounded-[24px] shadow-card p-5 sm:p-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2"><Heart className="w-3.5 h-3.5" />Interests</h3>
            {profile.interests.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {profile.interests.map(i => (
                  <span key={i} className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-sm rounded-full">{i}</span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic">No interests listed yet</p>
            )}
          </motion.div>
        </div>

        {/* Badges */}
        {profile.badges.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-white dark:bg-gray-800 rounded-2xl sm:rounded-[24px] shadow-card p-5 sm:p-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2"><Award className="w-3.5 h-3.5" />Badges</h3>
            <div className="flex flex-wrap gap-2">
              {profile.badges.map(b => (
                <span key={b} className="px-3 py-1.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-sm rounded-full font-medium">🏆 {b}</span>
              ))}
            </div>
          </motion.div>
        )}

        {/* Public Projects */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="bg-white dark:bg-gray-800 rounded-2xl sm:rounded-[24px] shadow-card p-5 sm:p-6">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
            <CheckCircle className="w-3.5 h-3.5" /> Recent Projects
          </h3>
          <div className="space-y-4">
            {profileProjectsLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
              </div>
            ) : profileProjects.length > 0 ? (
              profileProjects.map((proj) => (
                <div key={proj.id} className="p-4 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-gray-900 dark:text-white truncate">
                      {proj.projectIdea?.title || 'Untitled Project'}
                    </h4>
                    {proj.projectIdea?.description && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1 mt-1">
                        {proj.projectIdea.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
                      <span className="bg-pairon-bg dark:bg-gray-700 px-2 py-0.5 rounded-full capitalize">
                        {proj.mode}
                      </span>
                      <span>• Built with {proj.partnerName || 'Unknown'}</span>
                    </div>
                  </div>
                  {proj.submissionLink && (
                    <a
                      href={proj.submissionLink?.match(/^https?:\/\//i) ? proj.submissionLink : `https://${proj.submissionLink}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2 bg-pairon-accent hover:bg-pairon-accent/90 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                    >
                      View Code
                    </a>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500 italic">No public projects to display yet</p>
            )}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
