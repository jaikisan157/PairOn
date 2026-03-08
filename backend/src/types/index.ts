import { Document } from 'mongoose';

// User Types
export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  avatar?: string;
  skills: string[];
  interests: string[];
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  bio: string;
  credits: number;
  reputation: number;
  completedProjects: number;
  previousMatches: string[];
  badges: IBadge[];
  isOnline: boolean;
  lastActive: Date;
  loginSessionId?: string;
  role: 'user' | 'admin';
  // Moderation
  warnings: number;
  permanentRemark: boolean;
  remarkRemovedAt?: Date;
  chatPriority: number;
  onboardingComplete: boolean;
  googleId?: string;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

export interface IBadge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt: Date;
}

// Match Types
export type MatchMode = 'sprint' | 'challenge' | 'build';

export interface IMatch extends Document {
  user1Id: string;
  user2Id: string;
  mode: MatchMode;
  status: 'pending' | 'active' | 'completed' | 'cancelled';
  startedAt: Date;
  endsAt: Date;
  projectIdea?: IProjectIdea;
  matchScore: number;
}

export interface IProjectIdea {
  title: string;
  description: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

// Collaboration Types
export interface ICollaborationSession extends Document {
  matchId: string;
  participants: string[];
  messages: IMessage[];
  tasks: ITask[];
  submission?: ISubmission;
  status: 'active' | 'completed' | 'abandoned' | 'ended' | 'partner_skipped' | 'mutual_quit';
  quitterId?: string;
  startedAt: Date;
  endsAt: Date;
}

export interface IMessage {
  id: string;
  senderId: string;
  content: string;
  timestamp: Date;
  type: 'text' | 'system' | 'ai';
}

export type TaskStatus = 'todo' | 'in-progress' | 'done';

export interface ITask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  assigneeId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISubmission {
  link: string;
  description: string;
  submittedAt: Date;
  submittedBy: string;
}

// Credit Types
export interface ICreditTransaction extends Document {
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
  | 'unlock_ideas'
  | 'quickchat_positive'
  | 'daily_streak'
  | 'profile_complete'
  | 'certificate';

// Quick Connect Types
export type QuickChatMode = 'doubt' | 'tech-talk';

export interface IQuickChat extends Document {
  participants: string[];
  mode: QuickChatMode;
  topic?: string; // max 50 chars, doubt mode only
  messages: IMessage[];
  status: 'active' | 'ended';
  ratings: Array<{ userId: string; rating: 'helpful' | 'not-helpful' }>;
  createdAt: Date;
  endedAt?: Date;
}

// Collaboration Proposal Types
export type ProposalStatus = 'pending' | 'accepted' | 'declined' | 'expired';

export interface ICollabProposal extends Document {
  proposerId: string;
  recipientId: string;
  mode: MatchMode;
  projectIdea: IProjectIdea;
  ideaSource: 'user' | 'ai';
  message?: string;
  status: ProposalStatus;
  quickChatId?: string; // reference to the Quick Connect chat it came from
  createdAt: Date;
  expiresAt: Date;
}

// Rating Types
export type RatingLevel = 'helpful' | 'very-helpful' | 'exceptional';

export interface IRating extends Document {
  sessionId: string;
  raterId: string;
  ratedId: string;
  rating: RatingLevel;
  feedback?: string;
  createdAt: Date;
}

// Report Types
export interface IReport extends Document {
  reporterId: string;
  reportedId: string;
  reason: string;
  description: string;
  status: 'pending' | 'reviewed' | 'resolved';
  createdAt: Date;
}

// JWT Payload
export interface JWTPayload {
  userId: string;
  email: string;
  role: 'user' | 'admin';
  loginSessionId?: string;
}

// Socket.io Events
export interface ServerToClientEvents {
  'match:found': (match: IMatch) => void;
  'match:cancelled': (reason: string) => void;
  'match:waiting': (message: string) => void;
  'match:error': (message: string) => void;
  'session:message': (message: IMessage) => void;
  'session:task-updated': (task: ITask) => void;
  'session:timer-update': (timeRemaining: number) => void;
  'session:completed': (submission: ISubmission) => void;
  'session:time-up': () => void;
  'user:status-change': (userId: string, isOnline: boolean) => void;
  // Quick Connect
  'quickchat:matched': (data: { chatId: string; partnerId: string; partnerName: string; mode: QuickChatMode; topic?: string }) => void;
  'quickchat:message': (message: IMessage) => void;
  'quickchat:ended': (chatId: string) => void;
  'quickchat:waiting': (message: string) => void;
  'quickchat:warning': (data: { warningCount: number; message: string }) => void;
  'quickchat:blocked': (message: string) => void;
  'quickchat:rated': (chatId: string) => void;
  // Collab Proposals
  'collab:proposal-received': (proposal: any) => void;
  'collab:proposal-accepted': (data: { proposalId: string; match: any }) => void;
  'collab:proposal-declined': (proposalId: string) => void;
  'collab:ai-ideas': (ideas: IProjectIdea[]) => void;
}

export interface ClientToServerEvents {
  'match:request': (data: { userId: string; mode: MatchMode; skills: string[]; interests: string[] }) => void;
  'match:cancel': (userId: string) => void;
  'session:send-message': (sessionId: string, content: string) => void;
  'session:update-task': (sessionId: string, task: ITask) => void;
  'session:submit': (sessionId: string, submission: ISubmission) => void;
  'user:join-session': (sessionId: string) => void;
  'user:leave-session': (sessionId: string) => void;
  'user:online': (userId: string) => void;
  // Quick Connect
  'quickchat:find': (data: { mode: QuickChatMode; topic?: string }) => void;
  'quickchat:cancel': () => void;
  'quickchat:message': (chatId: string, content: string) => void;
  'quickchat:end': (chatId: string) => void;
  'quickchat:rate': (chatId: string, rating: 'helpful' | 'not-helpful') => void;
  // Collab Proposals
  'collab:propose': (data: { recipientId: string; mode: MatchMode; projectIdea: IProjectIdea; ideaSource: 'user' | 'ai'; message?: string; quickChatId?: string }) => void;
  'collab:accept': (proposalId: string) => void;
  'collab:decline': (proposalId: string) => void;
  'collab:generate-ideas': (partnerId: string) => void;
}
