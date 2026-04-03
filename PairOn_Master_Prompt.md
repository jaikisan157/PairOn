# PairOn — Master Prompt (Single Comprehensive Description)

> Copy everything below "PROMPT START" as a single prompt to fully brief any AI on the complete PairOn application.

---

## PROMPT START

Build **PairOn**, a full-stack, real-time developer collaboration platform that intelligently matches two strangers based on complementary skills and pairs them inside a shared workspace to build a micro-project together within a time-boxed challenge. The platform is social-meets-professional: it automates discovery, imposes structure through modes and task boards, and enforces trust through reputation scoring, content moderation, a friends system, and admin oversight.

---

### Tech Stack

**Frontend**
- React 18 (functional components + hooks), TypeScript, Vite
- React Router DOM v6 — client-side routing
- Tailwind CSS v3 — all styling, dark mode via `dark:` class on root element
- shadcn/ui + Radix UI — accessible component primitives
- Framer Motion — micro-animations and page transitions
- GSAP + @gsap/react + ScrollTrigger — landing-page scroll-triggered animations
- Socket.io-client v4 — all real-time features
- @monaco-editor/react v4 — in-browser collaborative code editor
- React Hook Form + Zod + @hookform/resolvers — form validation
- Lucide React — icons; clsx + tailwind-merge + class-variance-authority — class utilities

**Backend**
- Node.js 20.x, Express v4, TypeScript v5
- MongoDB Atlas + Mongoose v8 (ODM)
- Socket.io v4 — WebSocket server for all real-time events
- jsonwebtoken v9 — stateless auth with `loginSessionId` binding
- bcryptjs v2 — password hashing
- google-auth-library v10 — server-side Google OAuth 2.0 token verification
- express-validator v7 — request sanitization
- express-rate-limit v8 — brute-force protection
- Nodemailer / Resend — transactional OTP email delivery
- cors, dotenv, ts-node-dev

**Deployment**
- Frontend → Vercel (auto CI/CD, `vercel.json` included)
- Backend → Render (`render.yaml` included)
- Database → MongoDB Atlas
- TURN/STUN → Free TURN server for WebRTC audio calls inside the collaboration workspace

---

### Database Models (Mongoose)

| Model | Key Fields |
|---|---|
| **User** | `name`, `email`, `password` (hashed), `googleId`, `role` (`user`\|`admin`), `skills[]`, `interests[]`, `experienceLevel`, `bio`, `avatarUrl`, `credits`, `reputationScore`, `badges[]`, `completedProjects`, `isOnline`, `lastActive`, `onboardingComplete`, `loginSessionId`, `warnings`, `permanentRemark` |
| **Match** (CollaborationSession) | `participants[]` (User refs), `mode` (`sprint`\|`challenge`\|`build`), `status` (`waiting`\|`active`\|`completed`\|`abandoned`), `projectIdea`, `projectTitle`, `messages[]`, `tasks[]` (Kanban), `endsAt`, `submittedBy`, `submissionLink`, `submissionDescription` |
| **QuickChat** | `participants[]`, `mode` (`doubt`\|`techtalk`), `messages[]`, `status` (`active`\|`ended`), `ratings[]`, `lastActivity` |
| **CollabProposal** | `proposer` (User ref), `recipient` (User ref), `mode`, `projectIdea`, `message`, `status` (`pending`\|`accepted`\|`declined`\|`expired`) |
| **CreditTransaction** | `userId`, `amount`, `source` (e.g. `session_complete`, `helpful_rating`, `priority_match`), `description`, `createdAt` |
| **Friend** | `requester` (User ref), `recipient` (User ref), `status` (`pending`\|`accepted`\|`declined`) |
| **DirectMessage** | `participants[]`, `messages[]` (`sender`, `content`, `timestamp`) |
| **Certificate** | `userId`, `sessionId`, `issuedAt`, `projectTitle`, `mode` |

---

### REST API Routes

**Auth (`/api/auth`)**
- `POST /register` — email + password registration; sends OTP email
- `POST /verify-otp` — activates account on correct OTP
- `POST /login` — issues JWT, rotates `loginSessionId`
- `POST /google` — verifies Google ID token server-side, upserts user, issues JWT
- `GET /me` — returns authenticated user's profile (password excluded)
- `POST /logout` — clears `loginSessionId`
- `POST /resend-otp` — resends OTP email

**Users (`/api/users`)**
- `PUT /profile` — update profile (name, bio, skills, interests, experienceLevel, avatar)
- `GET /search?q=` — search users by name or email
- `GET /:userId` — view any user's public profile

**Credits (`/api/credits`)**
- `GET /balance` — current credit balance
- `GET /history` — full transaction ledger
- `POST /spend` — spend credits (priority match, profile boost, AI project ideas)

