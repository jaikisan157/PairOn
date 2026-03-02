# PairOn Backend

Node.js + Express + MongoDB backend for the PairOn collaboration platform.

## Features

- **Authentication**: JWT-based auth with secure password hashing
- **Real-time Matchmaking**: Socket.io for live matchmaking and collaboration
- **Intelligent Matching Algorithm**: Weighted scoring based on skills, interests, reputation
- **Credit System**: Track and manage user credits
- **Reputation System**: User ratings and badges

## Tech Stack

- Node.js
- Express
- MongoDB + Mongoose
- Socket.io
- JWT Authentication
- TypeScript

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB (local or Atlas)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Update `.env` with your configuration

4. Start development server:
```bash
npm run dev
```

### Production Build

```bash
npm run build
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Users
- `GET /api/users/profile` - Get user profile
- `PATCH /api/users/profile` - Update user profile
- `GET /api/users/stats` - Get user stats
- `GET /api/users/search` - Search users

## Socket.io Events

### Client to Server
- `match:request` - Request a match
- `match:cancel` - Cancel matchmaking
- `session:send-message` - Send chat message
- `session:update-task` - Update kanban task
- `session:submit` - Submit project

### Server to Client
- `match:found` - Match found
- `match:cancelled` - Matchmaking cancelled
- `session:message` - New chat message
- `session:task-updated` - Task updated
- `session:timer-update` - Timer countdown

## Matching Algorithm

The matching algorithm uses a weighted scoring system:

```
Match Score =
  (Skill Complementarity × 0.4) +
  (Interest Overlap × 0.2) +
  (Reputation Weight × 0.2) +
  (Activity Status × 0.2)
```

- **Skill Complementarity**: Prefers users with different skills
- **Interest Overlap**: Some shared interests for better collaboration
- **Reputation Weight**: Higher reputation gets better matches
- **Activity Status**: Rewards active users

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/pairon` |
| `JWT_SECRET` | Secret key for JWT | Required |
| `JWT_EXPIRES_IN` | JWT expiration time | `7d` |
| `PORT` | Server port | `5000` |
| `NODE_ENV` | Environment mode | `development` |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:5173` |
