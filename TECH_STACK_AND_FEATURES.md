# PairOn — Tech Stack, Purpose & Features

---

## Purpose

PairOn is a **developer collaboration platform** that intelligently matches two strangers based on complementary skills, shared interests, reputation, and activity — then pairs them inside a shared workspace to build a micro-project together within a time-boxed challenge. The platform acts as a social-meets-professional space for developers to grow, learn, and ship small projects with people they would never have found on their own.

The platform solves three core problems:
- **Discovery** — Finding the right collaborator with the right skills is hard manually; PairOn automates this with a weighted scoring algorithm.
- **Structure** — Open-ended collaboration often stalls; PairOn imposes time windows, project ideas, and task boards to keep teams focused.
- **Trust & Safety** — Online collaboration requires accountability; PairOn provides reputation scoring, content moderation, a friends system, and admin oversight.

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| **React** | 18 | Core UI framework using functional components and hooks |
| **TypeScript** | Latest | Full static typing across all components, contexts, and types |
| **Vite** | Latest | Ultra-fast dev server and build tool with HMR |
| **React Router DOM** | v6 | Client-side routing between all pages and views |
| **Tailwind CSS** | v3 | Utility-first CSS for all layout, spacing, color, and responsive design |
| **shadcn/ui** | Latest | Accessible, unstyled Radix UI-based component library (buttons, dialogs, cards, inputs, etc.) |
| **Radix UI** | Various | Headless accessible primitives underpinning shadcn/ui components |
| **Framer Motion** | Latest | Declarative animations and page transitions throughout the UI |
| **GSAP + @gsap/react** | Latest | High-performance scroll and timeline animations on the landing page |
| **Socket.io-client** | v4 | WebSocket client for all real-time features (chat, matchmaking, presence, task sync) |
| **@monaco-editor/react** | v4 | In-browser VS Code-grade code editor embedded inside the Collab IDE |
| **React Hook Form** | Latest | Form state management with schema-based validation |
| **Zod / @hookform/resolvers** | Latest | Schema validation for all user-facing forms |
| **Lucide React** | Latest | Consistent SVG icon library used across the entire UI |
| **class-variance-authority + clsx + tailwind-merge** | Latest | Conditional and merged class utilities for component variants |

### Backend

| Technology | Version | Purpose |
|---|---|---|
| **Node.js** | 20.x | JavaScript runtime for the server |
| **Express** | v4 | HTTP web framework for REST API routing and middleware |
| **TypeScript** | v5 | Full static typing across server code, models, services, and utilities |
| **MongoDB** | Latest | Primary NoSQL database storing users, matches, sessions, messages, credits, etc. |
| **Mongoose** | v8 | Object Document Mapper (ODM) providing schemas, validation, and query API for MongoDB |
| **Socket.io** | v4 | WebSocket server for all real-time events — matchmaking, chat, Kanban sync, timers, presence |
| **JSON Web Token (jsonwebtoken)** | v9 | Stateless authentication tokens with session ID binding for single-device enforcement |
| **bcryptjs** | v2 | Password hashing with salt rounds for secure credential storage |
| **google-auth-library** | v10 | Google OAuth 2.0 token verification for social sign-in |
| **express-validator** | v7 | Request body validation and sanitization middleware |
| **express-rate-limit** | v8 | API rate limiting to prevent abuse and brute-force attacks |
| **Nodemailer / Resend** | Latest | Transactional email delivery for OTP verification emails |
| **cors** | v2 | Cross-Origin Resource Sharing headers for frontend/backend communication |
| **dotenv** | v16 | Environment variable management |
| **ts-node-dev** | v2 | Development server with TypeScript live-reload |

### Infrastructure & Deployment