**Friends (`/api/friends`)**
- `POST /request` — send a friend request
- `PUT /respond` — accept or decline a friend request
- `GET /` — list all friends with online status
- `GET /requests` — list incoming pending requests
- `DELETE /:friendId` — remove a friend
- `POST /proposal` — send a direct collab proposal to a friend

**Direct Messages (`/api/dm`)**
- `GET /conversations` — list all DM threads
- `GET /:userId` — message history with a specific user
- `POST /:userId` — send a direct message

---

### Socket.io Event Catalogue

| Direction | Event | Description |
|---|---|---|
| C→S | `match:request` | Join matchmaking queue with a mode |
| C→S | `match:cancel` | Leave the matchmaking queue |
| C→S | `session:send-message` | Send chat message in collaboration session |
| C→S | `session:update-task` | Create/move a Kanban task |
| C→S | `session:submit` | Submit the final project |
| C→S | `quickchat:join` | Join the Quick Connect queue |
| C→S | `quickchat:message` | Send a Quick Connect chat message |
| C→S | `quickchat:end` | End a Quick Connect session |
| C→S | `quickchat:rate` | Rate a Quick Connect partner |
| C→S | `proposal:send` | Send a collab proposal to a partner |
| C→S | `proposal:respond` | Accept or decline a proposal |
| C→S | `dashboard:cleanup` | Trigger expired session cleanup |
| S→C | `match:found` | Both users notified of a match |
| S→C | `match:cancelled` | Matchmaking cancelled |
| S→C | `session:message` | Broadcast chat message to session participants |
| S→C | `session:task-updated` | Broadcast Kanban task update |
| S→C | `session:timer-update` | Countdown tick to both participants |
| S→C | `user:status-change` | Broadcast user online/offline status |
| S→C | `proposal:incoming` | Deliver new collab proposal to recipient |
| S→C | `proposal:responded` | Notify proposer of accept/decline |
| S→C | `session:partner-disconnected` | Alert remaining participant |
| S→C | `SESSION_EXPIRED` | Force logout on duplicate login from another device |

---

### Pages & Routes (Frontend)

| Route | Page | Description |
|---|---|---|
| `/` | LandingPage | Animated marketing page with all feature sections |
| `/login` | LoginPage | Email/password + Google OAuth sign-in |
| `/register` | RegisterPage | Multi-step registration with OTP email verification |
| `/onboarding` | OnboardingPage | Multi-step profile wizard (skills, interests, bio, experience level) |
| `/dashboard` | DashboardPage | Personalized hub (credits, reputation, active session resume, navigation) |
| `/quick-connect` | QuickConnectPage | Ephemeral chat (Doubt / Tech Talk) + inline collab proposal flow |
| `/collaboration` | CollaborationPage | Full workspace: chat, Kanban, Monaco IDE, audio call, timer, submit |
| `/friends` | FriendsPage | Friends list (live online status), pending requests, direct proposals |
| `/messages` | MessagesPage | Direct messaging between friends |
| `/credits` | CreditsPage | Credit balance, transaction history, spending options |
| `/profile` | ProfilePage | View & edit own profile (skills, interests, bio, avatar, stats, badges) |
| `/profile/:userId` | UserProfileViewPage | View any user's public profile |
| `/projects` | ProjectsPage | List of completed collaboration projects |
| `/admin` | AdminDashboardPage | Admin-only: stats, session monitor, report queue, user search |

---

### Landing Page Sections (in order)

1. **HeroSection** — GSAP-animated headline, sub-headline, CTAs ("Get Started" / "See How It Works"); ScrollTrigger entrance.
2. **HowItWorksSection** — 6-step flow: Register → Choose Mode → Get Matched → Collaborate → Submit & Rate → Grow.
3. **MatchModesSection** — Cards for Sprint (⚡ 3h), Challenge (🏆 48h), Build (🔨 7 days) with description and CTA.
4. **CollaborationSection** — Live workspace preview, screenshot lightbox with Chat and Code tabs.
5. **CreditSystemSection** — Visual explainer of earning and spending credits.
6. **ReputationSection** — Reputation tiers, badges, and impact on matchmaking quality.
7. **SafetySection** — Content moderation, single-device enforcement, admin oversight.
8. **TestimonialsSection** — Developer persona testimonial cards.
9. **FinalCTASection** — Sign-up CTA with animated background.

---

### Feature Descriptions

#### 1. Authentication & Account Security
- OTP email verification on register; account inactive until verified.
- Google OAuth 2.0, server-side token verification.
- JWT contains `userId`, `email`, `role`, `loginSessionId`.
- **Single-device enforcement**: every new login rotates `loginSessionId`; old sockets receive `SESSION_EXPIRED` and are force-logged out.
- bcryptjs password hashing; `safeUserResponse` helper strips passwords and sensitive fields from all API responses.
- Rate limiting on all endpoints; express-validator sanitization on all inputs.
- Role-based access: `user` and `admin`; admin routes guarded server-side and on the frontend.

