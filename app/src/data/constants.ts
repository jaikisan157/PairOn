import type { MatchModeConfig, CreditReward, NavItem } from '@/types';

export const MATCH_MODES: MatchModeConfig[] = [
  {
    id: 'sprint',
    name: '3-Hour Sprint',
    duration: 3,
    description: 'Quick focused session for small tasks and prototypes.',
    icon: 'zap',
  },
  {
    id: 'challenge',
    name: '48-Hour Challenge',
    duration: 48,
    description: 'Weekend build for more substantial projects.',
    icon: 'target',
  },
  {
    id: 'build',
    name: '7-Day Build',
    duration: 168,
    description: 'Full week collaboration for comprehensive projects.',
    icon: 'calendar',
  },
];

export const CREDIT_REWARDS: CreditReward[] = [
  { source: 'session_complete', amount: 50, description: 'Complete a sprint' },
  { source: 'submission', amount: 30, description: 'Submit project link' },
  { source: 'positive_feedback', amount: 40, description: 'Receive positive feedback' },
  { source: 'help_user', amount: 20, description: 'Help another user' },
];

export const CREDIT_COSTS = {
  priority_matching: 100,
  profile_boost: 150,
  unlock_ideas: 75,
};

export const SKILLS_LIST = [
  'React',
  'Vue',
  'Angular',
  'TypeScript',
  'JavaScript',
  'Node.js',
  'Python',
  'Go',
  'Rust',
  'Java',
  'C#',
  'PHP',
  'Ruby',
  'Swift',
  'Kotlin',
  'Flutter',
  'React Native',
  'SQL',
  'MongoDB',
  'PostgreSQL',
  'AWS',
  'Docker',
  'Kubernetes',
  'GraphQL',
  'REST API',
  'WebSocket',
  'UI Design',
  'UX Design',
  'Figma',
  'Adobe XD',
  'Tailwind CSS',
  'Sass',
  'CSS',
  'HTML',
  'Git',
  'CI/CD',
  'Testing',
  'Machine Learning',
  'Data Analysis',
  'Blockchain',
];

export const INTERESTS_LIST = [
  'Web Development',
  'Mobile Development',
  'Desktop Applications',
  'Game Development',
  'AI/ML',
  'Data Science',
  'DevOps',
  'Cloud Computing',
  'Cybersecurity',
  'Blockchain',
  'IoT',
  'Open Source',
  'Startups',
  'SaaS',
  'E-commerce',
  'Social Media',
  'Education',
  'Healthcare',
  'Finance',
  'Entertainment',
];

export const NAV_ITEMS: NavItem[] = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Modes', href: '#modes' },
  { label: 'Safety', href: '#safety' },
];

export const TESTIMONIALS = [
  {
    id: '1',
    quote: 'Finally a place to ship without endless planning. The time constraint forces you to focus on what matters.',
    name: 'Marcus Chen',
    role: 'Indie Developer',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face',
  },
  {
    id: '2',
    quote: 'The time limit forces clarity. We shipped a working prototype in just 3 hours. Incredible!',
    name: 'Elena Rodriguez',
    role: 'Product Designer',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop&crop=face',
  },
  {
    id: '3',
    quote: 'Met a co-founder here during a 7-day build. We are still working together six months later.',
    name: 'James Wilson',
    role: 'Startup Founder',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop&crop=face',
  },
];

export const FEATURES = [
  {
    title: 'Intelligent Matching',
    description: 'Our algorithm pairs you based on complementary skills, shared interests, and reputation.',
    icon: 'brain',
  },
  {
    title: 'Real-time Collaboration',
    description: 'Chat, plan, and build together with integrated workspace tools.',
    icon: 'message-square',
  },
  {
    title: 'Earn Credits',
    description: 'Complete sessions and receive positive feedback to unlock premium features.',
    icon: 'coins',
  },
];

export const SAFETY_FEATURES = [
  {
    title: 'Report Anytime',
    description: 'Easy reporting system to maintain a respectful community.',
    icon: 'shield',
  },
  {
    title: 'Fair Credit Caps',
    description: 'Daily limits prevent abuse and ensure fair play.',
    icon: 'scale',
  },
  {
    title: 'Active Moderation',
    description: 'Our team reviews reports and takes action quickly.',
    icon: 'users',
  },
];
