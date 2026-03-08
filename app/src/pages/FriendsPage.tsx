import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Users, UserPlus, Check, X, Trash2, Clock, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';

interface Friend {
    friendshipId: string;
    id: string;
    name: string;
    email: string;
    avatar?: string;
    isOnline: boolean;
    lastActive: string;
    reputation: number;
    experienceLevel: string;
}

interface PendingRequest {
    friendshipId: string;
    requesterId: string;
    requesterName: string;
    requesterAvatar?: string;
    requesterReputation: number;
    createdAt: string;
}

export function FriendsPage() {
    const navigate = useNavigate();
    const [friends, setFriends] = useState<Friend[]>([]);
    const [pending, setPending] = useState<PendingRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'friends' | 'requests'>('friends');

    const loadData = useCallback(async () => {
        try {
            const [friendsRes, pendingRes] = await Promise.all([
                api.getFriends(),
                api.getPendingFriendRequests(),
            ]);
            setFriends(friendsRes.friends);
            setPending(pendingRes.pending);
        } catch (error) {
            console.error('Failed to load friends:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    const handleAccept = async (friendshipId: string) => {
        try {
            await api.acceptFriendRequest(friendshipId);
            loadData();
        } catch (error) {
            console.error('Failed to accept:', error);
        }
    };

    const handleDecline = async (friendshipId: string) => {
        try {
            await api.declineFriendRequest(friendshipId);
            loadData();
        } catch (error) {
            console.error('Failed to decline:', error);
        }
    };

    const handleRemove = async (friendshipId: string) => {
        if (!confirm('Remove this friend?')) return;
        try {
            await api.removeFriend(friendshipId);
            loadData();
        } catch (error) {
            console.error('Failed to remove:', error);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-pairon-bg dark:bg-gray-900 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-pairon-accent" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-pairon-bg dark:bg-gray-900">
            <div className="max-w-4xl mx-auto p-6">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>
                    <div>
                        <h1 className="font-display text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <Users className="w-6 h-6 text-pairon-accent" />
                            Friends
                        </h1>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {friends.length} friend{friends.length !== 1 ? 's' : ''} · {pending.length} pending request{pending.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-6">
                    <button
                        onClick={() => setActiveTab('friends')}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'friends'
                            ? 'bg-pairon-accent text-white shadow-md'
                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                    >
                        <Users className="w-4 h-4 inline mr-1.5" />
                        Friends ({friends.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('requests')}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all relative ${activeTab === 'requests'
                            ? 'bg-pairon-accent text-white shadow-md'
                            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                            }`}
                    >
                        <UserPlus className="w-4 h-4 inline mr-1.5" />
                        Requests
                        {pending.length > 0 && (
                            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                                {pending.length}
                            </span>
                        )}
                    </button>
                </div>

                {/* Friends List */}
                {activeTab === 'friends' && (
                    <div className="space-y-3">
                        {friends.length === 0 ? (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700"
                            >
                                <Users className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                                <p className="text-gray-500 dark:text-gray-400 font-medium">No friends yet</p>
                                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                                    Connect with people during Quick Chat or Collaboration!
                                </p>
                            </motion.div>
                        ) : (
                            friends.map((friend, i) => (
                                <motion.div
                                    key={friend.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 hover:border-pairon-accent/30 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-pairon-accent to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                                                {friend.avatar ? (
                                                    <img src={friend.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                                                ) : (
                                                    friend.name.charAt(0).toUpperCase()
                                                )}
                                            </div>
                                            <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-gray-800 ${friend.isOnline ? 'bg-green-500' : 'bg-gray-400'
                                                }`} />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-gray-900 dark:text-white text-sm">{friend.name}</p>
                                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                                <span>⭐ {friend.reputation}</span>
                                                <span>·</span>
                                                <span className="capitalize">{friend.experienceLevel}</span>
                                                <span>·</span>
                                                <span>{friend.isOnline ? '🟢 Online' : '⚫ Offline'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleRemove(friend.friendshipId)}
                                            className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 h-8"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </div>
                )}

                {/* Pending Requests */}
                {activeTab === 'requests' && (
                    <div className="space-y-3">
                        {pending.length === 0 ? (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700"
                            >
                                <Clock className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                                <p className="text-gray-500 dark:text-gray-400 font-medium">No pending requests</p>
                            </motion.div>
                        ) : (
                            pending.map((req, i) => (
                                <motion.div
                                    key={req.friendshipId}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm">
                                            {req.requesterName.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-gray-900 dark:text-white text-sm">{req.requesterName}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                ⭐ {req.requesterReputation} · Sent {new Date(req.createdAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            size="sm"
                                            onClick={() => handleAccept(req.friendshipId)}
                                            className="bg-green-600 hover:bg-green-700 text-white h-8"
                                        >
                                            <Check className="w-3.5 h-3.5 mr-1" /> Accept
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleDecline(req.friendshipId)}
                                            className="text-red-500 hover:text-red-600 h-8"
                                        >
                                            <X className="w-3.5 h-3.5 mr-1" /> Decline
                                        </Button>
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
