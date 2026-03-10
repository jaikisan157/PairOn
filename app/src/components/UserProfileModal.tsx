import { useState, useEffect, useCallback } from 'react';
import { X, UserPlus, UserCheck, Clock, Star, Loader2, UserX } from 'lucide-react';
import { api } from '@/lib/api';

interface UserProfileModalProps {
    userId: string;
    userName: string;
    userReputation?: number;
    isOnline?: boolean;
    onClose: () => void;
}

type FriendshipStatus = 'none' | 'pending' | 'accepted' | 'declined';

export function UserProfileModal({ userId, userName, userReputation, isOnline, onClose }: UserProfileModalProps) {
    const [friendshipStatus, setFriendshipStatus] = useState<FriendshipStatus>('none');
    const [friendshipId, setFriendshipId] = useState<string>('');
    const [isRequester, setIsRequester] = useState(false);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const res = await api.getFriendshipStatus(userId);
                setFriendshipStatus(res.status as FriendshipStatus);
                setFriendshipId(res.friendshipId || '');
                setIsRequester(res.isRequester || false);
            } catch {
                // ignore
            } finally {
                setLoading(false);
            }
        })();
    }, [userId]);

    const sendRequest = useCallback(async () => {
        setActionLoading(true);
        setMessage('');
        try {
            const res = await api.sendFriendRequest(userId);
            setFriendshipStatus('pending');
            setFriendshipId(res.friendship?._id || '');
            setIsRequester(true);
            setMessage('Friend request sent! ✓');
        } catch (err: any) {
            setMessage(err.message || 'Failed to send request');
        } finally {
            setActionLoading(false);
        }
    }, [userId]);

    const acceptRequest = useCallback(async () => {
        if (!friendshipId) return;
        setActionLoading(true);
        try {
            await api.acceptFriendRequest(friendshipId);
            setFriendshipStatus('accepted');
            setMessage('You are now friends! 🎉');
        } catch (err: any) {
            setMessage(err.message || 'Failed to accept');
        } finally {
            setActionLoading(false);
        }
    }, [friendshipId]);

    const removeFriend = useCallback(async () => {
        if (!friendshipId || !confirm('Remove this friend?')) return;
        setActionLoading(true);
        try {
            await api.removeFriend(friendshipId);
            setFriendshipStatus('none');
            setFriendshipId('');
            setMessage('Friend removed');
        } catch (err: any) {
            setMessage(err.message || 'Failed to remove');
        } finally {
            setActionLoading(false);
        }
    }, [friendshipId]);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

            {/* Modal */}
            <div
                className="relative z-10 w-[340px] bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-in fade-in zoom-in-95"
                onClick={e => e.stopPropagation()}
            >
                {/* Header with gradient */}
                <div className="relative h-24 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500">
                    <button
                        onClick={onClose}
                        className="absolute top-3 right-3 p-1 rounded-full bg-black/20 hover:bg-black/40 text-white transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Avatar */}
                <div className="flex justify-center -mt-10">
                    <div className="relative">
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-2xl font-bold border-4 border-white dark:border-gray-800 shadow-lg">
                            {userName.charAt(0).toUpperCase()}
                        </div>
                        {/* Online indicator */}
                        <div className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-white dark:border-gray-800 ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
                    </div>
                </div>

                {/* User info */}
                <div className="text-center px-6 pt-3 pb-2">
                    <h2 className="text-lg font-bold text-gray-900 dark:text-white">{userName}</h2>
                    <div className="flex items-center justify-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                            <Star className="w-3.5 h-3.5 text-yellow-500" />
                            {userReputation ?? 100}
                        </span>
                        <span className={`flex items-center gap-1 ${isOnline ? 'text-green-500' : 'text-gray-400'}`}>
                            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
                            {isOnline ? 'Online' : 'Offline'}
                        </span>
                    </div>
                </div>

                {/* Friend action */}
                <div className="px-6 pb-5 pt-2">
                    {loading ? (
                        <div className="flex justify-center py-3">
                            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                        </div>
                    ) : (
                        <>
                            {friendshipStatus === 'none' && (
                                <button
                                    onClick={sendRequest}
                                    disabled={actionLoading}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-xl transition-colors text-sm"
                                >
                                    {actionLoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <UserPlus className="w-4 h-4" />
                                    )}
                                    Add Friend
                                </button>
                            )}

                            {friendshipStatus === 'pending' && isRequester && (
                                <div className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 font-medium rounded-xl text-sm border border-yellow-500/20">
                                    <Clock className="w-4 h-4" />
                                    Request Sent
                                </div>
                            )}

                            {friendshipStatus === 'pending' && !isRequester && (
                                <button
                                    onClick={acceptRequest}
                                    disabled={actionLoading}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium rounded-xl transition-colors text-sm"
                                >
                                    {actionLoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <UserCheck className="w-4 h-4" />
                                    )}
                                    Accept Friend Request
                                </button>
                            )}

                            {friendshipStatus === 'accepted' && (
                                <div className="space-y-2">
                                    <div className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-500/10 text-green-600 dark:text-green-400 font-medium rounded-xl text-sm border border-green-500/20">
                                        <UserCheck className="w-4 h-4" />
                                        Friends ✓
                                    </div>
                                    <button
                                        onClick={removeFriend}
                                        disabled={actionLoading}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-2 text-red-500 hover:bg-red-500/10 font-medium rounded-xl transition-colors text-xs"
                                    >
                                        <UserX className="w-3.5 h-3.5" />
                                        Remove Friend
                                    </button>
                                </div>
                            )}

                            {friendshipStatus === 'declined' && (
                                <button
                                    onClick={sendRequest}
                                    disabled={actionLoading}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-xl transition-colors text-sm"
                                >
                                    {actionLoading ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <UserPlus className="w-4 h-4" />
                                    )}
                                    Send Friend Request Again
                                </button>
                            )}

                            {message && (
                                <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-2">{message}</p>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
