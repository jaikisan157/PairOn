import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft,
    Coins,
    Star,
    TrendingUp,
    TrendingDown,
    Award,
    Shield,
    Clock,
    ExternalLink,
    Sun,
    Moon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { api } from '@/lib/api';

interface Transaction {
    _id: string;
    amount: number;
    type: 'earned' | 'spent';
    source: string;
    description: string;
    createdAt: string;
}

interface Certificate {
    _id: string;
    certificateId: string;
    projectTitle: string;
    projectDescription: string;
    partnerName: string;
    skills: string[];
    duration: number;
    completedAt: string;
    createdAt: string;
}

const SOURCE_LABELS: Record<string, string> = {
    session_complete: '🎯 Session Complete',
    submission: '📝 Submission',
    positive_feedback: '👍 Positive Feedback',
    help_user: '🤝 Helped User',
    quickchat_helpful: '💬 Quick Chat',
    profile_complete: '✅ Profile Complete',
    daily_streak: '🔥 Daily Streak',
    onboarding_bonus: '🎉 Onboarding Bonus',
    priority_matching: '⚡ Priority Matching',
    profile_boost: '🚀 Profile Boost',
    unlock_ideas: '💡 Unlock Ideas',
    certificate: '📜 Certificate',
    skill_badge: '🏅 Skill Badge',
    remark_removal: '🧹 Remark Removal',
};

