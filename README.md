# PairOn — Collaborative Developer Platform

Welcome to **PairOn**! This is a complete beginner's guide to understanding, setting up, and running this project. Even if you have never programmed before or have nothing installed on your laptop, this walkthrough will guide you step-by-step.

> **What is PairOn?**
> Setup can be hard. Coding alone can be lonely. PairOn is a full-stack SaaS (Software as a Service) platform where developers pair up, code together in a live browser-based IDE (Integrated Development Environment), and build relationships through a social layer. 

---

## 🌟 What Can You Do With PairOn?

- **Code Together**: A real-time web-based code editor, just like VS Code, running right in your browser. Both you and your partner can type code at the same time and see the changes live.
- **Run Your Code**: It features built-in "WebContainers" that allow you to actually run Node.js projects inside your browser without installing anything extra.
- **Make Friends**: You can send friend requests, see who is online, and chat using the real-time direct messaging system.
- **AI Pair Programmer**: Stuck on a problem? Ask the integrated AI (powered by Groq) to help you write or debug code.

---

## 🧭 How The Project Works

PairOn is split into two main parts, often called a **Full-Stack Application**:

1. **Frontend (The User Interface)**: 
   - Located in the `app/` folder.
   - Built with **React** and **Vite**. This is what you see and interact with in your web browser (buttons, code editor, chat boxes).
2. **Backend (The Server/Brain)**: 
   - Located in the `backend/` folder.
   - Built with **Node.js** and **Express**. It handles data storage, user logins, matches up people randomly, and acts as the middleman for live chats.
3. **Database (Data Storage)**:
   - We use **MongoDB** to permanently store user accounts, chat messages, and friendships.

When you type a message to a friend on the Frontend, it sends a signal to the Backend, which stores it in the Database and then instantly forwards it to your friend's screen.

---

## 🛠️ Step 1: Getting Your Laptop Ready (Prerequisites)

If your laptop is entirely blank, you'll need the following free tools installed.

