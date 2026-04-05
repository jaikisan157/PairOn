import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { DashboardSidebar } from '@/components/DashboardSidebar';
import { MessageSquare, ThumbsUp, Plus, Trash2, Tag, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

interface Feedback {
  _id: string;
  title: string;
  description: string;
  category: 'feature' | 'bug' | 'general';
  author: {
    _id: string;
    name: string;
    email: string;
    reputation: number;
    avatar?: string;
  };
  likes: string[];
  createdAt: string;
}

export function CommunityPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Feedbacks logic
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Create state
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState<'feature'|'bug'|'general'>('general');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchFeedbacks = async () => {
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/feedback`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('pairon_token')}` }
      });
      if (response.ok) {
        setFeedbacks(await response.json());
      }
    } catch (err) {
      console.error('Failed to load feedback', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedbacks();
  }, []);

  const handleLike = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/feedback/${id}/like`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('pairon_token')}` }
      });
      if (response.ok) {
        const { likes } = await response.json();
        setFeedbacks(prev => prev.map(f => f._id === id ? { ...f, likes } : f)
               .sort((a, b) => b.likes.length - a.likes.length || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      }
    } catch (err) { }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this post?')) return;
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/feedback/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${localStorage.getItem('pairon_token')}` }
      });
      if (response.ok) {
        setFeedbacks(prev => prev.filter(f => f._id !== id));
      }
    } catch (err) { }
  };

  const handleCreate = async () => {
    if (!newTitle.trim() || !newDesc.trim()) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('pairon_token')}`
        },
        body: JSON.stringify({ title: newTitle, description: newDesc, category: newCategory })
      });
      
      if (response.ok) {
        const created = await response.json();
        // Optimistically attach author object for UI until reload
        created.author = { _id: user?.id, name: user?.name, reputation: user?.reputation };
        setFeedbacks(prev => [created, ...prev]
               .sort((a, b) => b.likes.length - a.likes.length || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        setShowCreate(false);
        setNewTitle('');
        setNewDesc('');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getCategoryColor = (cat: string) => {
    if (cat === 'feature') return 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-500/30';
    if (cat === 'bug') return 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30';
    return 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30';
  };
  return (
    <div className="min-h-screen bg-pairon-bg dark:bg-gray-900">
      <DashboardSidebar 
        onLogout={logout} 
        expanded={sidebarOpen} 
        onToggle={() => setSidebarOpen(!sidebarOpen)} 
      />
      <div className={`transition-all duration-300 flex flex-col h-screen overflow-hidden ${sidebarOpen ? 'lg:ml-[220px]' : 'lg:ml-[68px]'}`}>
        {/* Header */}
        <header className="h-[73px] flex-shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md flex items-center justify-between px-6 z-10 transition-all duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/20 flex items-center justify-center border border-indigo-100 dark:border-indigo-500/30 shrink-0">
              <MessageSquare className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white truncate">Community & Feedback</h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 hidden sm:block">Share suggestions, report bugs, and vote on features</p>
            </div>
          </div>
          
          <Button 
            onClick={() => setShowCreate(!showCreate)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shrink-0 ml-2"
          >
            {showCreate ? <ArrowLeft className="w-4 h-4 sm:mr-2" /> : <Plus className="w-4 h-4 sm:mr-2" />}
            <span className="hidden sm:inline">{showCreate ? 'Back to Posts' : 'New Post'}</span>
          </Button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          <div className="max-w-4xl mx-auto pb-20">
            {showCreate ? (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 shadow-xl"
              >
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Create a Post</h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-400 mb-1 block">Title</label>
                    <Input 
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      placeholder="Give a short, clear title..."
                      className="bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-400 mb-1 block">Category</label>
                    <div className="flex gap-2">
                      {['feature', 'bug', 'general'].map(c => (
                        <button
                          key={c}
                          onClick={() => setNewCategory(c as any)}
                          className={`px-4 py-2 rounded-xl text-sm font-medium capitalize border transition-all ${
                            newCategory === c 
                              ? 'bg-indigo-600 border-indigo-500 text-white' 
                              : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-400 mb-1 block">Description</label>
                    <textarea 
                      value={newDesc}
                      onChange={e => setNewDesc(e.target.value)}
                      placeholder="Explain your idea, issue, or suggestion in detail..."
                      className="w-full h-40 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-xl p-3 outline-none focus:border-indigo-500/50 resize-none font-medium"
                    />
                  </div>
                  <div className="pt-4 flex justify-end">
                    <Button 
                      disabled={isSubmitting || !newTitle.trim() || !newDesc.trim()}
                      onClick={handleCreate}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 rounded-xl"
                    >
                      {isSubmitting ? 'Posting...' : 'Post to Community'}
                    </Button>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="space-y-4">
                {isLoading ? (
                  <div className="flex justify-center items-center h-40 text-gray-400">Loading posts...</div>
                ) : feedbacks.length === 0 ? (
                  <div className="flex justify-center items-center h-40 text-gray-400">No posts yet. Be the first to start a discussion!</div>
                ) : (
                  feedbacks.map(f => {
                    const isLikedByMe = user && f.likes.includes(user.id);
                    const isAuthor = user && f.author._id === user.id;
                    const likeCount = f.likes.length;

                    return (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        key={f._id} 
                        className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm hover:shadow-md hover:border-pairon-accent/30 dark:hover:border-pairon-accent/30 transition-all group flex gap-4"
                      >
                        {/* Vote Column */}
                        <div className="flex flex-col items-center gap-2">
                          <button 
                            onClick={(e) => handleLike(f._id, e)}
                            className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center transition-colors ${
                              isLikedByMe 
                                ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-500/30' 
                                : 'bg-gray-50 dark:bg-gray-900/50 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 border-gray-200 dark:border-gray-700'
                            }`}
                          >
                            <ThumbsUp className={`w-4 h-4 mb-1 ${isLikedByMe ? 'fill-current' : ''}`} />
                            <span className="text-xs font-bold">{likeCount}</span>
                          </button>
                        </div>
                        
                        {/* Content Column */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">{f.title}</h3>
                            <div className={`px-2.5 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5 shrink-0 ml-4 ${getCategoryColor(f.category)}`}>
                              <Tag className="w-3 h-3" />
                              <span className="capitalize">{f.category}</span>
                            </div>
                          </div>
                          
                          <p className="text-gray-600 dark:text-gray-300 text-sm mb-4 leading-relaxed whitespace-pre-wrap">{f.description}</p>
                          
                          <div className="flex items-center justify-between mt-auto">
                            <button 
                              onClick={() => {
                                if (f.author._id) navigate(`/users/${f.author._id}`);
                              }}
                              className="flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 px-2 py-1 -ml-2 rounded-lg transition-colors text-left"
                            >
                              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white shadow-md">
                                {f.author.name?.charAt(0).toUpperCase() || '?'}
                              </div>
                              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors">{f.author.name || 'Anonymous'}</span>
                              <span className="text-xs text-gray-400 dark:text-gray-600">•</span>
                              <span className="text-xs text-gray-400 dark:text-gray-500">{new Date(f.createdAt).toLocaleDateString()}</span>
                            </button>
                            
                            {(isAuthor || user?.role === 'admin') && (
                              <button 
                                onClick={(e) => handleDelete(f._id, e)}
                                className="text-gray-500 hover:text-red-400 p-1 rounded-lg hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
