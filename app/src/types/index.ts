// User Types
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  skills: string[];
  interests: string[];
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  bio: string;
  credits: number;
  reputation: number;
  completedProjects: number;
  createdAt: Date;
  updatedAt: Date;
  lastActive: Date;
  isOnline: boolean;
  previousMatches: string[];
  badges: Badge[];
  onboardingComplete: boolean;
  warnings: number;
  permanentRemark: boolean;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: Date;
}

export interface UserProfile {
  name: string;
  skills: string[];
  interests: string[];
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  bio: string;
}

// Authentication Types
export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  password: string;
  name: string;
}

// Matching Types
export type MatchMode = 'sprint' | 'challenge' | 'build';

export interface MatchModeConfig {
  id: MatchMode;
  name: string;
  duration: number; // in hours
  description: string;
  icon: string;
}

export interface MatchRequest {
  userId: string;
  mode: MatchMode;
  skills: string[];
  interests: string[];
  timestamp: Date;
}

export interface Match {
  id: string;
  user1Id: string;
  user2Id: string;
  mode: MatchMode;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  startedAt: Date;
  endsAt: Date;
  projectIdea?: ProjectIdea;
  matchScore: number;
}

export interface ProjectIdea {
  title: string;
  description: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

// Collaboration Types
export interface CollaborationSession {
  id: string;
  matchId: string;
  participants: string[];
  messages: Message[];
  tasks: Task[];
  submission?: Submission;
  status: 'active' | 'completed' | 'abandoned';
  startedAt: Date;
  endsAt: Date;
}

export interface Message {
  id: string;
  senderId: string;
  content: string;
  timestamp: Date;
  type: 'text' | 'system';
}

export type TaskStatus = 'todo' | 'in-progress' | 'done';

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  assigneeId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Submission {
  link: string;
  description: string;
  submittedAt: Date;
  submittedBy: string;
}

// Credit System Types
export interface CreditTransaction {
  id: string;
  userId: string;
  amount: number;
  type: 'earned' | 'spent';
  source: CreditSource;
  description: string;
  createdAt: Date;
}

export type CreditSource =
  | 'session_complete'
  | 'submission'
  | 'positive_feedback'
  | 'help_user'
  | 'priority_matching'
  | 'profile_boost'
  | 'unlock_ideas';

export interface CreditReward {
  source: CreditSource;
  amount: number;
  description: string;
}

// Reputation Types
export type RatingLevel = 'helpful' | 'very-helpful' | 'exceptional';

export interface Rating {
  id: string;
  sessionId: string;
  raterId: string;
  ratedId: string;
  rating: RatingLevel;
  feedback?: string;
  createdAt: Date;
}

export interface ReputationStats {
  totalRatings: number;
  averageRating: number;
  helpfulCount: number;
  veryHelpfulCount: number;
  exceptionalCount: number;
}

// Admin Types
export interface AdminDashboardStats {
  activeSessions: number;
  totalUsers: number;
  matchesToday: number;
  reportedUsers: number;
}

export interface Report {
  id: string;
  reporterId: string;
  reportedId: string;
  reason: string;
  description: string;
  status: 'pending' | 'reviewed' | 'resolved';
  createdAt: Date;
}

// UI Types
export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

export interface NavItem {
  label: string;
  href: string;
  icon?: string;
}

// Socket.io Events
export interface ServerToClientEvents {
  'match:found': (match: Match) => void;
  'match:cancelled': (reason: string) => void;
  'session:message': (message: Message) => void;
  'session:task-updated': (task: Task) => void;
  'session:timer-update': (timeRemaining: number) => void;
  'user:status-change': (userId: string, isOnline: boolean) => void;
}

export interface ClientToServerEvents {
  'match:request': (request: MatchRequest) => void;
  'match:cancel': (userId: string) => void;
  'session:send-message': (sessionId: string, content: string) => void;
  'session:update-task': (sessionId: string, task: Task) => void;
  'session:submit': (sessionId: string, submission: Submission) => void;
  'user:join-session': (sessionId: string) => void;
  'user:leave-session': (sessionId: string) => void;
}
