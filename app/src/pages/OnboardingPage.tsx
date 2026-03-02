import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    User,
    Code2,
    Heart,
    ChevronRight,
    ChevronLeft,
    Check,
    Sparkles,
    Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { SKILLS_LIST, INTERESTS_LIST } from '@/data/constants';

const EXPERIENCE_LEVELS = [
    { value: 'beginner', label: 'Beginner', description: 'Just getting started' },
    { value: 'intermediate', label: 'Intermediate', description: '1-2 years of experience' },
    { value: 'advanced', label: 'Advanced', description: '3-5 years of experience' },
    { value: 'expert', label: 'Expert', description: '5+ years of experience' },
] as const;

const STEPS = [
    { title: 'About You', icon: User, description: 'Tell us about yourself' },
    { title: 'Your Skills', icon: Code2, description: 'What can you build?' },
    { title: 'Your Interests', icon: Heart, description: 'What excites you?' },
    { title: "You're Ready!", icon: Sparkles, description: 'Start collaborating' },
];

export function OnboardingPage() {
    const navigate = useNavigate();
    const { user, updateProfile } = useAuth();

    const [step, setStep] = useState(0);
    const [bio, setBio] = useState(user?.bio || '');
    const [experienceLevel, setExperienceLevel] = useState<string>(user?.experienceLevel || '');
    const [selectedSkills, setSelectedSkills] = useState<string[]>(user?.skills || []);
    const [selectedInterests, setSelectedInterests] = useState<string[]>(user?.interests || []);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [skillSearch, setSkillSearch] = useState('');
    const [interestSearch, setInterestSearch] = useState('');

    const canProceed = () => {
        switch (step) {
            case 0: return experienceLevel !== '';
            case 1: return selectedSkills.length >= 3;
            case 2: return selectedInterests.length >= 2;
            case 3: return true;
            default: return false;
        }
    };

    const handleNext = () => {
        if (step < 3 && canProceed()) {
            setStep(step + 1);
        }
    };

    const handleBack = () => {
        if (step > 0) setStep(step - 1);
    };

    const toggleSkill = (skill: string) => {
        setSelectedSkills(prev =>
            prev.includes(skill)
                ? prev.filter(s => s !== skill)
                : [...prev, skill]
        );
    };

    const toggleInterest = (interest: string) => {
        setSelectedInterests(prev =>
            prev.includes(interest)
                ? prev.filter(i => i !== interest)
                : [...prev, interest]
        );
    };

    const handleFinish = async () => {
        setIsSubmitting(true);
        try {
            await updateProfile({
                bio,
                experienceLevel: experienceLevel as any,
                skills: selectedSkills,
                interests: selectedInterests,
                onboardingComplete: true,
            });
            navigate('/dashboard');
        } catch (err) {
            console.error('Onboarding error:', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredSkills = SKILLS_LIST.filter(s =>
        s.toLowerCase().includes(skillSearch.toLowerCase())
    );

    const filteredInterests = INTERESTS_LIST.filter(i =>
        i.toLowerCase().includes(interestSearch.toLowerCase())
    );

    const completionPercentage = () => {
        let score = 0;
        if (experienceLevel) score += 25;
        if (selectedSkills.length >= 3) score += 25;
        if (selectedInterests.length >= 2) score += 25;
        if (bio.trim().length > 0) score += 25;
        return score;
    };

    return (
        <div className="min-h-screen bg-pairon-bg dark:bg-gray-900 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl">
                {/* Logo */}
                <div className="flex justify-center mb-6">
                    <div className="flex items-center gap-2">
                        <div className="w-10 h-10 rounded-xl bg-pairon-accent flex items-center justify-center">
                            <Zap className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-display font-bold text-xl text-gray-900 dark:text-white">
                            PairOn
                        </span>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-3">
                        {STEPS.map((s, i) => {
                            const Icon = s.icon;
                            return (
                                <div key={i} className="flex flex-col items-center gap-1">
                                    <div
                                        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${i < step
                                                ? 'bg-pairon-accent text-white'
                                                : i === step
                                                    ? 'bg-pairon-accent/20 text-pairon-accent ring-2 ring-pairon-accent'
                                                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                                            }`}
                                    >
                                        {i < step ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                                    </div>
                                    <span className={`text-xs font-medium hidden sm:block ${i <= step ? 'text-pairon-accent' : 'text-gray-400'
                                        }`}>
                                        {s.title}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-pairon-accent rounded-full"
                            initial={{ width: '0%' }}
                            animate={{ width: `${(step / 3) * 100}%` }}
                            transition={{ duration: 0.3 }}
                        />
                    </div>
                </div>

                {/* Card */}
                <motion.div
                    className="bg-white dark:bg-gray-800 rounded-[28px] shadow-card p-8"
                    layout
                >
                    <AnimatePresence mode="wait">
                        {/* Step 0: About You */}
                        {step === 0 && (
                            <motion.div
                                key="step-0"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.2 }}
                            >
                                <h2 className="font-display text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                    Tell us about yourself
                                </h2>
                                <p className="text-gray-500 dark:text-gray-400 mb-6">
                                    This helps us match you with the right collaborators
                                </p>

                                <div className="space-y-6">
                                    {/* Bio */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Short bio <span className="text-gray-400">(optional)</span>
                                        </label>
                                        <textarea
                                            value={bio}
                                            onChange={(e) => setBio(e.target.value.slice(0, 200))}
                                            placeholder="e.g., Full-stack developer passionate about building tools..."
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none h-24 focus:ring-2 focus:ring-pairon-accent focus:border-transparent"
                                        />
                                        <p className="text-xs text-gray-400 mt-1">{bio.length}/200</p>
                                    </div>

                                    {/* Experience Level */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                            Experience level <span className="text-red-400">*</span>
                                        </label>
                                        <div className="grid grid-cols-2 gap-3">
                                            {EXPERIENCE_LEVELS.map((level) => (
                                                <button
                                                    key={level.value}
                                                    onClick={() => setExperienceLevel(level.value)}
                                                    className={`p-4 rounded-xl border-2 text-left transition-all ${experienceLevel === level.value
                                                            ? 'border-pairon-accent bg-pairon-accent/5 dark:bg-pairon-accent/10'
                                                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                                                        }`}
                                                >
                                                    <p className="font-medium text-gray-900 dark:text-white text-sm">
                                                        {level.label}
                                                    </p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                                        {level.description}
                                                    </p>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {/* Step 1: Skills */}
                        {step === 1 && (
                            <motion.div
                                key="step-1"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.2 }}
                            >
                                <h2 className="font-display text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                    What are your skills?
                                </h2>
                                <p className="text-gray-500 dark:text-gray-400 mb-2">
                                    Select at least 3 skills you're confident in
                                </p>
                                <p className="text-sm text-pairon-accent font-medium mb-4">
                                    {selectedSkills.length} selected {selectedSkills.length < 3 && `(need ${3 - selectedSkills.length} more)`}
                                </p>

                                <Input
                                    value={skillSearch}
                                    onChange={(e) => setSkillSearch(e.target.value)}
                                    placeholder="Search skills..."
                                    className="rounded-xl mb-4"
                                />

                                <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
                                    {filteredSkills.map((skill) => {
                                        const isSelected = selectedSkills.includes(skill);
                                        return (
                                            <button
                                                key={skill}
                                                onClick={() => toggleSkill(skill)}
                                                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${isSelected
                                                        ? 'bg-pairon-accent text-white'
                                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                                    }`}
                                            >
                                                {isSelected && <Check className="w-3 h-3 inline mr-1" />}
                                                {skill}
                                            </button>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        )}

                        {/* Step 2: Interests */}
                        {step === 2 && (
                            <motion.div
                                key="step-2"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.2 }}
                            >
                                <h2 className="font-display text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                    What interests you?
                                </h2>
                                <p className="text-gray-500 dark:text-gray-400 mb-2">
                                    Select at least 2 topics you'd love to build around
                                </p>
                                <p className="text-sm text-blue-500 font-medium mb-4">
                                    {selectedInterests.length} selected {selectedInterests.length < 2 && `(need ${2 - selectedInterests.length} more)`}
                                </p>

                                <Input
                                    value={interestSearch}
                                    onChange={(e) => setInterestSearch(e.target.value)}
                                    placeholder="Search interests..."
                                    className="rounded-xl mb-4"
                                />

                                <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
                                    {filteredInterests.map((interest) => {
                                        const isSelected = selectedInterests.includes(interest);
                                        return (
                                            <button
                                                key={interest}
                                                onClick={() => toggleInterest(interest)}
                                                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${isSelected
                                                        ? 'bg-blue-500 text-white'
                                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                                    }`}
                                            >
                                                {isSelected && <Check className="w-3 h-3 inline mr-1" />}
                                                {interest}
                                            </button>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        )}

                        {/* Step 3: Done */}
                        {step === 3 && (
                            <motion.div
                                key="step-3"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.2 }}
                                className="text-center py-4"
                            >
                                <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
                                    <Sparkles className="w-10 h-10 text-green-500" />
                                </div>

                                <h2 className="font-display text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                    You're all set!
                                </h2>
                                <p className="text-gray-500 dark:text-gray-400 mb-6">
                                    Your profile is {completionPercentage()}% complete
                                </p>

                                {/* Profile Preview */}
                                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-2xl p-6 text-left mb-6 max-w-sm mx-auto">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="w-12 h-12 rounded-full bg-pairon-accent/10 flex items-center justify-center">
                                            <span className="text-lg font-bold text-pairon-accent">
                                                {user?.name?.charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="font-semibold text-gray-900 dark:text-white">{user?.name}</p>
                                            <p className="text-xs text-gray-500 capitalize">{experienceLevel}</p>
                                        </div>
                                    </div>

                                    {bio && (
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{bio}</p>
                                    )}

                                    <div className="mb-2">
                                        <p className="text-xs font-medium text-gray-400 mb-1">Skills</p>
                                        <div className="flex flex-wrap gap-1">
                                            {selectedSkills.slice(0, 5).map(s => (
                                                <span key={s} className="px-2 py-0.5 bg-pairon-accent/10 text-pairon-accent rounded-full text-xs">{s}</span>
                                            ))}
                                            {selectedSkills.length > 5 && (
                                                <span className="text-xs text-gray-400">+{selectedSkills.length - 5} more</span>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-xs font-medium text-gray-400 mb-1">Interests</p>
                                        <div className="flex flex-wrap gap-1">
                                            {selectedInterests.slice(0, 4).map(i => (
                                                <span key={i} className="px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded-full text-xs">{i}</span>
                                            ))}
                                            {selectedInterests.length > 4 && (
                                                <span className="text-xs text-gray-400">+{selectedInterests.length - 4} more</span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <Button
                                    onClick={handleFinish}
                                    disabled={isSubmitting}
                                    className="pairon-btn-primary px-8 py-3 h-auto"
                                >
                                    {isSubmitting ? 'Saving...' : 'Start Exploring →'}
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Navigation Buttons */}
                    {step < 3 && (
                        <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                            <div>
                                {step > 0 ? (
                                    <Button variant="ghost" onClick={handleBack} className="flex items-center gap-1">
                                        <ChevronLeft className="w-4 h-4" />
                                        Back
                                    </Button>
                                ) : (
                                    <Button
                                        variant="ghost"
                                        onClick={async () => {
                                            await updateProfile({ onboardingComplete: true });
                                            navigate('/dashboard');
                                        }}
                                        className="text-gray-400 text-sm"
                                    >
                                        Skip for now
                                    </Button>
                                )}
                            </div>

                            <Button
                                onClick={handleNext}
                                disabled={!canProceed()}
                                className="pairon-btn-primary flex items-center gap-1"
                            >
                                Continue
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                    )}
                </motion.div>
            </div>
        </div>
    );
}
