# PairOn — Collaborative Developer Platform

> **A full-stack SaaS platform where developers pair up, code together in a live browser-based IDE, and build relationships through a social layer.**

---

## 🌐 Live Demo

| | URL |
|---|---|
| **Frontend** | _Set your Vercel URL here_ |
| **Backend** | _Set your Render URL here_ |
| **Demo Account** | `demo@pairon.com` / `demo123` |

---

## ✨ Features

### 🔗 Quick Connect
Anonymous matchmaking — get instantly paired with a random developer. No setup, no friction. One click and you're coding with someone new.

### 💻 Collaborative IDE (Browser-Based)
- **Monaco Editor** — the same editor that powers VS Code
- **WebContainers** — run real Node.js code directly in the browser
- Real-time code sync — both users see each other's keystrokes live
- Shared terminal with simultaneous views
- VS Code-style file explorer with create/rename/delete
- Multi-tab file editing

### 🤝 Friends & Social
- Send / accept / decline friend requests with real-time toast notifications
- Friends list with online status
- Direct Messages (WhatsApp-style) — messages persist permanently in MongoDB
- Real-time DM delivery via Socket.IO
- DM notifications with badge counter from any page
- Unfriending automatically deletes conversation history

### 🤖 AI Integration (Groq)
- AI pair programmer built into the collaboration session
- Chat with Groq-powered AI for code suggestions and debugging

### 🔐 Authentication
- Email/password with bcrypt hashing
- Google OAuth
- JWT sessions with single-device enforcement (logging in elsewhere kicks old session)
- Role-based access (user / admin)

### 💳 Credits System
- Earn credits by collaborating
- Spend credits to unlock features
- Admin-controlled credit rules

### ⭐ Reputation System
- Earn reputation from successful collabs
- Displayed on profile and in friend requests

### 🛡️ Admin Dashboard
- View all users and active sessions
- Manage reports and content moderation
- Monitor system health and credits

---

## 🏗️ Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend** | React 18 + TypeScript, Vite, TailwindCSS, Framer Motion |
| **Code Editor** | Monaco Editor (VS Code's editor engine) |
| **Browser Runtime** | WebContainers (Node.js in the browser, by StackBlitz) |
| **Backend** | Node.js + Express + TypeScript |
| **Database** | MongoDB Atlas + Mongoose |
| **Real-time** | Socket.IO |
| **Auth** | JWT + Google OAuth 2.0 + bcrypt |
| **AI** | Groq API |
| **Email** | Brevo (Sendinblue) |
| **Deploy** | Vercel (frontend) + Render (backend) |

---

## 📁 Project Structure

```
PairOn/
├── app/                          # React + Vite frontend
│   ├── src/
│   │   ├── pages/                # All page components
│   │   │   ├── CollaborationPage.tsx   # Collaborative IDE
│   │   │   ├── QuickConnectPage.tsx    # Anonymous matchmaking
│   │   │   ├── FriendsPage.tsx         # Friends & requests
│   │   │   ├── MessagesPage.tsx        # Direct messaging
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── ProfilePage.tsx
│   │   │   └── AdminDashboardPage.tsx
│   │   ├── components/           # Reusable UI components
│   │   ├── context/              # Auth, Theme, Matching context
│   │   ├── lib/                  # API client, Socket service
│   │   └── types/                # TypeScript interfaces
│   └── .env                      # Frontend env vars
│
├── backend/                      # Node.js + Express backend
│   ├── src/
│   │   ├── models/               # MongoDB models
│   │   │   ├── User.ts
│   │   │   ├── DirectMessage.ts
│   │   │   ├── Friend.ts
│   │   │   └── ...
│   │   ├── routes/               # REST API routes
│   │   │   ├── auth.ts
│   │   │   ├── friends.ts
│   │   │   ├── dm.ts
│   │   │   └── ...
│   │   ├── middleware/           # Auth middleware
│   │   ├── services/             # Socket.IO event handlers
│   │   └── server.ts             # Entry point
│   ├── render.yaml               # Render deploy config
│   └── .env                      # Backend env vars (never commit)
│
├── PairOn_Project_QA.html        # Viva Q&A document (60+ questions)
└── README.md
```

---

## 🚀 Local Setup

### Prerequisites
- Node.js 18+
- MongoDB (local) or a free [MongoDB Atlas](https://cloud.mongodb.com) cluster

### 1. Clone the repo
```bash
git clone https://github.com/jaikisan157/PairOn.git
cd PairOn
```

### 2. Backend setup
```bash
cd backend
npm install
cp .env.example .env
# Fill in your values in .env
npm run dev
```

### 3. Frontend setup
```bash
cd app
npm install
# Create .env with:
# VITE_API_URL=http://localhost:5000
# VITE_GOOGLE_CLIENT_ID=your_google_client_id
npm run dev
```

App runs at: `http://localhost:5173`  
API runs at: `http://localhost:5000`

---

## 🔑 Environment Variables

### Backend (`backend/.env`)
```env
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your_jwt_secret_min_32_chars
JWT_EXPIRES_IN=7d
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
GROQ_API_KEY=your_groq_api_key
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
BREVO_API_KEY=your_brevo_key
BREVO_SENDER_EMAIL=no-reply@yourdomain.com
```

### Frontend (`app/.env`)
```env
VITE_API_URL=http://localhost:5000
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

---

## ☁️ Deployment

This project auto-deploys on every `git push` to `master`.

| Service | What it does | Auto-deploy trigger |
|---|---|---|
| **Vercel** | Hosts the React frontend | Push to `master` |
| **Render** | Hosts the Node.js backend | Push to `master` |

### Deploy yourself:
- **Frontend**: Import the repo on [vercel.com](https://vercel.com), set root to `app/`
- **Backend**: Import the repo on [render.com](https://render.com), it reads `backend/render.yaml`

> ⚠️ **Render free tier sleeps after 15 min inactivity.** Use [UptimeRobot](https://uptimerobot.com) to ping `/health` every 10 minutes to keep it alive.

---

## 🛡️ Security

- Passwords hashed with **bcrypt** (10 rounds)
- JWTs expire after **7 days**
- Single-device login enforcement — new login invalidates old session
- CORS restricted to frontend domain in production
- Input validation on all routes
- Content moderation on chat messages

---

## 📄 License

MIT — free to use, modify, and distribute.

---

*Built with ❤️ — PairOn, 2026*