export function CreditsPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { theme, toggleTheme } = useTheme();

    const [tab, setTab] = useState<'overview' | 'history' | 'certificates'>('overview');
    const [summary, setSummary] = useState<{ balance: number; totalEarned: number; totalSpent: number; reputation: number } | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [certificates, setCertificates] = useState<Certificate[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [summaryData, historyData, certData] = await Promise.all([
                api.getCreditSummary(),
                api.getCreditHistory(),
                api.getCertificates(),
            ]);
            setSummary(summaryData);
            setTransactions(historyData.transactions);
            setCertificates(certData.certificates);
        } catch (err) {
            console.error('Load data error:', err);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-pairon-bg dark:bg-gray-900 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-pairon-accent/30 border-t-pairon-accent rounded-full animate-spin" />
            </div>
        );
    }

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
                                Credits & Certificates
                            </h1>
                        </div>
                        <button
                            onClick={toggleTheme}
                            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            {theme === 'light' ? (
                                <Moon className="w-5 h-5 text-gray-600" />
                            ) : (
                                <Sun className="w-5 h-5 text-gray-400" />
                            )}
                        </button>
                    </div>
                </div>
            </header>

            <main className="w-full px-4 sm:px-6 lg:px-8 py-8 max-w-4xl mx-auto">
                {/* Stats Cards */}
                <div className="grid sm:grid-cols-3 gap-4 mb-8">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-card"
                    >
                        <div className="flex items-center gap-3 mb-2">
                            <Coins className="w-5 h-5 text-pairon-accent" />
                            <span className="text-sm text-gray-500 dark:text-gray-400">Balance</span>
                        </div>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white">
                            {summary?.balance || user?.credits || 0}
                        </p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 }}
                        className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-card"
                    >
                        <div className="flex items-center gap-3 mb-2">
                            <TrendingUp className="w-5 h-5 text-green-500" />
                            <span className="text-sm text-gray-500 dark:text-gray-400">Earned</span>
                        </div>
                        <p className="text-3xl font-bold text-green-500">
                            +{summary?.totalEarned || 0}
                        </p>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-card"
                    >
                        <div className="flex items-center gap-3 mb-2">
                            <Star className="w-5 h-5 text-yellow-500" />
                            <span className="text-sm text-gray-500 dark:text-gray-400">Reputation</span>
                        </div>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white">
                            {summary?.reputation || user?.reputation || 0}
                        </p>
                    </motion.div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-2xl p-1 mb-6">
                    {[
                        { key: 'overview' as const, label: 'How to Earn' },
                        { key: 'history' as const, label: 'History' },
                        { key: 'certificates' as const, label: 'Certificates' },
                    ].map(t => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all ${tab === t.key
                                    ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white'
                                    : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                <AnimatePresence mode="wait">
                    {/* Overview Tab */}
                    {tab === 'overview' && (
                        <motion.div
                            key="overview"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                        >
                            <div className="bg-white dark:bg-gray-800 rounded-[28px] shadow-card p-8 mb-6">
                                <h3 className="font-display text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                    <TrendingUp className="w-5 h-5 text-green-500" />
                                    Earn Credits
                                </h3>
                                <div className="space-y-3">
                                    {[
                                        { label: 'Complete onboarding', amount: 25, icon: '🎉' },
                                        { label: 'Complete a collaboration session', amount: 50, icon: '🎯' },
                                        { label: 'Receive positive feedback', amount: 10, icon: '👍' },
                                        { label: 'Helpful Quick Connect chat', amount: 5, icon: '💬' },
                                        { label: 'Daily activity streak', amount: 3, icon: '🔥' },
                                    ].map((item) => (
                                        <div
                                            key={item.label}
                                            className="flex items-center justify-between py-3 px-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="text-xl">{item.icon}</span>
                                                <span className="text-sm text-gray-700 dark:text-gray-300">{item.label}</span>
                                            </div>
                                            <span className="font-bold text-green-500">+{item.amount}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-white dark:bg-gray-800 rounded-[28px] shadow-card p-8">
                                <h3 className="font-display text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                    <TrendingDown className="w-5 h-5 text-red-500" />
                                    Spend Credits
                                </h3>
                                <div className="space-y-3">
                                    {[
                                        { label: 'Generate a project certificate', amount: 50, icon: '📜' },
                                        { label: 'Unlock a skill badge', amount: 30, icon: '🏅' },
                                        { label: 'Priority matching boost', amount: 20, icon: '⚡' },
                                        { label: 'Profile visibility boost', amount: 15, icon: '🚀' },
                                        { label: 'Remove permanent remark', amount: 100, icon: '🧹' },
                                    ].map((item) => (
                                        <div
                                            key={item.label}
                                            className="flex items-center justify-between py-3 px-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl"
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="text-xl">{item.icon}</span>
                                                <span className="text-sm text-gray-700 dark:text-gray-300">{item.label}</span>
                                            </div>
                                            <span className="font-bold text-red-400">-{item.amount}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* History Tab */}
                    {tab === 'history' && (
                        <motion.div
                            key="history"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="bg-white dark:bg-gray-800 rounded-[28px] shadow-card p-8"
                        >
                            <h3 className="font-display text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                <Clock className="w-5 h-5 text-gray-400" />
                                Transaction History
                            </h3>

                            {transactions.length === 0 ? (
                                <div className="text-center py-12">
                                    <Coins className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                                    <p className="text-gray-500 dark:text-gray-400">
                                        No transactions yet. Start collaborating to earn credits!
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {transactions.map((tx) => (
                                        <div
                                            key={tx._id}
                                            className="flex items-center justify-between py-3 px-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl"
                                        >
                                            <div>
                                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                                    {SOURCE_LABELS[tx.source] || tx.source}
                                                </p>
                                                <p className="text-xs text-gray-500">{tx.description} · {formatDate(tx.createdAt)}</p>
                                            </div>
                                            <span className={`font-bold ${tx.type === 'earned' ? 'text-green-500' : 'text-red-400'
                                                }`}>
                                                {tx.type === 'earned' ? '+' : ''}{tx.amount}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* Certificates Tab */}
                    {tab === 'certificates' && (
                        <motion.div
                            key="certificates"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                        >
                            {certificates.length === 0 ? (
                                <div className="bg-white dark:bg-gray-800 rounded-[28px] shadow-card p-8 text-center">
                                    <Award className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                                    <h3 className="font-display text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                        No certificates yet
                                    </h3>
                                    <p className="text-gray-500 dark:text-gray-400 mb-4">
                                        Complete a collaboration session and generate your first certificate!
                                    </p>
                                    <Button onClick={() => navigate('/dashboard')} className="pairon-btn-primary">
                                        Start Collaborating
                                    </Button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {certificates.map((cert) => (
                                        <motion.div
                                            key={cert._id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="bg-white dark:bg-gray-800 rounded-[28px] shadow-card p-6 border-l-4 border-pairon-accent"
                                        >
                                            <div className="flex items-start justify-between mb-3">
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <Award className="w-5 h-5 text-pairon-accent" />
                                                        <h4 className="font-display font-semibold text-gray-900 dark:text-white">
                                                            {cert.projectTitle}
                                                        </h4>
                                                    </div>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400">{cert.projectDescription}</p>
                                                </div>
                                                <div className="flex items-center gap-1 text-xs text-gray-400">
                                                    <Shield className="w-3 h-3" />
                                                    Verified
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-1 mb-3">
                                                {cert.skills.map(s => (
                                                    <span key={s} className="px-2 py-0.5 bg-pairon-accent/10 text-pairon-accent rounded-full text-xs">{s}</span>
                                                ))}
                                            </div>

                                            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                                                <div className="flex gap-4">
                                                    <span>Partner: {cert.partnerName}</span>
                                                    <span>{cert.duration} min session</span>
                                                    <span>{formatDate(cert.completedAt)}</span>
                                                </div>
                                                <span className="font-mono text-[10px] text-gray-400 flex items-center gap-1">
                                                    <ExternalLink className="w-3 h-3" />
                                                    {cert.certificateId}
                                                </span>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>
        </div>
    );
}
