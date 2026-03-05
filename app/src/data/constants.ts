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

// Detailed rules shown before starting a challenge
export const CHALLENGE_RULES: Record<string, {
  title: string;
  severity: 'Low' | 'Medium' | 'High';
  severityColor: string;
  durationLabel: string;
  restPolicy: string;
  rules: string[];
  warnings: string[];
  commitmentLevel: string;
}> = {
  sprint: {
    title: '3-Hour Sprint',
    severity: 'Low',
    severityColor: 'text-green-500',
    durationLabel: '3 hours of focused building',
    restPolicy: 'No rest breaks — it\'s a sprint! Stay focused for the full 3 hours.',
    commitmentLevel: 'Light commitment. Perfect for a quick prototype or proof of concept.',
    rules: [
      'You and your partner will collaborate for exactly 3 hours.',
      'Both participants must stay active and contribute.',
      'Communicate clearly about your approach and task division.',
      'Submit at least a working demo or significant progress by the end.',
      'Rate your partner honestly after the session.',
    ],
    warnings: [
      'You cannot leave without your partner\'s agreement.',
      'Force-quitting will reduce your reputation.',
      'Your abandoned partner will receive 10 credits as compensation.',
    ],
  },
  challenge: {
    title: '48-Hour Challenge',
    severity: 'Medium',
    severityColor: 'text-yellow-500',
    durationLabel: '48 hours (2 full days)',
    restPolicy: 'You may take a 30-minute break every 2 hours (optional). Coordinate rest times with your partner.',
    commitmentLevel: 'Moderate commitment. Plan your weekend around this challenge.',
    rules: [
      'This is a 48-hour challenge — plan accordingly before starting.',
      'You are expected to be available and responsive throughout.',
      'Coordinate working hours and rest breaks with your partner.',
      'Take 30-minute breaks every 2 hours if needed — just inform your partner.',
      'Aim for a fully functional project by the deadline.',
      'Both partners must contribute meaningfully to the codebase.',
    ],
    warnings: [
      'You CANNOT skip or abandon this challenge once started.',
      'Leaving requires a formal request that your partner must approve.',
      'Unapproved exits will significantly reduce your reputation.',
      'Your abandoned partner will receive 10 credits as compensation.',
      'Repeated abandonments may result in temporary matchmaking restrictions.',
    ],
  },
  build: {
    title: '7-Day Build',
    severity: 'High',
    severityColor: 'text-red-500',
    durationLabel: '7 full days of collaboration',
    restPolicy: 'Take 30-minute breaks every 2 hours (recommended). You can set "away" status for sleep, but stay responsive during working hours.',
    commitmentLevel: 'High commitment. This is a serious project — treat it like a real team sprint.',
    rules: [
      'This is a 7-day build — you are committing to a full week of collaboration.',
      'Establish a daily working schedule with your partner on Day 1.',
      'Daily check-ins are required — share progress and blockers.',
      'Take breaks as needed but communicate your availability.',
      'The project should be demo-ready by Day 7.',
      'Both partners must contribute substantially to earn full credits.',
      'Document your work and create a proper README.',
    ],
    warnings: [
      'This is a HIGH severity commitment — do NOT start unless you can commit for 7 days.',
      'You CANNOT leave without your partner\'s explicit approval.',
      'Unauthorized exits will result in major reputation loss.',
      'Your abandoned partner will receive 10 credits as compensation.',
      'Multiple abandonments will flag your account for review.',
      'Completing a 7-day build earns you the highest credits and reputation.',
    ],
  },
};

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