### 1. Install a Code Editor (VS Code)
You need a place to view our project code.
- Go to [code.visualstudio.com](https://code.visualstudio.com/) and download the installer for your operating system (Windows/Mac/Linux).
- Run the installer and just click "Next" through the default options.

### 2. Install Node.js
Node.js allows your computer to run our project's JavaScript code.
- Go to [nodejs.org](https://nodejs.org/).
- Download the **"LTS" (Long Term Support)** version.
- Run the installer and accept all the defaults.

### 3. Install Git
Git allows you to download the code from GitHub.
- Go to [git-scm.com](https://git-scm.com/downloads).
- Download and install it for your operating system. (Windows users: "Git for Windows" is great).

### 4. Create a MongoDB Database
Our backend needs a database to store data. You have two options:
**Option A: The Cloud Way (Recommended & Easiest)**
- Go to [MongoDB Atlas](https://cloud.mongodb.com/) and create a free account.
- Create a new free cluster (M0 sandbox).
- Set a Username and Password for your database (save these somewhere!).
- Allow access from anywhere (IP address `0.0.0.0/0`).
- Go to "Connect" and get your "Connection String" (it looks like `mongodb+srv://<username>:<password>@cluster0...`).

**Option B: The Local Way**
- Download [MongoDB Community Server](https://www.mongodb.com/try/download/community) and install it on your computer. Your connection string will simply be `mongodb://localhost:27017/pairon`.

---

## 📥 Step 2: Unpacking The Code

Now let's get the project onto your computer.

1. Unzip the PairOn folder you downloaded.
2. Place the folder somewhere easy to find, like your Desktop.
3. Now, open this folder in your code editor. If you are using VS Code, open it, go to `File -> Open Folder`, and select the extracted PairOn folder.

---

## ⚙️ Step 3: Setting Up The Backend (The Server)

The backend needs to know your secret database connection string and a few other rules. Let's set it up.

1. Inside VS Code, open a new Terminal (go to the top menu: `Terminal -> New Terminal`).
2. Move into the backend folder:
   ```bash
   cd backend
   ```
3. Install all the required packages (this downloads all the code our server depends on):
   ```bash
   npm install
   ```
4. We need to create an "_environment variables_" file. In the `backend` folder, you'll see a file called `.env.example`.
   - Right-click `.env.example` in VS Code and select "Copy", then "Paste".
   - Rename the copied file to **exactly** `.env`.
5. Open your new `.env` file. You need to replace the placeholder values with your actual data. Here is the full list of required environment variables for the backend:
   ```env
   # MongoDB Connection (e.g., mongodb://localhost:27017/pairon or a MongoDB Atlas URI)
   MONGODB_URI=<YOUR_MONGODB_URI_HERE>
   
   # JWT Configuration
   JWT_SECRET=<YOUR_JWT_SECRET_HERE>
   JWT_EXPIRES_IN=7d
   
   # Server Configuration
   PORT=5000
   NODE_ENV=development
   
   # Frontend URL (for CORS)
   FRONTEND_URL=http://localhost:5173
   
   # Backend public URL (used for OAuth redirects)
   BACKEND_URL=<YOUR_BACKEND_URL_HERE>
   
   # Groq AI API Key (get a free key from https://console.groq.com)
   GROQ_API_KEY=<YOUR_GROQ_API_KEY_HERE>
   
   # Google OAuth
   GOOGLE_CLIENT_ID=<YOUR_GOOGLE_CLIENT_ID_HERE>
   GOOGLE_CLIENT_SECRET=<YOUR_GOOGLE_CLIENT_SECRET_HERE>
   
   # GitHub OAuth App
   GITHUB_CLIENT_ID=<YOUR_GITHUB_CLIENT_ID_HERE>
   GITHUB_CLIENT_SECRET=<YOUR_GITHUB_CLIENT_SECRET_HERE>
   
   # Email (Brevo/Sendinblue HTTP API - works everywhere, 300 emails/day free)
   BREVO_API_KEY=<YOUR_BREVO_API_KEY_HERE>
   BREVO_SENDER_EMAIL=<YOUR_BREVO_SENDER_EMAIL_HERE>
   ```

6. Now, start the backend server!
   ```bash
   npm run dev
   ```
   If it worked, it should say that it successfully connected to MongoDB and the server is running on port 5000. Keep this terminal running!

---

## 🎨 Step 4: Setting Up The Frontend (The Interface)

We need the visual part of the app to run as well.

1. In VS Code, open a **second** new Terminal by clicking the `+` icon in the terminal panel.
2. Move into the app folder:
   ```bash
   cd app
   ```
3. Install all the required packages:
   ```bash
   npm install
   ```
4. Similar to the backend, we need an environment file. Let's duplicate the `.env.example` inside the `app` folder and rename the copy to `.env`.
5. Open `app/.env` and ensure it has all the variables. Replace placeholders as needed:
   ```env
   VITE_API_URL=http://localhost:5000
   VITE_GOOGLE_CLIENT_ID=<YOUR_GOOGLE_CLIENT_ID_HERE>
   ```
   *(You can leave the Google Client ID blank or as a placeholder unless you are actively setting up 'Log in with Google')*

6. Start the frontend!
   ```bash
   npm run dev
   ```

---

## 🎉 Step 5: Start Using PairOn!

Look at the output in your second terminal. It should say the app is running on something like `http://localhost:5173`. 

- Open up your web browser (Chrome, Edge, Safari, etc.).
- Type `http://localhost:5173` into the address bar. 

**Congratulations!** You should now see the PairOn website running on your very own machine.

### Next Steps to try:
- Click the "Sign Up" button and create a new account.
- Open a second "Incognito" browser window to make a second account.
- Send a friend request between the two accounts.
- Click "Quick Connect" and watch how the two browsers instantly pair up and give you a shared coding window!

---

## 📁 Complete Project Structure Guide

If you want to start editing the code to see how it changes the app, here is the entire project map:

<details>
<summary><b>Click to see full directory structure</b></summary>
<br>

```text
PairOn/
├── .vscode
│   └── launch.json
├── app
│   ├── public
│   │   └── workspace-preview.png
│   ├── src
│   │   ├── components
│   │   │   ├── ui
│   │   │   │   ├── accordion.tsx
│   │   │   │   ├── alert-dialog.tsx
│   │   │   │   ├── alert.tsx
│   │   │   │   ├── aspect-ratio.tsx
│   │   │   │   ├── avatar.tsx
│   │   │   │   ├── badge.tsx
│   │   │   │   ├── breadcrumb.tsx
│   │   │   │   ├── button-group.tsx
│   │   │   │   ├── button.tsx
│   │   │   │   ├── calendar.tsx
│   │   │   │   ├── card.tsx
│   │   │   │   ├── carousel.tsx
│   │   │   │   ├── chart.tsx
│   │   │   │   ├── checkbox.tsx
│   │   │   │   ├── collapsible.tsx
│   │   │   │   ├── command.tsx
│   │   │   │   ├── context-menu.tsx
│   │   │   │   ├── dialog.tsx
│   │   │   │   ├── drawer.tsx
│   │   │   │   ├── dropdown-menu.tsx
│   │   │   │   ├── empty.tsx
│   │   │   │   ├── field.tsx
│   │   │   │   ├── form.tsx
│   │   │   │   ├── hover-card.tsx
│   │   │   │   ├── input-group.tsx
│   │   │   │   ├── input-otp.tsx
│   │   │   │   ├── input.tsx
│   │   │   │   ├── item.tsx
│   │   │   │   ├── kbd.tsx
│   │   │   │   ├── label.tsx
│   │   │   │   ├── menubar.tsx
│   │   │   │   ├── navigation-menu.tsx
│   │   │   │   ├── pagination.tsx
│   │   │   │   ├── popover.tsx
│   │   │   │   ├── progress.tsx
│   │   │   │   ├── radio-group.tsx
│   │   │   │   ├── resizable.tsx
│   │   │   │   ├── scroll-area.tsx
│   │   │   │   ├── select.tsx
│   │   │   │   ├── separator.tsx
│   │   │   │   ├── sheet.tsx
│   │   │   │   ├── sidebar.tsx
│   │   │   │   ├── skeleton.tsx
│   │   │   │   ├── slider.tsx
│   │   │   │   ├── sonner.tsx
│   │   │   │   ├── spinner.tsx
│   │   │   │   ├── switch.tsx
│   │   │   │   ├── table.tsx
│   │   │   │   ├── tabs.tsx
│   │   │   │   ├── textarea.tsx
│   │   │   │   ├── toggle-group.tsx
│   │   │   │   ├── toggle.tsx
│   │   │   │   └── tooltip.tsx
│   │   │   ├── CollabIDE.tsx
│   │   │   ├── CollabIDEHelpers.tsx
│   │   │   ├── CollabIDEMobile.tsx
│   │   │   ├── DashboardRightSidebar.tsx
│   │   │   ├── DashboardSidebar.tsx
│   │   │   ├── GlobalCallUI.tsx
│   │   │   ├── GlobalNotifier.tsx
│   │   │   ├── GlobalThemeToggle.tsx
│   │   │   ├── MatchConfirmModal.tsx
│   │   │   ├── Navigation.tsx
│   │   │   ├── NotificationBell.tsx
│   │   │   └── UserProfileModal.tsx
│   │   ├── context
│   │   │   ├── AuthContext.tsx
│   │   │   ├── CallContext.tsx
│   │   │   ├── index.ts
│   │   │   ├── MatchingContext.tsx
│   │   │   ├── NotificationContext.tsx
│   │   │   └── ThemeContext.tsx
│   │   ├── data
│   │   │   └── constants.ts
│   │   ├── hooks
│   │   │   └── use-mobile.ts
│   │   ├── lib
│   │   │   ├── api.ts
│   │   │   ├── audio.ts
│   │   │   ├── deviceDetect.ts
│   │   │   ├── socket.ts
│   │   │   └── utils.ts
│   │   ├── pages
│   │   │   ├── AdminDashboardPage.tsx
│   │   │   ├── CollaborationPage.tsx
│   │   │   ├── CommunityPage.tsx
│   │   │   ├── CreditsPage.tsx
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── FriendsPage.tsx
│   │   │   ├── index.ts
│   │   │   ├── LandingPage.tsx
│   │   │   ├── LoginPage.tsx
│   │   │   ├── MessagesPage.tsx
│   │   │   ├── OnboardingPage.tsx
│   │   │   ├── ProfilePage.tsx
│   │   │   ├── ProjectsPage.tsx
│   │   │   ├── QuickConnectPage.tsx
│   │   │   ├── RegisterPage.tsx
│   │   │   └── UserProfileViewPage.tsx
│   │   ├── sections
│   │   │   ├── CollaborationSection.tsx
│   │   │   ├── CreditSystemSection.tsx
│   │   │   ├── FinalCTASection.tsx
│   │   │   ├── HeroSection.tsx
│   │   │   ├── HowItWorksSection.tsx
│   │   │   ├── index.ts
│   │   │   ├── MatchModesSection.tsx
│   │   │   ├── ReputationSection.tsx
│   │   │   ├── SafetySection.tsx
│   │   │   └── TestimonialsSection.tsx
│   │   ├── types
│   │   │   └── index.ts
│   │   ├── App.css
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── .env
│   ├── .env.example
│   ├── build.log
│   ├── components.json
│   ├── eslint.config.js
│   ├── index.html
│   ├── info.md
│   ├── package-lock.json
│   ├── package.json
│   ├── postcss.config.js
│   ├── README.md
│   ├── tailwind.config.js
│   ├── tsconfig.app.json
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── vercel.json
│   └── vite.config.ts
├── backend
│   ├── src
│   │   ├── lib
│   │   │   └── ioInstance.ts
│   │   ├── middleware
│   │   │   └── auth.ts
│   │   ├── models
│   │   │   ├── Certificate.ts
│   │   │   ├── CollabProposal.ts
│   │   │   ├── CreditTransaction.ts
│   │   │   ├── DirectMessage.ts
│   │   │   ├── Feedback.ts
│   │   │   ├── Friend.ts
│   │   │   ├── index.ts
│   │   │   ├── Match.ts
│   │   │   ├── Project.ts
│   │   │   ├── QuickChat.ts
│   │   │   └── User.ts
│   │   ├── routes
│   │   │   ├── auth.ts
│   │   │   ├── credits.ts
│   │   │   ├── dm.ts
│   │   │   ├── feedback.ts
│   │   │   ├── friends.ts
│   │   │   ├── projects.ts
│   │   │   └── users.ts
│   │   ├── services
│   │   │   ├── challenge.ts
│   │   │   ├── collabProposal.ts
│   │   │   ├── creditService.ts
│   │   │   ├── quickChat.ts
│   │   │   └── socket.ts
│   │   ├── types
│   │   │   └── index.ts
│   │   ├── utils
│   │   │   ├── contentModeration.ts
│   │   │   ├── matchingAlgorithm.ts
│   │   │   ├── otp.ts
│   │   │   └── topics.ts
│   │   └── server.ts
│   ├── .env
│   ├── .env.example
│   ├── package-lock.json
│   ├── package.json
│   ├── README.md
│   ├── render.yaml
│   └── tsconfig.json
├── .gitignore
├── ABSTRACT.md
├── BACKLOG.md
├── fix_imports.js
├── PairOn_Flowchart.html
├── PairOn_Interview_Prep.md
├── PairOn_Master_Prompt.md
├── PairOn_Project_QA.html
├── README.md
├── TECH_STACK_AND_FEATURES.md
└── update_theme.js
```
</details>

---

## 🔐 Security Notice

**Never commit your `.env` files to GitHub**. These files hold your secret passwords and API keys. We have already instructed git (using `.gitignore` files) to ignore them, but always be careful!

---

*Built for learning, coding, and collaborating!*