| Service | Purpose |
|---|---|
| **Vercel** | Frontend hosting with automatic CI/CD from Git; `vercel.json` config included |
| **Render** | Backend hosting with `render.yaml` deployment manifest pre-configured |
| **MongoDB Atlas** | Cloud-hosted MongoDB cluster for production data |
| **Google OAuth** | Identity provider for social login |
| **Resend / SMTP** | Email delivery for OTP codes |

---

## Feature Breakdown

### 1. Authentication & Account Security

- **OTP Email Verification** — On registration, a time-sensitive one-time password (OTP) is sent to the user's email address via Nodemailer/Resend. The account is only activated upon successful OTP verification, preventing fake accounts.
- **Google OAuth 2.0 Sign-In** — Users can register and log in using their Google account. The backend verifies the Google ID token server-side using `google-auth-library`, then issues a JWT.
- **JWT Authentication** — All protected routes and Socket.io connections require a valid JWT. Tokens contain the user ID, email, role, and a `loginSessionId`.
- **Single-Device Session Enforcement** — Each login generates a unique `loginSessionId` stored on the User document. Every Socket.io connection and protected API call validates that the token's `loginSessionId` matches the one on the database record. If a user logs in on a second device, the first session is immediately invalidated with a `SESSION_EXPIRED` error.
- **Password Hashing** — All passwords are hashed using bcryptjs with salt rounds before storage. Passwords are never returned in API responses.
- **Role-Based Access** — Users have a `role` field (`user` | `admin`). Admin routes and the Admin Dashboard are only accessible to users with the admin role.
- **Input Validation** — All auth endpoints use `express-validator` to sanitize and validate incoming data, preventing injection attacks.
- **Rate Limiting** — `express-rate-limit` protects the API from brute-force and abuse.

---

### 2. User Onboarding

- **Multi-Step Onboarding Flow** — After registration, new users complete an onboarding wizard that captures:
  - Display name and avatar
  - Skills (e.g., React, Python, Node.js, UI/UX, etc.)
  - Interests (e.g., Web Dev, AI/ML, Game Dev, etc.)
  - Experience level (Beginner / Intermediate / Advanced / Expert)
  - Bio
- **`onboardingComplete` Flag** — Users who skip or haven't finished onboarding are redirected back to the onboarding page on next login, ensuring complete profiles before matching.
- **Starting Credits** — Every new user is seeded with 100 credits on account creation.

---

### 3. Dashboard

- **Personalized Overview** — The dashboard displays the user's name, credits, reputation score, completed projects count, badges, and experience level.
- **Active Session Detection** — On load, a `dashboard:cleanup` Socket.io event fires to close expired sessions/matches/proposals, and surfaces any still-active ongoing collaboration sessions, allowing the user to resume mid-session.
- **Quick Navigation** — The dashboard links to all major platform features: Quick Connect, Collaboration, Friends, Credits, and Profile.
- **Online Status** — User's `isOnline` status and `lastActive` timestamp are updated in real time on every socket connection and disconnection.

---

### 4. Intelligent Matchmaking Algorithm

The core IP of PairOn is its matching engine, implemented in `matchingAlgorithm.ts`:

- **Skill Complementarity (40%)** — Calculates the ratio of unique skills between two users to total skills. A frontend developer paired with a backend developer scores higher than two frontend developers.
- **Interest Overlap (20%)** — Measures shared interests using set intersection. Some overlap improves collaboration rapport, but too much is penalized.
- **Reputation Weight (20%)** — The average reputation score of both users, normalized to 0–100. This rewards users who have shown good behavior in past sessions.
- **Activity Status (20%)** — Checks if both users are currently online or were active in the last 24 hours. Fully active pairs score 100, mixed pairs score 50, both inactive scores 0.
- **Previous Match Penalty** — A deduction is applied if the two users have already been matched before, actively promoting new connections.
- **AI Project Idea Generation** — Once matched, the algorithm generates a contextually relevant project idea based on the combined skill sets and interests of both users.

---

### 5. Quick Connect (Ephemeral Chat)

