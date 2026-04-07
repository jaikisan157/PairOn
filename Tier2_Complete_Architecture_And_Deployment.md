# PairOn — Complete Architecture, Internals & Deployment Guide (Premium Tier 2)

> **This is the definitive technical manual for PairOn.** It covers every page, every API route, every database model, every Socket.IO event, the matchmaking algorithm, content moderation engine, credit/reputation economy, the collaborative IDE internals, AI integration, and a full production deployment guide. This document is designed so that you can understand, extend, and monetize PairOn with complete confidence.

---

# 📚 Table of Contents

| # | Chapter | Page |
|---|---------|------|
| 1 | [System Architecture Overview](#chapter-1-system-architecture-overview) | 2 |
| 2 | [Tech Stack Breakdown](#chapter-2-tech-stack-breakdown) | 3 |
| 3 | [Complete File & Folder Structure](#chapter-3-complete-file--folder-structure) | 4 |
| 4 | [Database Schemas (Every Model Explained)](#chapter-4-database-schemas) | 6 |
| 5 | [Authentication System](#chapter-5-authentication-system) | 9 |
| 6 | [Frontend Pages & Routing](#chapter-6-frontend-pages--routing) | 12 |
| 7 | [Real-Time Engine (Socket.IO)](#chapter-7-real-time-engine-socketio) | 16 |
| 8 | [The Matchmaking Algorithm](#chapter-8-the-matchmaking-algorithm) | 20 |
| 9 | [The Collaborative IDE](#chapter-9-the-collaborative-ide) | 22 |
| 10 | [Quick Connect (Anonymous Chat)](#chapter-10-quick-connect) | 24 |
| 11 | [Friends & Direct Messaging](#chapter-11-friends--direct-messaging) | 25 |
| 12 | [Credits & Reputation Economy](#chapter-12-credits--reputation-economy) | 27 |
| 13 | [Content Moderation Engine](#chapter-13-content-moderation-engine) | 28 |
| 14 | [AI Integration (Groq)](#chapter-14-ai-integration-groq) | 29 |
| 15 | [Community Feedback System](#chapter-15-community-feedback-system) | 30 |
| 16 | [Admin Dashboard](#chapter-16-admin-dashboard) | 31 |
| 17 | [Frontend State Management](#chapter-17-frontend-state-management) | 32 |
| 18 | [REST API Reference (Every Endpoint)](#chapter-18-rest-api-reference) | 34 |
| 19 | [Socket.IO Event Reference (Every Event)](#chapter-19-socketio-event-reference) | 38 |
| 20 | [Production Deployment Guide](#chapter-20-production-deployment-guide) | 42 |
| 21 | [Security Architecture](#chapter-21-security-architecture) | 46 |
| 22 | [Scaling & Performance](#chapter-22-scaling--performance) | 47 |
| 23 | [Monetization Strategies](#chapter-23-monetization-strategies) | 48 |
| 24 | [Extending PairOn (Feature Ideas)](#chapter-24-extending-pairon) | 49 |

---

# Chapter 1: System Architecture Overview

PairOn is a **MERN stack** application (MongoDB, Express, React, Node.js) supercharged with WebSockets for real-time interactions and WebContainers for zero-cost in-browser code execution.

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER'S BROWSER                           │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  React App   │  │ Monaco Editor│  │  WebContainer (Node)   │ │
│  │  (Vite/TS)   │  │  (VS Code)   │  │  (Runs code locally)   │ │
│  └──────┬───────┘  └──────┬───────┘  └────────────────────────┘ │
│         │                 │                                     │
│         │    Socket.IO    │   REST API (Axios)                  │
└─────────┼─────────────────┼─────────────────────────────────────┘
          │                 │
          ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                     NODE.JS BACKEND                             │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │  Express API │  │  Socket.IO   │  │  Groq AI Proxy         │ │
│  │  (REST)      │  │  (Real-time) │  │  (LLM Calls)           │ │
│  └──────┬───────┘  └──────┬───────┘  └────────────────────────┘ │
│         │                 │                                     │
│         ▼                 ▼                                     │
│  ┌─────────────────────────────────────┐                        │
│  │          MongoDB Atlas              │                        │
│  │  (Users, Messages, Sessions, etc.)  │                        │
│  └─────────────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

### Why This Architecture?
Traditional collaborative IDEs require **heavy server-side containers** (Docker instances per user session), costing $50-200/month in compute. PairOn uses **WebContainers** by StackBlitz — the entire Node.js runtime runs *inside the user's browser tab*. The backend only relays keystroke deltas via Socket.IO. **Your server cost is effectively $0 for code execution.**

---

# Chapter 2: Tech Stack Breakdown

| Layer | Technology | Why It Was Chosen |
|-------|-----------|-------------------|
| **Frontend Framework** | React 18 + TypeScript | Industry standard, massive ecosystem, type safety |
| **Build Tool** | Vite | 10x faster than CRA, instant HMR |
| **Styling** | Tailwind CSS + Shadcn/Radix UI | Utility-first CSS with pre-built accessible components |
| **Animations** | Framer Motion | Declarative animations for React |
| **Code Editor** | Monaco Editor (`@monaco-editor/react`) | Same engine as VS Code — syntax highlighting, intellisense |
| **Browser Runtime** | WebContainers (`@webcontainer/api`) | Full Node.js runtime in the browser — zero server cost |
| **Backend Framework** | Express.js + TypeScript | Lightweight, flexible, Socket.IO native support |
| **Database** | MongoDB Atlas + Mongoose | Schema-flexible document store, free tier available |
| **Real-Time** | Socket.IO | Bi-directional WebSocket wrapper with fallback and rooms |
| **Auth** | JWT + bcrypt + Google OAuth + GitHub OAuth | Secure token-based auth with social login |
| **AI** | Groq API (Llama 3.3 70B) | Near-instant inference speeds for real-time coding assistance |
| **Email** | Brevo (Sendinblue) | 300 free emails/day for OTP verification |
| **Deployment** | Vercel (frontend) + Render (backend) | Free tiers, auto-deploy on git push |

---

# Chapter 3: Complete File & Folder Structure

```
PairOn/
├── app/                              # ── FRONTEND ──────────────────
│   ├── src/
│   │   ├── pages/                    # Every screen in the application
│   │   │   ├── LandingPage.tsx       # Public marketing/landing page
│   │   │   ├── LoginPage.tsx         # Email/password + Google + GitHub login
│   │   │   ├── RegisterPage.tsx      # New account registration with OTP
│   │   │   ├── OnboardingPage.tsx    # First-time user skill/interest setup
│   │   │   ├── DashboardPage.tsx     # Main hub — active sessions, history, stats
│   │   │   ├── CollaborationPage.tsx # THE CORE — live IDE + chat + tasks
│   │   │   ├── QuickConnectPage.tsx  # Anonymous instant chat matchmaking
│   │   │   ├── FriendsPage.tsx       # Friend requests, friend list, online status
│   │   │   ├── MessagesPage.tsx      # WhatsApp-style persistent DMs
│   │   │   ├── ProfilePage.tsx       # Edit profile, skills, bio, GitHub link
│   │   │   ├── UserProfileViewPage.tsx # View another user's public profile
│   │   │   ├── ProjectsPage.tsx      # Saved project history from sessions
│   │   │   ├── CreditsPage.tsx       # Credit balance, transaction history
│   │   │   ├── CommunityPage.tsx     # Community feedback/feature request board
│   │   │   └── AdminDashboardPage.tsx # Admin-only user management panel
│   │   │
│   │   ├── components/               # Reusable UI building blocks
│   │   │   ├── ui/                   # Shadcn/Radix primitives (40+ components)
│   │   │   ├── CollabIDE.tsx         # The collaborative code editor component
│   │   │   ├── CollabIDEHelpers.tsx  # File tree, tabs, terminal helpers
│   │   │   ├── CollabIDEMobile.tsx   # Mobile-optimized IDE layout
│   │   │   ├── Navigation.tsx        # Top nav + mobile bottom nav
│   │   │   ├── NotificationBell.tsx  # Real-time notification dropdown
│   │   │   ├── GlobalNotifier.tsx    # Toast notifications for friend requests etc.
│   │   │   ├── GlobalThemeToggle.tsx # Light/dark mode toggle
│   │   │   ├── MatchConfirmModal.tsx # "Accept match?" confirmation popup
│   │   │   ├── GlobalCallUI.tsx      # WebRTC voice call overlay
│   │   │   └── UserProfileModal.tsx  # Quick-view user profile popup
│   │   │
│   │   ├── context/                  # React Context providers (global state)
│   │   │   ├── AuthContext.tsx       # Login state, token management
│   │   │   ├── ThemeContext.tsx      # Light/dark mode persistence
│   │   │   ├── MatchingContext.tsx   # Matchmaking queue state
│   │   │   ├── CallContext.tsx       # WebRTC call state management
│   │   │   └── NotificationContext.tsx # Notification badge counts
│   │   │
│   │   ├── lib/                      # Utility libraries
│   │   │   ├── api.ts               # Axios instance with JWT interceptor
│   │   │   ├── socket.ts            # Socket.IO client singleton
│   │   │   ├── audio.ts             # Sound effects for notifications
│   │   │   ├── deviceDetect.ts      # Mobile/desktop detection
│   │   │   └── utils.ts             # General helper functions
│   │   │
│   │   ├── sections/                 # Landing page sections
│   │   ├── types/                    # TypeScript interfaces
│   │   ├── data/constants.ts         # Topic lists, config constants
│   │   ├── App.tsx                   # Root component with routing
│   │   └── main.tsx                  # Vite entry point
│   │
│   ├── .env.example                  # Frontend env template
│   ├── vite.config.ts                # Vite build configuration
│   ├── tailwind.config.js            # Tailwind theme customization
│   └── vercel.json                   # Vercel deployment config (SPA rewrites)
│
├── backend/                          # ── BACKEND ───────────────────
│   ├── src/
│   │   ├── models/                   # Mongoose database schemas
│   │   │   ├── User.ts              # User account + profile + moderation fields
│   │   │   ├── Match.ts             # Match records + CollaborationSession
│   │   │   ├── DirectMessage.ts     # Persistent DM threads
│   │   │   ├── Friend.ts            # Friendship (pending/accepted/declined)
│   │   │   ├── Project.ts           # Saved completed project snapshots
│   │   │   ├── QuickChat.ts         # Anonymous quick chat sessions
│   │   │   ├── CollabProposal.ts    # Friend-to-friend collab invitations
│   │   │   ├── Certificate.ts       # Collaboration completion certificates
│   │   │   ├── CreditTransaction.ts # Credit earn/spend audit log
│   │   │   └── Feedback.ts          # Community feedback posts
│   │   │
│   │   ├── routes/                   # Express REST API endpoints
│   │   │   ├── auth.ts              # Register, Login, OAuth, OTP, /me
│   │   │   ├── users.ts            # Profile CRUD, search, stats
│   │   │   ├── friends.ts          # Send/accept/decline/remove friends
│   │   │   ├── dm.ts               # DM threads, send message, delete thread
│   │   │   ├── projects.ts         # Save/list/delete project snapshots
│   │   │   ├── credits.ts          # Credit history, certificates, remarks
│   │   │   └── feedback.ts         # Community feedback CRUD + likes
│   │   │
│   │   ├── services/                 # Socket.IO event handlers
│   │   │   ├── socket.ts           # Core socket: matchmaking, IDE relay, calls
│   │   │   ├── challenge.ts        # Challenge mode (3hr/24hr/7day sessions)
│   │   │   ├── quickChat.ts        # Quick Connect anonymous chat
│   │   │   ├── collabProposal.ts   # Friend collaboration proposals
│   │   │   └── creditService.ts    # Credit/reputation award functions
│   │   │
│   │   ├── middleware/auth.ts       # JWT verification + admin check
│   │   ├── utils/
│   │   │   ├── matchingAlgorithm.ts # Weighted score matching + project idea gen
│   │   │   ├── contentModeration.ts # Profanity filter + warning system
│   │   │   ├── otp.ts              # OTP generation + Brevo email sending
│   │   │   └── topics.ts           # 100+ project topic strings
│   │   │
│   │   └── server.ts               # Express + Socket.IO bootstrap
│   │
│   ├── .env.example                 # Backend env template
│   └── render.yaml                  # Render.com deployment config
```

---

# Chapter 4: Database Schemas

Every piece of data in PairOn is stored in MongoDB via Mongoose schemas. Here is every model explained in detail.

## 4.1 User Model (`User.ts`)

The central entity. Every person on the platform is a User document.

| Field | Type | Purpose |
|-------|------|---------|
| `email` | String (unique) | Login identifier, lowercase + trimmed |
| `password` | String | Hashed with bcrypt (12 salt rounds) before save |
| `name` | String | Display name |
| `avatar` | String | Profile picture URL (from Google/GitHub or custom) |
| `skills` | String[] | e.g. `["react", "node.js", "python"]` — used for matching |
| `interests` | String[] | e.g. `["web dev", "games"]` — used for matching |
| `experienceLevel` | Enum | `beginner` / `intermediate` / `advanced` / `expert` |
| `bio` | String | Free-text profile description |
| `credits` | Number | Virtual currency (starts at 100) |
| `reputation` | Number | Trust score (starts at 100, min 0) |
| `completedProjects` | Number | Counter of finished collaborations |
| `previousMatches` | String[] | Array of userIds previously matched with |
| `badges` | Badge[] | Achievement badges with id, name, description, icon |
| `isOnline` | Boolean | Real-time online status |
| `lastActive` | Date | Timestamp of last activity |
| `loginSessionId` | String | UUID for single-device enforcement |
| `role` | Enum | `user` / `admin` |
| `warnings` | Number | Content moderation warning count |
| `permanentRemark` | Boolean | Flagged after 3+ warnings |
| `chatPriority` | Number | Matching priority (100 = clean, 10 = flagged) |
| `onboardingComplete` | Boolean | Has the user finished the onboarding wizard? |
| `googleId` | String | Google OAuth identifier |
| `githubAccessToken` | String | GitHub OAuth token for repo access |
| `githubUsername` | String | Connected GitHub username |

**Key Behavior:** The `pre('save')` hook automatically hashes the password with bcrypt whenever it is modified. The `comparePassword()` instance method handles login verification.

## 4.2 Match Model (`Match.ts`)

Created when two users are paired together.

| Field | Type | Purpose |
|-------|------|---------|
| `user1Id` | String | First participant's userId |
| `user2Id` | String | Second participant's userId |
| `mode` | Enum | `sprint` (3hr) / `challenge` (24hr) / `build` (7 day) |
| `matchScore` | Number | Algorithm-calculated compatibility score (0-100) |
| `projectIdea` | Object | `{ title, description, category, difficulty }` |
| `status` | Enum | `active` / `completed` |
| `startedAt` / `endsAt` | Date | Session time boundaries |
| `sessionId` | String | Reference to the CollaborationSession |

## 4.3 CollaborationSession (embedded in `Match.ts`)

The live working session between two matched users.

| Field | Type | Purpose |
|-------|------|---------|
| `matchId` | String | Back-reference to the Match |
| `participants` | String[] | Array of two userIds |
| `messages` | Message[] | Full chat history (id, senderId, content, timestamp, type) |
| `tasks` | Task[] | Kanban task list (id, title, status, assigneeId) |
| `submission` | Object | `{ link, description, submittedBy, submittedAt }` |
| `status` | Enum | `active` / `completed` / `partner_skipped` / `mutual_quit` |
| `quitterId` | String | Who force-quit (if applicable) |
| `startedAt` / `endsAt` | Date | Session time window |

## 4.4 DirectMessage (`DirectMessage.ts`)

Persistent WhatsApp-style chat threads between friends.

| Field | Type | Purpose |
|-------|------|---------|
| `participants` | String[2] | Sorted pair of userIds (ensures unique thread per pair) |
| `messages` | Message[] | `{ id, senderId, content, timestamp, read }` |
| `lastMessage` | String | Preview text for thread list |
| `lastMessageAt` | Date | Sort order for thread list |

**Key Design Decision:** Participants are always sorted alphabetically. This guarantees that `[userA, userB]` and `[userB, userA]` always map to the same thread document.

## 4.5 Friendship (`Friend.ts`)

| Field | Type | Purpose |
|-------|------|---------|
| `requesterId` | String | Who sent the friend request |
| `recipientId` | String | Who received it |
| `status` | Enum | `pending` / `accepted` / `declined` |

**Behavior:** When a friendship is deleted (unfriend), the corresponding DM thread is also deleted automatically.

## 4.6 Project (`Project.ts`)

Saved snapshots of completed collaboration sessions.

| Field | Type | Purpose |
|-------|------|---------|
| `userId` | String | Owner of this project record |
| `sessionId` | String | Unique key (userId + sessionId = unique) |
| `partnerName` / `partnerId` | String | Who they collaborated with |
| `mode` | String | sprint / challenge / build |
| `projectIdea` | Object | Title, description |
| `status` | String | completed / partner_skipped |
| `files` | Object | Saved file tree from the IDE |
| `submissionLink` / `submissionDesc` | String | What they submitted |

**Key Behavior:** On first submission, the user earns +10 reputation (solo) or +15 reputation (paired). The `completedProjects` counter increments by 1.

## 4.7 QuickChat (`QuickChat.ts`)

Anonymous short-lived chat sessions from Quick Connect.

| Field | Type | Purpose |
|-------|------|---------|
| `participants` | String[] | Two userIds |
| `mode` | Enum | `tech-talk` / `doubt` |
| `topic` | String | For doubt mode — the question being asked |
| `messages` | Message[] | Chat history |
| `ratings` | Rating[] | `{ userId, rating: 'helpful' / 'not-helpful' }` |
| `status` | Enum | `active` / `ended` |

**Auto-close:** A server-side `setInterval` checks every 60 seconds and ends any QuickChat with 5+ minutes of inactivity.

## 4.8 Other Models

- **CollabProposal**: Friend-to-friend collaboration invitation with mode, project idea, expiry (24hr).
- **Certificate**: Generated completion certificates (costs credits). Has a unique `certificateId` for public verification.
- **CreditTransaction**: Audit log of all credit earned/spent with source, amount, and description.
- **Feedback**: Community feedback posts with title, description, category, author, and likes array.

---

# Chapter 5: Authentication System

PairOn supports **four** authentication methods.

## 5.1 Email + Password Registration

**Flow:**
1. User enters email → frontend calls `POST /api/auth/send-otp`.
2. Backend generates a 6-digit OTP, stores it in memory (5-min TTL), sends via Brevo email.
3. User enters OTP → frontend calls `POST /api/auth/verify-otp`.
4. On success, user fills password + name → `POST /api/auth/register`.
5. Password is validated (8+ chars, uppercase, lowercase, number, special char).
6. Password is hashed with bcrypt (12 rounds) via Mongoose pre-save hook.
7. A `loginSessionId` (UUID) is generated and stored on the user document.
8. A JWT is created containing `{ userId, email, role, loginSessionId }`.
9. JWT is returned to frontend, stored in localStorage.

## 5.2 Email + Password Login

**Flow:**
1. `POST /api/auth/login` with email + password.
2. Backend finds user by email, runs `user.comparePassword()` (bcrypt compare).
3. New `loginSessionId` is generated → old sessions are invalidated.
4. New JWT is issued with the fresh `loginSessionId`.

**Single-Device Enforcement:** If User A logs in on their phone, then logs in on their laptop, the phone's JWT becomes invalid because the `loginSessionId` in the token no longer matches the one stored in the database.

## 5.3 Google OAuth

**Flow (Authorization Code):**
1. Frontend redirects to Google's OAuth consent screen with `GOOGLE_CLIENT_ID`.
2. Google returns an authorization `code` to the frontend callback URL.
3. Frontend sends the `code` to `POST /api/auth/google`.
4. Backend exchanges the code for an `access_token` with Google's token endpoint.
5. Backend fetches user info (email, name, picture) from Google's userinfo API.
6. If user doesn't exist → create new account (password = random string, `googleId` = Google's ID).
7. If user exists → just log them in.
8. JWT is returned.

## 5.4 GitHub OAuth

**Flow (Two modes):**

**Sign-In Mode:**
1. Frontend opens `GET /api/auth/github/login` (no auth required).
2. Backend redirects to GitHub with `state=login:<nonce>`.
3. GitHub redirects back to `GET /api/auth/github/callback` with a `code`.
4. Backend exchanges code for access token, fetches GitHub user info + email.
5. Creates or finds user, issues JWT, redirects to frontend with `?github_token=<jwt>`.

**Account-Linking Mode:**
1. Authenticated user clicks "Connect GitHub" → `GET /api/auth/github/connect`.
2. Backend redirects to GitHub with `state=<userId>`.
3. GitHub callback detects `state` is a userId (not `login:...`), so it links the token to that user.
4. User's `githubAccessToken` and `githubUsername` are saved.

---

# Chapter 6: Frontend Pages & Routing

The frontend uses React Router v6 with two route wrappers:

- **`<PublicRoute>`**: Redirects to `/dashboard` if already logged in.
- **`<ProtectedRoute>`**: Redirects to `/login` if not logged in. Redirects to `/onboarding` if `onboardingComplete` is false.

## 6.1 Landing Page (`/`)
The first thing visitors see. A marketing page with:
- Hero section with animated gradient text
- "How It Works" 3-step explanation
- Feature showcase sections (Collaboration, Match Modes, Credits, Reputation, Safety)
- Testimonials
- Final CTA (Call to Action) with sign-up button

## 6.2 Login Page (`/login`)
- Email + password form with validation
- "Login with Google" button (OAuth redirect)
- "Login with GitHub" button (OAuth redirect)
- Handles `?github_token=` URL param for GitHub OAuth callback
- Link to register page

## 6.3 Register Page (`/register`)
- 3-step flow: Enter email → Verify OTP → Set password + name
- Real-time password strength indicator
- Validates: 8+ chars, uppercase, lowercase, number, special character

## 6.4 Onboarding Page (`/onboarding`)
- First-time setup wizard
- User selects skills (multi-select from predefined list)
- User selects interests
- User picks experience level (beginner → expert)
- Optional bio and avatar
- On complete, sets `onboardingComplete: true` and redirects to dashboard

## 6.5 Dashboard (`/dashboard`)
The main hub after login. Contains:
- **Active Sessions Panel**: Shows any in-progress collaboration sessions with countdown timers. Click to rejoin.
- **Session History**: Last 20 sessions with partner name, mode, status (completed/abandoned/quit), project idea.
- **Quick Stats**: Credits, reputation, completed projects, total matches.
- **Right Sidebar**: Online friends list with DM shortcut.
- **Find Match Button**: Opens the matchmaking flow.

## 6.6 Collaboration Page (`/collaborate`)
**This is the heart of PairOn.** It renders the full collaborative IDE:
- **Monaco Code Editor**: Syntax-highlighted editor with multi-tab support. Real-time keystroke sync via Socket.IO.
- **File Explorer**: VS Code-style tree view with create file, create folder, rename, delete. Synced in real-time.
- **Shared Terminal**: xterm.js terminal powered by WebContainers. Both users see the output.
- **Chat Panel**: Real-time messaging with content moderation. AI assistant available via `@ai` command.
- **Task Board**: Kanban-style task list (Todo / In Progress / Done). AI can suggest tasks.
- **Timer Bar**: Countdown showing remaining session time (3hr / 24hr / 7 days).
- **Submission Panel**: Submit project with link + description when done.
- **Exit System**: Request exit → partner approves/declines. Force-quit incurs reputation penalty.

## 6.7 Quick Connect (`/quick-connect`)
Anonymous instant matching:
- Choose mode: "Tech Talk" (general chat) or "Doubt" (ask a specific question)
- Enters matchmaking queue with priority based on warnings
- Matched with random online user → ephemeral chat room
- 5-minute inactivity auto-close
- Post-chat rating system (helpful / not helpful) → earns credits

## 6.8 Friends Page (`/friends`)
- **Search Users**: Find other developers by name or email
- **Pending Requests**: Incoming friend requests with accept/decline buttons
- **Friends List**: All accepted friends with online status indicator, reputation score
- **Actions**: View profile, send DM, unfriend (deletes DM history too)

## 6.9 Messages Page (`/messages`)
- WhatsApp-style interface
- Left panel: Thread list with partner names, last message preview, unread badge
- Right panel: Full message history with typing indicators
- Real-time delivery via Socket.IO
- Messages persist permanently in MongoDB

## 6.10 Profile Page (`/profile`)
- View and edit: name, bio, skills, interests, experience level, avatar
- Connect / disconnect GitHub account
- View badges
- View reputation and completed project count

## 6.11 User Profile View (`/users/:userId`)
- Public profile view of any user
- Shows: name, bio, skills, interests, experience level, reputation, badges, online status
- "Add Friend" / "Already Friends" button
- View their recent public projects

## 6.12 Projects Page (`/projects`)
- Grid of all saved project snapshots from completed sessions
- Each card shows: project idea title, partner name, mode, status, date
- Expandable to view saved file contents

## 6.13 Credits Page (`/credits`)
- Current credit balance
- Total earned / total spent breakdown
- Transaction history with pagination
- Credit pricing guide (what costs what)

## 6.14 Community Page (`/community`)
- Feedback board where users submit feature requests or bug reports
- Category filter (general, bug, feature, improvement)
- Like/upvote system
- Authors can delete their own posts

## 6.15 Admin Dashboard (`/admin`)
- Only visible to users with `role: 'admin'`
- Search and view all users
- View online status, reputation, warnings
- Content moderation oversight

---

# Chapter 7: Real-Time Engine (Socket.IO)

Socket.IO is the central nervous system connecting all clients. Here is how it works, end to end.

## 7.1 Connection Flow

1. User logs in → frontend creates Socket.IO connection passing `{ token: jwt }` in handshake auth.
2. Backend middleware verifies JWT, extracts `userId`, attaches to `socket.data`.
3. Socket automatically joins room `user:<userId>` — this is the user's personal notification channel.
4. Backend sets `user.isOnline = true` in MongoDB and broadcasts `user:status-change` to all clients.

## 7.2 Room Architecture

PairOn uses Socket.IO rooms extensively:

| Room Name | Purpose |
|-----------|---------|
| `user:<userId>` | Personal channel — DMs, friend requests, match found events |
| `session:<sessionId>` | Collaboration session — code sync, file changes |
| `challenge:<sessionId>` | Challenge mode room — chat, tasks, IDE events |
| `quickchat:<chatId>` | Quick Connect ephemeral chat room |

## 7.3 Disconnect Handling

When a socket disconnects:
1. User is marked `isOnline: false` + `lastActive: now` in MongoDB.
2. Status change is broadcast to all connected clients.
3. All active Quick Chats for the user are ended (partner notified).
4. User is removed from any matchmaking queue.
5. Challenge sessions are NOT ended — user can rejoin via `challenge:rejoin`.

---

# Chapter 8: The Matchmaking Algorithm

Located in `matchingAlgorithm.ts`. This is a **weighted multi-factor scoring system**.

## 8.1 Score Calculation

```
Final Score = (Skill Complementarity × 0.4)
            + (Interest Overlap × 0.2)
            + (Reputation Weight × 0.2)
            + (Activity Status × 0.2)
            - (Previous Match Penalty)
```

### Factor Breakdown:

**Skill Complementarity (40% weight):**
- Measures how many *unique* skills each user brings that the other doesn't have.
- Higher complementarity = users can teach each other more.
- Formula: `(uniqueSkillsCount / totalSkillsCount) × 100`

**Interest Overlap (20% weight):**
- Measures how many interests both users share.
- Higher overlap = more to talk about.
- Formula: `min(100, (overlappingInterests / totalUniqueInterests) × 200)`

**Reputation Weight (20% weight):**
- Average of both users' reputations, normalized.
- Users with higher reputation get prioritized.

**Activity Status (20% weight):**
- Both online = 100, one online = 50, neither = 0.

**Previous Match Penalty (-15):**
- If users have been matched before, score is reduced by 15 points to encourage variety.

## 8.2 Match Confirmation Flow (Challenge Mode)

1. Two users are found in the queue → `findChallengePartner()` is called.
2. A `PendingMatch` object is created with a 30-second timeout.
3. Both users receive `challenge:pending-match` with partner info + project idea.
4. Both must click "Accept" within 30 seconds.
5. If both accept → `createMatchedSession()` creates Match + CollaborationSession in MongoDB.
6. If either declines or timeout → the declining user is removed, the other is re-queued.

## 8.3 Project Idea Generation

When a match is found, a project idea is automatically generated:
1. A pool of 100+ project templates exists in `topics.ts` (e.g., "Real-time Chat App", "Pixel Art Editor").
2. The algorithm randomly picks from the pool.
3. Title variations are added (prefixes like "Modern", suffixes like "Pro") for freshness.
4. Difficulty is calculated from the average experience level of both users.

---

# Chapter 9: The Collaborative IDE

This is the crown jewel of PairOn and what makes it worth the price.

## 9.1 Monaco Editor

We embed `@monaco-editor/react` — the exact same editor engine that powers VS Code desktop.
- **Syntax highlighting** for 50+ languages out of the box.
- **IntelliSense** for JavaScript/TypeScript.
- **Multi-tab editing**: Users can have multiple files open.
- **On every keystroke**: The `onChange` callback captures the file content and emits `code:file-change` via Socket.IO to the partner.

## 9.2 WebContainers (Zero-Cost Code Execution)

When a user clicks "Run", we don't send code to the backend. Instead:
1. `@webcontainer/api` boots a full Node.js runtime inside the browser tab.
2. The file tree from Monaco is mounted into a virtual filesystem using `webcontainer.mount()`.
3. We spawn a shell process: `webcontainer.spawn('npm', ['install'])` then `webcontainer.spawn('npm', ['run', 'start'])`.
4. Process stdout/stderr is piped into an **xterm.js** terminal embedded in the UI.
5. If the process starts a web server (e.g., Vite on port 3000), WebContainer provides a URL that's rendered in an iframe as a live preview.

**This means 100 users coding simultaneously cost you $0 in server compute.**

## 9.3 Real-Time Code Sync Events

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `code:file-change` | Client → Server → Partner | `{ sessionId, path, content, senderId }` | Sync file content in real-time |
| `code:file-create` | Client → Server → Partner | `{ sessionId, path, content, senderId }` | New file appears in partner's tree |
| `code:file-delete` | Client → Server → Partner | `{ sessionId, path, senderId }` | Remove file from partner's tree |
| `code:file-rename` | Client → Server → Partner | `{ sessionId, oldPath, newPath, senderId }` | Rename in partner's file explorer |
| `code:file-lock` | Client → Server → Partner | `{ sessionId, path, userId, userName }` | Show "Partner is editing this file" |
| `code:file-unlock` | Client → Server → Partner | `{ sessionId, path, userId }` | Release the editing lock |

## 9.4 Environment Variable Security

The `.env` file gets **special treatment**. When a user edits `.env`:
1. The server maintains a separate `EnvRealStore` per session tracking ownership of each key and its real value.
2. When relaying to the partner, any keys owned by the other user are masked: `SECRET_KEY=••••••••••••`.
3. If a user tries to edit a key they don't own, the server silently reverts it.
4. If a user tries to delete a partner's key, the server re-appends it.

This prevents partners from stealing each other's API keys during collaboration.

---

# Chapter 10: Quick Connect

Quick Connect is the anonymous instant-matching chat feature.

**Modes:**
- **Tech Talk**: General conversation about tech topics.
- **Doubt**: Ask a specific coding question (topic required, max 50 chars).

**Matching Logic:**
1. User joins queue → `quickChatQueue.set(userId, { mode, topic, socketId, priority })`.
2. Priority is based on the user's warning count (clean users = 100, flagged = 10).
3. All queue members can match with each other regardless of mode.
4. Best candidate is picked (highest priority first).
5. Both join a `quickchat:<chatId>` room.

**Safety Features:**
- Content moderation on every message.
- 3 warnings → permanent remark on profile.
- 5-minute inactivity auto-close.
- Max 5 active chats per user.
- Post-chat rating system affects credits.

---

# Chapter 11: Friends & Direct Messaging

## 11.1 Friend Request Flow

1. User A searches for User B via `GET /api/users/find?q=<query>`.
2. User A sends request: `POST /api/friends/request` with `recipientId`.
3. Backend creates Friendship document with `status: 'pending'`.
4. Real-time Socket event `friend:request-received` is emitted to User B's room.
5. User B sees a toast notification and can accept or decline.
6. On accept: `friend:request-accepted` event notifies User A.

## 11.2 Direct Messaging Flow

1. User opens Messages page → `GET /api/dm/threads` returns all threads with unread counts.
2. User clicks a friend → `GET /api/dm/thread/:friendId` returns or creates the thread.
3. Opening a thread marks all incoming messages as `read: true`.
4. User types message → `POST /api/dm/thread/:friendId/send`.
5. Backend saves to MongoDB, then emits `dm:new-message` via Socket to the recipient.
6. Typing indicators: `dm:typing` / `dm:stop-typing` events relayed via Socket.

## 11.3 Unfriending

When a friendship is deleted:
1. The Friendship document is removed.
2. The entire DM thread between the two users is also deleted.
3. This is a permanent, unrecoverable action.

---

# Chapter 12: Credits & Reputation Economy

PairOn has a dual economy system.

## 12.1 Credits (Virtual Currency)

**Earning Credits:**

| Action | Credits Earned |
|--------|---------------|
| Account creation | +100 (starting balance) |
| Onboarding bonus | +25 |
| Profile complete | +10 |
| Session complete | +50 |
| Quick chat rated helpful | +5 |
| Positive feedback | +10 |
| Project submission | +15 |
| Partner force-quit compensation | +10 |

**Spending Credits:**

| Action | Credits Cost |
|--------|-------------|
| Generate certificate | -50 |
| Skill badge | -30 |
| Priority matching | -20 |
| Profile boost | -15 |
| Permanent remark removal | -100 |

## 12.2 Reputation

Reputation is a trust score that affects matching priority.

| Action | Reputation Change |
|--------|------------------|
| Starting value | 100 |
| Session complete (solo) | +10 |
| Session complete (paired) | +15 |
| Force-quit a session | -5 |
| Kicked for moderation | -10 |
| Quick chat helpful rating | +0.1 |
| Minimum value | 0 |

---

# Chapter 13: Content Moderation Engine

Located in `contentModeration.ts`. Every message in Quick Connect and Collaboration Chat passes through this filter.

## 13.1 How It Works

1. Message is normalized (lowercased, trimmed).
2. **Word-level check**: Each word is stripped of punctuation and checked against a `BLOCKED_WORDS` set (40+ explicit words).
3. **Pattern check**: The message is tested against `EXPLICIT_PATTERNS` — 10+ regex patterns catching:
   - Explicit/sexual content
   - L33t speak variations (e.g., `f*ck`, `s3x`)
   - Harassment/self-harm phrases
   - Racial slurs
   - Drug solicitation
   - Sexting indicators
   - Personal info solicitation

## 13.2 Warning Escalation

| Warning Count | Consequence |
|---------------|-------------|
| 1st | Message blocked + warning toast |
| 2nd | Message blocked + warning toast |
| 3rd | **Permanent remark** added to profile. Chat priority drops to 10. |
| In sessions: 3rd | **Kicked from session**. -10 reputation. Partner gets +10 credits. |

---

# Chapter 14: AI Integration (Groq)

PairOn uses **Groq's API** with the **Llama 3.3 70B Versatile** model.

## 14.1 Why Groq?

Groq's LPU (Language Processing Unit) delivers tokens at ~500 tokens/second — 10x faster than standard GPU inference. This makes it ideal for real-time coding assistance where latency matters.

## 14.2 How It Works

1. User types a question in the collaboration chat.
2. Frontend emits `session:ai-help` or `challenge:ai-help` via Socket.
3. Backend constructs a prompt with:
   - System prompt: "You are an AI pair programming assistant..."
   - Context: Current project idea title + last 10 chat messages
   - User's question
4. Backend calls `https://api.groq.com/openai/v1/chat/completions` with `max_tokens: 1024`.
5. Response is saved to session messages and broadcast to both users.

## 14.3 AI Task Suggestions

When users click "Suggest Tasks":
1. `challenge:suggest-tasks` event is emitted.
2. Backend sends project title + description to Groq with a prompt: "Generate 8-12 task titles as a JSON array."
3. Response is parsed and sent back as `challenge:task-suggestions`.

## 14.4 Fallback

If `GROQ_API_KEY` is not set, the AI falls back to template-based responses (basic keyword matching).

---

# Chapter 15: Community Feedback System

Users can submit feedback, feature requests, and bug reports.

**Endpoints:**
- `GET /api/feedback` — List all feedback, sorted by likes
- `POST /api/feedback` — Create new feedback `{ title, description, category }`
- `POST /api/feedback/:id/like` — Toggle like (like/unlike)
- `DELETE /api/feedback/:id` — Delete (author or admin only)

**Categories:** general, bug, feature, improvement

---

# Chapter 16: Admin Dashboard

Accessible only by users with `role: 'admin'`.

**Capabilities:**
- Search users by name or email (`GET /api/users/search`)
- View all user data: online status, reputation, warnings, role
- Monitor system health via `/health` endpoint
- Delete inappropriate feedback posts

**How to make yourself admin:** Manually update your user document in MongoDB Atlas:
```javascript
db.users.updateOne({ email: "your@email.com" }, { $set: { role: "admin" } })
```

---

# Chapter 17: Frontend State Management

PairOn uses **React Context** (not Redux) for global state.

## 17.1 Context Providers (Wrapped in `App.tsx`)

```
<ThemeProvider>         ← Light/dark mode
  <AuthProvider>        ← Login state, user data, token
    <NotificationProvider> ← Notification badge counts
      <CallProvider>    ← WebRTC voice call state
        <MatchingProvider> ← Matchmaking queue state
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </MatchingProvider>
      </CallProvider>
    </NotificationProvider>
  </AuthProvider>
</ThemeProvider>
```

## 17.2 AuthContext

- Stores: `user`, `token`, `isAuthenticated`, `isLoading`
- On mount: Checks localStorage for token → calls `GET /api/auth/me` to verify
- Provides: `login()`, `register()`, `logout()`, `updateUser()`
- On login: Connects Socket.IO with the token

## 17.3 ThemeContext

- Stores: `theme` (`light` | `dark`)
- Persists to localStorage
- Applies `dark` class to `<html>` element for Tailwind dark mode

## 17.4 MatchingContext

- Stores: `isSearching`, `matchData`, `sessionData`
- Listens for `challenge:matched`, `challenge:pending-match` Socket events
- Provides: `startSearching()`, `cancelSearch()`, `acceptMatch()`, `declineMatch()`

---

# Chapter 18: REST API Reference

## Auth Routes (`/api/auth`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/send-otp` | No | Send 6-digit OTP to email via Brevo |
| POST | `/verify-otp` | No | Verify the OTP code |
| POST | `/register` | No | Create account with email/password/name |
| POST | `/login` | No | Login with email/password, returns JWT |
| GET | `/me` | Yes | Get current user from JWT |
| POST | `/google` | No | Exchange Google auth code for JWT |
| GET | `/github/login` | No | Redirect to GitHub OAuth (sign-in) |
| GET | `/github/connect` | Yes | Redirect to GitHub OAuth (link account) |
| GET | `/github/callback` | No | GitHub OAuth callback handler |
| GET | `/github/status` | Yes | Check if GitHub is connected |
| GET | `/github/token` | Yes | Get stored GitHub access token |
| DELETE | `/github/disconnect` | Yes | Remove GitHub connection |

## User Routes (`/api/users`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/profile` | Yes | Get own profile |
| PATCH | `/profile` | Yes | Update own profile (whitelisted fields only) |
| GET | `/stats` | Yes | Get credits, reputation, project count |
| GET | `/find?q=` | Yes | Search users by name/email (for adding friends) |
| GET | `/search?query=` | Admin | Admin user search |
| GET | `/online-count` | Yes | Count of online users |
| GET | `/:id` | Yes | Get any user's public profile |

## Friend Routes (`/api/friends`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/request` | Yes | Send friend request |
| POST | `/:friendshipId/accept` | Yes | Accept friend request |
| POST | `/:friendshipId/decline` | Yes | Decline friend request |
| DELETE | `/:friendshipId` | Yes | Remove friend (deletes DMs too) |
| GET | `/list` | Yes | Get accepted friends list |
| GET | `/pending` | Yes | Get incoming pending requests |
| GET | `/status/:otherUserId` | Yes | Check friendship status with a user |

## DM Routes (`/api/dm`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/threads` | Yes | Get all DM threads with unread counts |
| GET | `/thread/:friendId` | Yes | Get or create thread, marks as read |
| POST | `/thread/:friendId/send` | Yes | Send a message (max 2000 chars) |
| DELETE | `/thread/:friendId` | Yes | Delete entire DM thread |

## Project Routes (`/api/projects`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | Yes | Get all projects for logged-in user |
| GET | `/user/:userId` | Yes | Get public projects of any user |
| POST | `/` | Yes | Save/upsert project (awards reputation on first save) |
| DELETE | `/:sessionId` | Yes | Delete a project |

## Credit Routes (`/api`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/credits/history` | Yes | Paginated transaction log |
| GET | `/credits/summary` | Yes | Balance + total earned/spent |
| GET | `/credits/pricing` | Yes | Credit costs for all actions |
| GET | `/certificates` | Yes | List user's certificates |
| POST | `/certificates/generate` | Yes | Generate certificate (costs 50 credits) |
| GET | `/certificates/verify/:id` | No | Public certificate verification |
| POST | `/credits/remove-remark` | Yes | Remove permanent remark (costs 100 credits) |

## Feedback Routes (`/api/feedback`)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/` | Yes | List all feedback, sorted by likes |
| POST | `/` | Yes | Create feedback |
| POST | `/:id/like` | Yes | Toggle like |
| DELETE | `/:id` | Yes | Delete (author or admin) |

---

# Chapter 19: Socket.IO Event Reference

## Connection & Status Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `user:status-change` | Server → All | Broadcasts userId + online boolean |
| `user:join-session` | Client → Server | Join a session room |
| `user:leave-session` | Client → Server | Leave a session room |

## Matchmaking Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `challenge:find` | Client → Server | Enter matchmaking queue with mode |
| `challenge:cancel` | Client → Server | Leave the queue |
| `challenge:waiting` | Server → Client | "Looking for a partner..." |
| `challenge:pending-match` | Server → Both | Match found, confirm within 30s |
| `challenge:confirm` | Client → Server | Accept the pending match |
| `challenge:decline` | Client → Server | Decline the pending match |
| `challenge:matched` | Server → Both | Session created, navigate to /collaborate |

## Collaboration Chat Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `challenge:message` | Bidirectional | Send/receive chat messages |
| `challenge:typing` | Client → Server | Show typing indicator to partner |
| `challenge:stop-typing` | Client → Server | Hide typing indicator |
| `challenge:warning` | Server → Client | Content moderation warning |
| `challenge:ai-help` | Client → Server | Ask AI a question |

## IDE Sync Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `code:file-change` | Client → Server → Partner | File content updated |
| `code:file-create` | Client → Server → Partner | New file created |
| `code:file-delete` | Client → Server → Partner | File deleted |
| `code:file-rename` | Client → Server → Partner | File renamed |
| `code:file-lock` | Client → Server → Partner | File is being edited |
| `code:file-unlock` | Client → Server → Partner | File released |
| `code:env-update` | Server → Both | Masked .env file sync |

## Session Lifecycle Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `challenge:submit` | Client → Server | Submit project with link + description |
| `challenge:submitted` | Server → Submitter | Confirmation of submission |
| `challenge:partner-submitted` | Server → Partner | Partner has submitted, you're now solo |
| `challenge:request-exit` | Client → Server | Request to leave (with reason) |
| `challenge:approve-exit` | Client → Server | Approve partner's exit request |
| `challenge:decline-exit` | Client → Server | Decline partner's exit request |
| `challenge:force-quit` | Client → Server | Force-quit (incurs -5 reputation) |
| `challenge:partner-force-quit` | Server → Partner | Partner left, you get +10 credits |
| `challenge:ended` | Server → Both | Session is over, navigate away |
| `challenge:rejoin` | Client → Server | Rejoin after page refresh |
| `challenge:rejoined` | Server → Client | Full session state restored |

## DM Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `dm:new-message` | Server → Recipient | New DM received |
| `dm:typing` | Client → Server | Typing in DM conversation |
| `dm:partner-typing` | Server → Partner | Show DM typing indicator |

## Friend Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `friend:request-received` | Server → Recipient | New friend request toast |
| `friend:request-accepted` | Server → Requester | Friend request was accepted |
| `friend:request-declined` | Server → Requester | Friend request was declined |

---

# Chapter 20: Production Deployment Guide

## 20.1 Deploy Backend to Render.com

1. Push your code to a **private** GitHub repository.
2. Go to [render.com](https://render.com) → New → **Web Service**.
3. Connect your GitHub repo.
4. Settings:
   - **Name**: `pairon-backend`
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node dist/server.js`
   - **Plan**: Free (for testing) or Starter $7/mo (for production)
5. Add all environment variables from your `backend/.env` under the "Environment" tab.
6. **Critical**: Set `FRONTEND_URL` to your Vercel app URL (e.g., `https://pairon.vercel.app`).
7. Set `BACKEND_URL` to the Render URL (e.g., `https://pairon-backend.onrender.com`).
8. Click Deploy.

> ⚠️ **Render free tier sleeps after 15 min of inactivity.** Use [UptimeRobot](https://uptimerobot.com) to ping `https://your-backend.onrender.com/health` every 10 minutes.

## 20.2 Deploy Frontend to Vercel

1. Go to [vercel.com](https://vercel.com) → New Project → Import your GitHub repo.
2. Settings:
   - **Framework Preset**: Vite
   - **Root Directory**: `app`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. Add environment variables:
   - `VITE_API_URL` = `https://pairon-backend.onrender.com`
   - `VITE_GOOGLE_CLIENT_ID` = your Google OAuth client ID
4. Deploy.

The `vercel.json` file already has SPA rewrite rules configured so React Router works correctly.

## 20.3 Update OAuth Redirect URLs

After deploying, update your OAuth app settings:

**Google Cloud Console:**
- Add authorized redirect URI: `https://your-app.vercel.app/login`

**GitHub Developer Settings:**
- Update callback URL: `https://pairon-backend.onrender.com/api/auth/github/callback`
- Update homepage URL: `https://your-app.vercel.app`

## 20.4 MongoDB Atlas Network Access

Go to MongoDB Atlas → Network Access → Add your Render backend's IP address (or `0.0.0.0/0` for all access).

## 20.5 CORS Configuration

The backend's `server.ts` already has `allowedOrigins` array. Add your production frontend URL:
```typescript
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://your-app.vercel.app',
];
```

---

# Chapter 21: Security Architecture

| Security Layer | Implementation |
|----------------|---------------|
| Password Hashing | bcrypt with 12 salt rounds |
| JWT Expiry | 7 days (`JWT_EXPIRES_IN=7d`) |
| Single-Device Login | `loginSessionId` in JWT must match DB — logging in elsewhere invalidates old session |
| CORS | Restricted to `allowedOrigins` array |
| Rate Limiting | Auth: 100 req/15min. API: 500 req/15min. Using `express-rate-limit`. |
| Input Validation | `express-validator` on all routes |
| Profile Update Whitelist | Only specific fields can be updated via PATCH (blocks `credits`, `role` injection) |
| Content Moderation | Real-time regex + blocklist filter on all chat messages |
| Env Variable Isolation | Partner's `.env` values are masked during collaboration |
| XSS Prevention | React's default JSX escaping + no `dangerouslySetInnerHTML` |

---

# Chapter 22: Scaling & Performance

**Current Architecture Limits:**
- Matchmaking queues are in-memory Node.js Maps → works for ~1,000 concurrent users.
- Socket.IO rooms handle up to ~10,000 connections on a single server.

**Scaling to 10K+ Users:**
1. **Redis Adapter**: Add `@socket.io/redis-adapter` so multiple server instances share Socket.IO rooms.
2. **Redis Queue**: Move matchmaking queues to Redis (currently in-memory, lost on restart).
3. **MongoDB Indexes**: Add indexes on frequently queried fields:
   - `users.email` (unique, already indexed)
   - `directmessages.participants` (compound index)
   - `collaborationsessions.participants + status`
4. **Horizontal Scaling**: Run multiple backend instances behind a load balancer.

---

# Chapter 23: Monetization Strategies

## Strategy 1: Freemium Credits
- Give 5 free collabs per day. Charge via Stripe for credit packs ($5 = 500 credits).
- To implement: Add `POST /api/credits/purchase` route with Stripe Checkout.

## Strategy 2: Premium Plans ($9.99/month)
- Unlimited sessions, priority matching, custom profile themes.
- To implement: Add `plan` field to User model, Stripe subscription webhooks.

## Strategy 3: Enterprise / Interview Tool ($49/mo per company)
- Rebrand as a technical interview platform. Companies create private rooms.
- To implement: Add `Organization` model, role-based room creation.

## Strategy 4: White-Label SaaS
- Sell the platform to coding bootcamps as their internal collaboration tool.
- To implement: Multi-tenant architecture with custom branding per tenant.

---

# Chapter 24: Extending PairOn

**Feature Ideas You Can Build:**

| Feature | Difficulty | Description |
|---------|-----------|-------------|
| Video Chat | Medium | Add WebRTC video (currently audio-only call infrastructure exists) |
| Screen Sharing | Medium | Use `getDisplayMedia()` API + WebRTC |
| Code Review Mode | Easy | Add a "review request" button that creates a read-only view for the partner |
| Leaderboard | Easy | Global ranking page sorted by reputation |
| Achievement Badges | Easy | Award badges for milestones (10 projects, 100 rep, etc.) |
| Stripe Payments | Medium | Add credit purchasing via Stripe Checkout |
| Mobile App | Hard | Wrap in React Native or Capacitor |
| Custom Themes | Easy | Let users pick editor themes (dark, light, monokai, etc.) |
| File Upload | Medium | Allow image/asset uploads to the IDE workspace |
| Git Integration | Hard | Push IDE code directly to GitHub repo via the stored OAuth token |

---

*This concludes the PairOn Premium Architecture Guide. You now have a complete understanding of every system, every API endpoint, every database model, and every real-time event. Use this knowledge to extend, customize, and monetize the platform. Good luck with your launch!*