#### 2. Multi-Step Onboarding
- After registration, wizard collects display name, avatar, skills (multi-select), interests, experience level (Beginner / Intermediate / Advanced / Expert), and bio.
- `onboardingComplete: false` users redirected to `/onboarding` on every login until finished.
- Every new user seeded with 100 starting credits.

#### 3. Dashboard
- Displays name, credits, reputation score, completed projects, badges, experience level.
- On mount, fires `dashboard:cleanup` socket event to expire stale matches/proposals and surface active sessions for resumption.
- Real-time online status updated on socket connect/disconnect.

#### 4. Intelligent Matchmaking Algorithm (`matchingAlgorithm.ts`)
- **Skill Complementarity (40%)** — Ratio of unique-to-total skills; frontend+backend pair scores higher than two frontend devs.
- **Interest Overlap (20%)** — Set intersection of interests; some overlap preferred, too much penalized.
- **Reputation Weight (20%)** — Normalized average reputation of both users.
- **Activity Status (20%)** — Both online = 100, one online = 50, both inactive = 0.
- **Previous Match Penalty** — Deduction if these two users have been paired before, promoting new connections.
- **AI Project Idea Generation** — After match confirmed, backend generates a contextually relevant project idea from combined skill sets and interests.

#### 5. Quick Connect (Ephemeral Chat)
- **Doubt Mode** — Post a technical question; matched with someone who can help.
- **Tech Talk Mode** — Open-ended casual tech discussion.
- Real-time Socket.io queue matching; all messages moderated before broadcast.
- Server-side inactivity checker (every 60s): auto-ends chats idle for 5+ minutes.
- Post-chat rating: thumbs up (helpful) or thumbs down → affects partner's reputation score.
- **Inline Collab Proposal** — Either user can propose a full structured collaboration mid-chat: select mode → pick from 3 AI-generated project ideas → optional message → partner accepts/declines in real time → acceptance creates `CollaborationSession` and redirects both users to `/collaboration`.

#### 6. Challenge Collaboration Workspace
- Three modes with countdowns: Sprint (3h), Challenge (48h), Build (7 days). Timer streamed via `session:timer-update`.
- **Real-time Chat** — Full message thread with system events (join/leave/submit) and AI tips inline.
- **Kanban Task Board** — Columns: To Do / In Progress / Done. Create tasks, assign to either participant, move between columns. All updates broadcast via Socket.io.
- **Collaborative Monaco IDE** — 20+ language modes, syntax highlighting, resizable panel. Code visible to both participants for pair programming or review.
- **WebRTC Audio Calls** — Peer-to-peer audio with STUN/TURN; persists only while the session is active.
- **Project Submission** — Either participant submits public link + description → triggers credit rewards and session close.
- **Partner Profile Modal** — Click partner name to view their full profile card inline.
- **Session Abandonment** — Disconnection handled gracefully; remaining participant notified; no penalty for partner's absence.
- **Content Warnings** — Per-session warning tracker; repeated violations block message delivery.

#### 7. Credit System
- Starting balance: 100 credits per new user.
- **Earning**: completing a session (variable by mode), submitting a project (bonus), positive feedback, helping in Quick Connect.
- **Spending**: priority matching (jump queue), profile boost (appear higher in match pool), unlocking AI-generated project ideas.
- Every event recorded as a `CreditTransaction` document with source, amount, description, and timestamp.
- Credits page shows full ledger and available purchases.

#### 8. Reputation System
- Score 0–100, initialized at 100. Rises with positive ratings, falls with negative ones.
- Three rating tiers: Helpful, Very Helpful, Exceptional.
- Directly used in match scoring (20% weight).
- **Badges** — Milestone awards based on completed projects, reputation thresholds, and special achievements; stored on User document, displayed on profiles.
- Admin-visible `warnings` count and `permanentRemark` flag for repeated violators.

#### 9. Friends System
- Search users by name or email; send friend requests.
- Incoming requests appear under a "Requests" tab; accept or decline.
- Friends list shows live online/offline status, last active, reputation, experience level (all via `user:status-change` events).
- **Direct Collab Proposals** — Select friend → choose mode → pick AI project idea → optional message → friend receives real-time `proposal:incoming`.

#### 10. Collaboration Proposals (Unified Flow)
1. Proposer selects mode (Sprint / Challenge / Build).
2. Backend generates 3 AI-curated project ideas from both users' combined skills + interests.
3. Proposer picks an idea (or types their own) and optionally adds a message.
4. Proposal delivered in real time via `proposal:incoming`.
5. Recipient sees project title, mode, duration, and message; accepts or declines.
6. Acceptance instantly creates a `CollaborationSession`; both users redirected to `/collaboration`.
7. Pending proposals expire on disconnect or dashboard cleanup.