- **Two Modes:**
  - **Doubt Mode** — A developer posts a specific technical question/topic and is matched with someone who can help. Ideal for quick peer support.
  - **Tech Talk Mode** — A casual open-ended tech discussion channel for conversations without a specific agenda.
- **Real-Time Matching** — Socket.io places the user in a matching queue and pairs them with the next available user selecting the same mode.
- **Ephemeral Chat** — Messages are stored only for the session duration. Once the chat ends, it's closed.
- **Inactivity Timeout** — A server-side inactivity checker runs every minute. Chats where neither participant has sent a message in 5+ minutes are automatically ended.
- **Rating After Chat** — On ending a chat, users can give a thumbs up (helpful) or thumbs down (not helpful) rating, which contributes to the partner's reputation score.
- **Content Moderation** — Every message sent through Quick Connect passes through the real-time content moderation service before being broadcast.
- **Collab Proposal Flow** — During a Quick Connect session, either participant can propose a full structured collaboration. The proposer selects a mode (Sprint/Challenge/Build), an AI-generated project idea, and sends a proposal card. The partner can accept or decline in real time.
- **Mobile Detection** — The platform flags mobile/tablet users and adapts the chat UI accordingly.

---

### 6. Challenge Collaboration (Structured Pairing)

- **Three Match Modes:**
  | Mode | Duration | Description |
  |---|---|---|
  | ⚡ Sprint | 3 hours | Fast, focused mini-build |
  | 🏆 Challenge | 48 hours | Intermediate depth project |
  | 🔨 Build | 7 days | Full feature-complete build |
- **Automatic Session Management** — When a match is found, a `CollaborationSession` document is created in MongoDB with an `endsAt` timestamp. A server-side countdown timer emits periodic `session:timer-update` events to both clients.
- **Real-Time Chat** — A full message thread with system messages (join/leave/submit events) and AI-generated tips visible inline.
- **Kanban Task Board** — An integrated Kanban board with three columns: **To Do**, **In Progress**, and **Done**. Tasks can be created, assigned to either participant, and moved between columns. All task updates are broadcast over Socket.io in real time.
- **Collaborative IDE** — An embedded Monaco Editor (the same engine as VS Code) where both participants can write and view code. Multiple language modes are supported.
- **Project Submission** — Either participant can submit the final project by providing a public link and a description. Submission is confirmed over Socket.io and triggers credit rewards.
- **Partner Profile Modal** — Users can click on their partner's name to see their full profile card (skills, reputation, badges, experience level) without leaving the collaboration page.
- **Session Abandonment Handling** — If a participant disconnects mid-session, the system marks the session appropriately without penalizing the remaining participant for the partner's absence.
- **Warnings & Blocking** — Users who repeatedly violate content rules receive in-session warnings tracked per session. After a threshold, they can be blocked from continuing.

---

### 7. In-Platform Collaborative IDE (`CollabIDE`)

- **Monaco Editor** — PoweredI by `@monaco-editor/react`, providing syntax highlighting, autocompletion hints, and a familiar coding environment across 20+ languages.
- **Multi-Language Support** — Users can switch between JavaScript, TypeScript, Python, HTML, CSS, JSON, and more.
- **Shared View** — Code written in the IDE is visible to both participants and can be used for code review, pair programming discussion, or snippets sharing.
- **Resizable Panel** — The IDE panel is resizable within the collaboration page layout.
- **Helper Utilities** — `CollabIDEHelpers.tsx` provides utility functions for language detection, template scaffolding, and editor theme toggling.

---

### 8. Credit System

- **Starting Balance** — Every new user receives 100 credits on registration.
- **Earning Credits:**
  | Activity | Credits Earned |
  |---|---|
  | Completing a session | Variable by mode |
  | Submitting a project | Bonus credits |
  | Receiving positive feedback | Reputation-linked bonus |
  | Helping another user (Quick Connect) | Credits for helpful rating |
