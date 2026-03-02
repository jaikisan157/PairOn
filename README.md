# PairOn

A modern collaboration platform where strangers are intelligently matched to build micro-projects together.

![PairOn Screenshot](https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&h=600&fit=crop)

## 🌟 Features

- **Intelligent Matching**: AI-powered algorithm pairs users based on complementary skills, interests, and reputation
- **Real-time Collaboration**: Chat, Kanban board, and shared workspace
- **Credit System**: Earn credits by completing projects and helping others
- **Reputation System**: Build trust through ratings and badges
- **Multiple Match Modes**: 3-hour sprint, 48-hour challenge, 7-day build
- **Dark Mode**: Full dark mode support

## 🎯 Core Concept

PairOn intelligently matches users based on skills and interests to complete time-based collaborative challenges.

**Match Score Formula:**
```
Match Score =
  (Skill Complementarity × 0.4) +
  (Interest Overlap × 0.2) +
  (Reputation Weight × 0.2) +
  (Activity Status × 0.2)
```

## 🏗️ Tech Stack

### Frontend
- React 18 + TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Framer Motion
- GSAP
- Socket.io-client

### Backend
- Node.js + Express
- MongoDB + Mongoose
- Socket.io
- JWT Authentication
- TypeScript

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)

### Frontend Setup

```bash
cd app
npm install
npm run dev
```

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your configuration
npm run dev
```

### Demo Credentials
- Email: `demo@pairon.com`
- Password: `demo123`

## 📁 Project Structure

```
├── app/                    # React frontend
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── sections/       # Landing page sections
│   │   ├── pages/          # App pages
│   │   ├── context/        # React contexts
│   │   ├── hooks/          # Custom hooks
│   │   ├── types/          # TypeScript types
│   │   └── lib/            # Utilities
│   └── dist/               # Production build
│
├── backend/                # Node.js backend
│   ├── src/
│   │   ├── models/         # MongoDB models
│   │   ├── routes/         # API routes
│   │   ├── middleware/     # Express middleware
│   │   ├── services/       # Socket.io services
│   │   └── utils/          # Utilities
│   └── dist/               # Production build
│
└── README.md
```

## 🎨 Design System

- **Primary Background**: `#F6F8F7` (soft off-white)
- **Accent Color**: `#22C55E` (bright green)
- **Secondary**: `#E9F3EE` (pale mint)
- **Text Primary**: `#111827` (near-black)
- **Text Secondary**: `#6B7280` (cool gray)

## 🛡️ Security Features

- JWT-based authentication
- Password hashing with bcrypt
- CORS protection
- Input validation
- Rate limiting (recommended for production)

## 📊 Admin Dashboard

Access the admin dashboard at `/admin` to:
- View active sessions
- Manage reported users
- Adjust credit rules
- Monitor system health

## 🚀 Deployment

### Frontend (Vercel)
```bash
cd app
npm run build
vercel --prod
```

### Backend (Render/Railway)
```bash
cd backend
npm run build
# Deploy dist/ folder to your platform
```

## 📝 Environment Variables

### Frontend
- `VITE_API_URL` - Backend API URL
- `VITE_SOCKET_URL` - Socket.io server URL

### Backend
- `MONGODB_URI` - MongoDB connection string
- `JWT_SECRET` - JWT signing secret
- `FRONTEND_URL` - Frontend URL for CORS
- `PORT` - Server port

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- [shadcn/ui](https://ui.shadcn.com/) for beautiful UI components
- [Framer Motion](https://www.framer.com/motion/) for smooth animations
- [GSAP](https://greensock.com/gsap/) for scroll animations

---

Built with ❤️ by the PairOn team