#### 11. Content Moderation (Multi-Layer)
- Compiled regex patterns: explicit language, l33t-speak variations, character-spaced bypasses, slurs, harassment phrases, drug solicitation, sexting indicators.
- Exact-match word blocklist (Set lookup per token).
- Per-session warning map keyed `sessionId:userId`; first violation = warning, repeated = escalation.
- Blocked messages NOT broadcast; sender receives a clear reason.
- Tuned for professional developer community.

#### 12. Admin Dashboard
- **Platform Stats** — Active sessions, total users, matches today, open reports.
- **Session Monitor** — All active collaboration sessions with participant names, mode, start time, elapsed duration.
- **User Report Queue** — Reporter, reported user, reason, status (pending / reviewed / resolved). Admin can take action inline.
- **User Search** — Look up any registered user for review or account action.
- Protected by `role: 'admin'` on JWT and User document, enforced server-side.

#### 13. User Profile
- View + edit: skills, interests, bio, experience level, avatar, stats (credits, reputation, completed projects), badge collection.
- Public profile view for any logged-in user at `/profile/:userId`.

#### 14. Direct Messaging
- Persistent message threads between friends.
- Conversation list + per-conversation message history.
- REST API at `/api/dm`.

#### 15. Dark Mode
- `ThemeContext` stores `light | dark`; Tailwind `dark:` classes applied to the root element.
- Preference persisted to localStorage.
- Every page, card, input, modal, dialog, and dropdown has explicit dark mode variants.

#### 16. Security Summary
- JWT expiry + `loginSessionId` rotation on every login
- bcryptjs hashing; passwords never in API responses
- Server-side Google OAuth verification (no client-side trust)
- express-validator sanitization on all REST endpoints
- Rate limiting on all API routes
- CORS restricted to allowed origins
- Role-based access control enforced server-side
- Content moderation on all real-time messages
- No sensitive data in Socket.io handshakes beyond the JWT token

---

### End-to-End User Flow

```
Visit PairOn
  └─► Landing Page
        (Hero → How It Works → Match Modes → Collab Preview → Credits → Reputation → Safety → Testimonials → CTA)
        └─► Register (email+OTP  OR  Google OAuth)
              └─► Verify OTP email
                    └─► Onboarding Wizard (skills · interests · bio · experience level · avatar)
                          └─► Dashboard
                                ├─► Quick Connect
                                │     ├─► Select Mode (Doubt / Tech Talk)
                                │     ├─► Real-time match via Socket.io queue
                                │     ├─► Ephemeral moderated chat
                                │     ├─► Rate partner at end
                                │     └─► [Optional] Propose collaboration
                                │               └─► Partner accepts → Collaboration Workspace
                                │
                                ├─► Challenge Collaboration (Matchmaking)
                                │     ├─► Select Mode (Sprint / Challenge / Build)
                                │     ├─► Join matchmaking queue
                                │     ├─► Matched via weighted algorithm
                                │     └─► Collaboration Workspace
                                │           ├─► Real-time chat
                                │           ├─► Kanban board (real-time task sync)
                                │           ├─► Monaco IDE (shared code view)
                                │           ├─► WebRTC audio call
                                │           └─► Submit project → earn credits + reputation → rate partner
                                │
                                ├─► Friends
                                │     ├─► Search & send friend requests
                                │     ├─► Accept / decline incoming requests
                                │     ├─► View friends list (live online status)
                                │     └─► Propose direct collaboration → Collaboration Workspace
                                │
                                ├─► Messages (Direct Messaging with friends)
                                ├─► Credits (balance  ·  history  ·  spend)
                                ├─► Profile (view / edit own profile)
                                └─► Admin Dashboard (admin role only)
                                      ├─► Platform stats
                                      ├─► Active session monitor
                                      ├─► User report queue
                                      └─► User search & management
```

---

### Key Architectural Decisions

| Decision | Rationale |
|---|---|
| Monorepo: `/app` (frontend) + `/backend` (both TypeScript) | Single repo for easier CI/CD and type sharing |
| Socket.io as real-time backbone | Single persistent WebSocket per user handles matchmaking, chat, task sync, timers, presence, and proposals |
| JWT + `loginSessionId` rotation | Prevents concurrent sessions without server-side session storage |
| Ephemeral Quick Connect messages | Not persisted to DB; only Match session data (messages, Kanban) is stored |
| Weighted scoring in `matchingAlgorithm.ts` | Deterministic, fully testable, no ML required |
| Content moderation as socket middleware | Runs on every incoming message event before broadcast, zero-latency enforcement |
| `safeUserResponse` helper | Single utility that strips password, loginSessionId, and sensitive fields from every API response |
| Vercel + Render deployment | Zero-config manifests already in repo; auto CI/CD from Git |

## PROMPT END