- **Spending Credits:**
  | Usage | Cost |
  |---|---|
  | Priority matching (jump the queue) | Credits |
  | Profile boost (appear higher in matches) | Credits |
  | Unlocking AI-generated project ideas | Credits |
- **Transaction Ledger** — Every credit event (earned or spent) is recorded as a `CreditTransaction` document in MongoDB with a source, amount, description, and timestamp.
- **Credits Page** — A dedicated page shows the user's full transaction history, current balance, and available purchases.

---

### 9. Reputation System

- **Reputation Score** — Each user has a reputation score from 0–100, initialized at 100. It rises with positive ratings and falls with negative ones.
- **Three Rating Levels:**
  - **Helpful** — Standard positive rating after a session.
  - **Very Helpful** — Strong positive recognition.
  - **Exceptional** — Highest tier, for outstanding collaboration.
- **Impact on Matching** — Reputation directly affects match quality (20% weight in the algorithm). High-reputation users are matched with other high-reputation users.
- **Badges** — Milestone badges are awarded based on completed projects, reputation thresholds, and special achievements. Badges are stored on the User document and displayed on profiles.
- **Warnings & Permanent Remarks** — Users who violate community standards receive `warnings`. Users with a `permanentRemark` flag are flagged in admin views for review.

---

### 10. Friends System

- **Send Friend Requests** — Users can search for other registered users by name or email and send a friend request.
- **Accept / Decline** — Incoming friend requests appear in the Friends page under a "Requests" tab. Recipients can accept or decline.
- **Friends List** — Accepted friends are listed with their online status, last active time, reputation, and experience level.
- **Direct Collab Proposals** — From the friends list, users can directly propose a challenge collaboration to a friend — selecting a mode (Sprint/Challenge/Build), entering a project title and description, and sending the invite. The friend receives it as an incoming proposal notification via Socket.io.
- **Real-Time Online Status** — The friends list reflects live online/offline status updated via `user:status-change` Socket.io events.

---

### 11. Collaboration Proposals

- **Contextual Proposal Flow** — Whether initiated from Quick Connect chat or from the Friends page, proposals follow the same structured flow:
  1. Proposer selects a match mode.
  2. Proposer selects an AI-generated project idea (or enters their own).
  3. Proposer writes an optional message.
  4. Proposal is delivered to the recipient in real time.
- **Accept/Decline in Real Time** — The recipient sees the proposal card with project title, mode, and message. Accepting immediately creates a `CollaborationSession` and redirects both users to the Collaboration Page.
- **Proposal Expiry** — Pending proposals are automatically expired when either participant disconnects or when a dashboard cleanup runs.
- **AI Project Ideas** — The proposal flow calls the backend to generate 3 AI-curated project ideas based on both users' skills and interests, giving proposers smart suggestions rather than a blank form.

---

### 12. Content Moderation

A multi-layer real-time content moderation system protects the platform from harmful content:

- **Regex Pattern Matching** — A curated list of compiled regex patterns catches explicit language, l33t speak variations (e.g., `f*ck`, `sh1t`), character-spaced bypass attempts, racial slurs, harassment phrases, drug solicitation, and sexting indicators.
- **Word Blocklist** — An exact-match Set of blocked words is checked against every word token in the message.
- **Per-Session Warning Tracking** — Warnings are tracked in an in-memory map keyed by `sessionId:userId`. First violation sends a warning; repeated violations trigger an escalating response.
- **Message Blocking** — Messages that fail moderation are not broadcast to the partner. The sender receives a clear reason for the block.
- **Professional Context Enforcement** — Moderation is tuned for a professional developer community — blocking adult content, harassment, and solicitation while allowing normal technical discussion.

---

### 13. Admin Dashboard

