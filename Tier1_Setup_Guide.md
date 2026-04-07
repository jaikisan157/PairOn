# PairOn — Starter Setup Guide (Tier 1)

Welcome to **PairOn**! This guide will help you set up and run the entire project on your own machine from scratch. Follow every step carefully.

---

## 🌟 What is PairOn?

PairOn is a full-stack SaaS platform where developers pair up, code together in a live browser-based IDE, and build relationships through a social layer. It features real-time collaborative coding, AI assistance, direct messaging, friend systems, credits, reputation, and admin moderation.

---

## 🛠️ Prerequisites — What You Need Installed

Before you begin, install the following free tools on your computer:

| Tool | Download Link | Why You Need It |
|------|--------------|-----------------|
| **VS Code** | [code.visualstudio.com](https://code.visualstudio.com/) | Code editor to view and edit the project |
| **Node.js (v18+)** | [nodejs.org](https://nodejs.org/) — download the **LTS** version | Runs the backend server and builds the frontend |
| **MongoDB Atlas** | [cloud.mongodb.com](https://cloud.mongodb.com/) | Free cloud database to store users, messages, etc. |

---

## 📥 Step 1: Unpack The Source Code

1. Locate the downloaded ZIP file (`PairOn-SourceCode.zip`).
2. Right-click it and select **Extract All** (Windows) or double-click (Mac).
3. Place the extracted `PairOn` folder somewhere easy to find (e.g. your Desktop).
4. Open VS Code, then go to **File → Open Folder** and select the `PairOn` folder.

---

## ⚙️ Step 2: Set Up The Backend

1. In VS Code, open a new terminal: **Terminal → New Terminal**.
2. Navigate to the backend folder:
   ```bash
   cd backend
   ```
3. Install all dependencies:
   ```bash
   npm install
   ```
4. Create your environment file:
   - Find the file called `.env.example` in the `backend/` folder.
   - Copy it and rename the copy to exactly `.env`.
   - Open `.env` and fill in **all** the values below:

### Backend Environment Variables (`backend/.env`)

```env
# ──────────────────────────────────────────────
# DATABASE
# ──────────────────────────────────────────────
# Get this from MongoDB Atlas → Connect → Connection String
MONGODB_URI=<YOUR_MONGODB_CONNECTION_STRING>

# ──────────────────────────────────────────────
# JWT (Authentication Tokens)
# ──────────────────────────────────────────────
# Type any random long string (32+ characters). This encrypts user login sessions.
JWT_SECRET=<YOUR_RANDOM_SECRET_STRING>
JWT_EXPIRES_IN=7d

# ──────────────────────────────────────────────
# SERVER
# ──────────────────────────────────────────────
PORT=5000
NODE_ENV=development

# ──────────────────────────────────────────────
# CORS (Frontend URL)
# ──────────────────────────────────────────────
FRONTEND_URL=http://localhost:5173

# ──────────────────────────────────────────────
# BACKEND PUBLIC URL (used for OAuth redirects)
# ──────────────────────────────────────────────
# For local development, use:
BACKEND_URL=http://localhost:5000

# ──────────────────────────────────────────────
# AI — GROQ (Powers the AI pair programmer)
# ──────────────────────────────────────────────
# 1. Go to https://console.groq.com
# 2. Create a free account
# 3. Go to API Keys → Create API Key
# 4. Paste the key below
GROQ_API_KEY=<YOUR_GROQ_API_KEY>

# ──────────────────────────────────────────────
# GOOGLE OAUTH (Login with Google)
# ──────────────────────────────────────────────
# 1. Go to https://console.cloud.google.com
# 2. Create a new project (or use an existing one)
# 3. Go to APIs & Services → Credentials → Create Credentials → OAuth Client ID
# 4. Application type: Web Application
# 5. Add Authorized redirect URIs:
#      http://localhost:5173/login
# 6. Copy the Client ID and Client Secret below
GOOGLE_CLIENT_ID=<YOUR_GOOGLE_CLIENT_ID>
GOOGLE_CLIENT_SECRET=<YOUR_GOOGLE_CLIENT_SECRET>

# ──────────────────────────────────────────────
# GITHUB OAUTH (Login with GitHub + Repo Access)
# ──────────────────────────────────────────────
# 1. Go to https://github.com/settings/developers
# 2. Click "OAuth Apps" → "New OAuth App"
# 3. Application name: PairOn (or anything)
# 4. Homepage URL: http://localhost:5173
# 5. Authorization callback URL: http://localhost:5000/api/auth/github/callback
# 6. Copy the Client ID and Client Secret below
GITHUB_CLIENT_ID=<YOUR_GITHUB_CLIENT_ID>
GITHUB_CLIENT_SECRET=<YOUR_GITHUB_CLIENT_SECRET>

# ──────────────────────────────────────────────
# EMAIL — BREVO (formerly Sendinblue)
# ──────────────────────────────────────────────
# Used for sending OTP verification emails
# 1. Go to https://app.brevo.com and create a free account (300 emails/day free)
# 2. Go to SMTP & API → API Keys → Generate a new API key
# 3. Paste below
BREVO_API_KEY=<YOUR_BREVO_API_KEY>
BREVO_SENDER_EMAIL=<YOUR_EMAIL_ADDRESS>
```

5. Start the backend:
   ```bash
   npm run dev
   ```
   You should see:
   ```
   ✅ MongoDB connected successfully
   🚀 Server running on port 5000
   ```
   **Keep this terminal running.**

---

## 🎨 Step 3: Set Up The Frontend

1. Open a **second** terminal in VS Code (click the `+` icon).
2. Navigate to the frontend folder:
   ```bash
   cd app
   ```
3. Install all dependencies:
   ```bash
   npm install
   ```
4. Create your environment file:
   - Find `.env.example` in the `app/` folder.
   - Copy it and rename the copy to `.env`.
   - Fill in the values:

### Frontend Environment Variables (`app/.env`)

```env
# Backend server URL (must match the PORT in backend/.env)
VITE_API_URL=http://localhost:5000

# Same Google Client ID you used in the backend
VITE_GOOGLE_CLIENT_ID=<YOUR_GOOGLE_CLIENT_ID>
```

5. Start the frontend:
   ```bash
   npm run dev
   ```

---

## 🎉 Step 4: Open The App

Open your web browser and go to:

```
http://localhost:5173
```

**You're live!** Create an account and explore the platform.

### Quick Test:
1. **Sign up** with an email and password.
2. Open a second browser window (Incognito) and create a second account.
3. Send a **friend request** from one account to the other.
4. Click **Quick Connect** on both browsers — you'll be matched instantly into a shared coding session!

---

## 🔐 Security Reminder

**Never share your `.env` files publicly.** They contain API keys and secrets. The `.gitignore` file is already configured to exclude them, but always double-check before sharing your code.

---

*Thank you for purchasing PairOn. Happy building!*