- **Platform Statistics** — Displays real-time key metrics: active sessions, total registered users, matches initiated today, and open user reports.
- **Active Session Monitor** — Lists all ongoing collaboration sessions with participant names, match mode, start time, and elapsed duration.
- **User Report Management** — A queue of user reports (submitted by other users) showing the reporter, reported user, reason, and status (pending/reviewed/resolved). Admins can take action directly.
- **User Search & Management** — Search bar to look up any registered user for review, moderation, or account actions.
- **Role-Gated Access** — The Admin Dashboard page is only accessible to users with `role: 'admin'` in their JWT and User document.

---

### 14. User Profile

- **View & Edit** — Users can view their full profile (skills, interests, bio, experience level, badges, stats) and edit it at any time.
- **Profile Completeness** — Profiles without onboarding data are flagged for completion.
- **Stats Display** — Shows completed projects count, current credits, reputation score, and badge collection.
- **Avatar Support** — Custom avatar upload capability for profile personalization.

---

### 15. Landing Page

- **Animated Hero Section** — GSAP-powered entrance animations with scroll-triggered reveals using `ScrollTrigger`.
- **Feature Sections** — Dedicated landing page sections for each core concept: How It Works, Match Modes, Credit System, Reputation System, Collaboration showcase, Testimonials, and a Final CTA.
- **Framer Motion Micro-Animations** — Smooth hover, entrance, and exit animations on every interactive element.
- **Responsive Design** — Fully responsive across mobile, tablet, and desktop breakpoints using Tailwind CSS.

---

### 16. Dark Mode

- **System-Wide Theme Toggle** — A `ThemeContext` stores the active theme (`light` | `dark`) and applies the appropriate Tailwind `dark:` class to the root element.
- **Persistent Preference** — Theme preference is persisted across sessions.
- **Full Component Coverage** — Every page, card, input, modal, and dropdown has explicit dark mode variants defined.

---

### 17. Real-Time Infrastructure (Socket.io Events)

| Direction | Event | Description |
|---|---|---|
| Client → Server | `match:request` | Join matchmaking queue with a mode |
| Client → Server | `match:cancel` | Leave the matchmaking queue |
| Client → Server | `session:send-message` | Send a chat message in a collaboration session |
| Client → Server | `session:update-task` | Create or update a Kanban task |
| Client → Server | `session:submit` | Submit the final project |
| Client → Server | `quickchat:join` | Join the Quick Connect queue |
| Client → Server | `quickchat:message` | Send a Quick Connect chat message |
| Client → Server | `quickchat:end` | End a Quick Connect session |
| Client → Server | `quickchat:rate` | Rate a Quick Connect partner |
| Client → Server | `proposal:send` | Send a collab proposal to a partner |
| Client → Server | `proposal:respond` | Accept or decline a proposal |
| Client → Server | `dashboard:cleanup` | Trigger expired session cleanup on dashboard load |
| Server → Client | `match:found` | Notify both users a match was found |
| Server → Client | `match:cancelled` | Notify user that matchmaking was cancelled |
| Server → Client | `session:message` | Broadcast new chat message to session participants |
| Server → Client | `session:task-updated` | Broadcast Kanban task update to participants |
| Server → Client | `session:timer-update` | Countdown tick to both participants |
| Server → Client | `user:status-change` | Broadcast user online/offline status |
| Server → Client | `proposal:incoming` | Deliver new collab proposal to recipient |
| Server → Client | `session:partner-disconnected` | Alert remaining participant of partner leaving |

---

### 18. Security Measures

- JWT tokens with expiry and session ID binding
- Bcrypt password hashing (never stored in plaintext)
- Server-side Google OAuth token verification (not client-side trust)
- Express-validator input sanitization on all API endpoints
- Rate limiting on all API routes
- Content moderation on all real-time messages
- Role-based access control (user vs. admin)
- CORS configuration restricting allowed origins
- Passwords excluded from all API response payloads (`safeUserResponse` helper)
- No sensitive data in Socket.io handshakes beyond the JWT token
