import type { IUser } from '../types';

/**
 * Matching Algorithm for PairOn
 *
 * Weighted factors:
 * 1. Skill Complementarity (40%)
 * 2. Interest Overlap (20%)
 * 3. Reputation Weight (20%)
 * 4. Activity Status (20%)
 */

interface MatchScoreResult {
  score: number;
  breakdown: {
    skillComplementarity: number;
    interestOverlap: number;
    reputationWeight: number;
    activityStatus: number;
    previousMatchPenalty: number;
  };
}

export function calculateMatchScore(user1: IUser, user2: IUser): MatchScoreResult {
  const user1SkillSet = new Set(user1.skills.map((s) => s.toLowerCase()));
  const user2SkillSet = new Set(user2.skills.map((s) => s.toLowerCase()));

  const uniqueToUser1 = user1.skills.filter((s) => !user2SkillSet.has(s.toLowerCase())).length;
  const uniqueToUser2 = user2.skills.filter((s) => !user1SkillSet.has(s.toLowerCase())).length;
  const totalUniqueSkills = uniqueToUser1 + uniqueToUser2;
  const totalSkills = user1.skills.length + user2.skills.length;
  const skillComplementarity = totalSkills > 0 ? (totalUniqueSkills / totalSkills) * 100 : 50;

  const user1InterestSet = new Set(user1.interests.map((i) => i.toLowerCase()));
  const overlappingInterests = user2.interests.filter((i) => user1InterestSet.has(i.toLowerCase())).length;
  const totalInterests = new Set([...user1.interests, ...user2.interests]).size;
  const interestOverlap = totalInterests > 0 ? Math.min(100, (overlappingInterests / totalInterests) * 200) : 50;

  const avgReputation = (user1.reputation + user2.reputation) / 2;
  const reputationWeight = (avgReputation / 5) * 100;

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const user1Active = user1.isOnline || new Date(user1.lastActive) > oneDayAgo;
  const user2Active = user2.isOnline || new Date(user2.lastActive) > oneDayAgo;
  const activityStatus = user1Active && user2Active ? 100 : user1Active || user2Active ? 50 : 0;

  const weightedScore = skillComplementarity * 0.4 + interestOverlap * 0.2 + reputationWeight * 0.2 + activityStatus * 0.2;
  const previousMatchPenalty = user1.previousMatches.includes(user2._id.toString()) ? 15 : 0;
  const finalScore = Math.min(100, Math.max(0, Math.round(weightedScore - previousMatchPenalty)));

  return {
    score: finalScore,
    breakdown: {
      skillComplementarity: Math.round(skillComplementarity),
      interestOverlap: Math.round(interestOverlap),
      reputationWeight: Math.round(reputationWeight),
      activityStatus: Math.round(activityStatus),
      previousMatchPenalty,
    },
  };
}

export function findBestMatch(
  user: IUser,
  candidates: IUser[],
  minScore: number = 60
): { matchedUser: IUser | null; score: number; breakdown: MatchScoreResult['breakdown'] } {
  let bestMatch: IUser | null = null;
  let bestScore = 0;
  let bestBreakdown: MatchScoreResult['breakdown'] = {
    skillComplementarity: 0,
    interestOverlap: 0,
    reputationWeight: 0,
    activityStatus: 0,
    previousMatchPenalty: 0,
  };

  for (const candidate of candidates) {
    if (candidate._id.toString() === user._id.toString()) continue;
    const result = calculateMatchScore(user, candidate);
    if (result.score > bestScore && result.score >= minScore) {
      bestScore = result.score;
      bestMatch = candidate;
      bestBreakdown = result.breakdown;
    }
  }

  return { matchedUser: bestMatch, score: bestScore, breakdown: bestBreakdown };
}

// ─────────────────────────────────────────────────────────────────────────────
// Project Idea Generator
// Only includes projects buildable with npm packages inside a browser-based IDE
// ─────────────────────────────────────────────────────────────────────────────

interface ProjectTemplate {
  title: string;
  description: string;
  category: string;
  skills: string[];
}

const PROJECT_TEMPLATES: ProjectTemplate[] = [
  // ── Real-time & Collaboration ─────────────────────────────────────────────
  { title: 'Real-time Chat App', description: 'Build a full-stack chat with rooms, typing indicators, and online presence using Socket.IO and React.', category: 'Fullstack', skills: ['react', 'node.js', 'socket.io', 'express', 'typescript'] },
  { title: 'Collaborative Whiteboard', description: 'Create a shared drawing canvas with real-time sync, shapes, and color pickers.', category: 'Fullstack', skills: ['react', 'socket.io', 'node.js', 'canvas', 'typescript'] },
  { title: 'Multiplayer Trivia Quiz', description: 'Build a real-time quiz game with rooms, timed questions, and a live leaderboard.', category: 'Games', skills: ['react', 'socket.io', 'node.js', 'typescript', 'express'] },
  { title: 'Live Code Editor Share', description: 'Create a Monaco-based shared code editor with syntax highlighting and real-time cursor sharing.', category: 'Tools', skills: ['react', 'socket.io', 'monaco-editor', 'node.js', 'typescript'] },
  { title: 'Collaborative Task Board', description: 'Build a Trello-style kanban board with drag-and-drop and real-time team sync.', category: 'Fullstack', skills: ['react', 'socket.io', 'node.js', 'mongodb', 'typescript'] },
  { title: 'Group Decision Maker', description: 'Create a real-time voting app where teams rank options and reach consensus instantly.', category: 'Fullstack', skills: ['react', 'socket.io', 'node.js', 'express', 'javascript'] },
  { title: 'Live Poll System', description: 'Build a real-time polling platform with animated live results and embed support.', category: 'Fullstack', skills: ['react', 'socket.io', 'node.js', 'chart.js', 'typescript'] },
  { title: 'Peer-to-Peer Markdown Wiki', description: 'Build a markdown-powered wiki with real-time collaborative editing and page history.', category: 'Fullstack', skills: ['react', 'socket.io', 'node.js', 'marked', 'typescript'] },

  // ── Web Apps & SPAs ───────────────────────────────────────────────────────
  { title: 'Personal Finance Dashboard', description: 'Build a budgeting app with expense categories, charts, and monthly summaries.', category: 'Web App', skills: ['react', 'recharts', 'node.js', 'express', 'mongodb'] },
  { title: 'Recipe Discovery App', description: 'Create a searchable recipe app with filters, favourites, and step-by-step cooking mode.', category: 'Web App', skills: ['react', 'typescript', 'node.js', 'express', 'mongodb'] },
  { title: 'Blog Platform with Markdown', description: 'Build a full-stack blog with markdown editor, categories, tags, and reading time.', category: 'Fullstack', skills: ['react', 'node.js', 'marked', 'mongodb', 'express'] },
  { title: 'Job Board App', description: 'Create a job posting platform with role-based access for employers and applicants.', category: 'Fullstack', skills: ['react', 'node.js', 'express', 'mongodb', 'typescript'] },
  { title: 'Event Ticketing Platform', description: 'Build an event management app with ticket purchase, QR codes, and attendee lists.', category: 'Fullstack', skills: ['react', 'node.js', 'express', 'qrcode', 'mongodb'] },
  { title: 'Social Bookmarks App', description: 'Create a shareable bookmark manager with auto-tagging, collections, and full-text search.', category: 'Fullstack', skills: ['react', 'node.js', 'mongodb', 'express', 'typescript'] },
  { title: 'Study Flashcard App', description: 'Build a spaced-repetition flashcard app with decks, tags, and a practice session tracker.', category: 'Web App', skills: ['react', 'typescript', 'node.js', 'express', 'mongodb'] },
  { title: 'Course Progress Tracker', description: 'Create a learning tracker that monitors courses, lessons, and shows streaks and completion rates.', category: 'Web App', skills: ['react', 'typescript', 'recharts', 'node.js', 'mongodb'] },
  { title: 'Habit Tracker', description: 'Build a daily habit tracker with streak counts, calendar heatmap, and reminders.', category: 'Web App', skills: ['react', 'typescript', 'date-fns', 'recharts', 'mongodb'] },
  { title: 'Expense Splitter', description: 'Create an app for groups to track shared expenses, calculate who owes whom, and settle up.', category: 'Web App', skills: ['react', 'typescript', 'node.js', 'express', 'mongodb'] },
  { title: 'Book Review Platform', description: 'Build a Goodreads-like app where users track reading lists, write reviews, and follow friends.', category: 'Fullstack', skills: ['react', 'node.js', 'express', 'mongodb', 'typescript'] },
  { title: 'Online Marketplace', description: 'Build a product listing platform with search, filters, product pages, and cart.', category: 'Fullstack', skills: ['react', 'node.js', 'express', 'mongodb', 'typescript'] },
  { title: 'Movie & TV Watchlist App', description: 'Create a watchlist manager with TMDB API integration, ratings, and progress tracking.', category: 'Web App', skills: ['react', 'typescript', 'node.js', 'axios', 'css'] },
  { title: 'Resume Builder', description: 'Build an interactive resume editor with templates, live preview, and PDF export.', category: 'Web App', skills: ['react', 'typescript', 'jspdf', 'css', 'html2canvas'] },
  { title: 'Music Player App', description: 'Create a web music player with playlist management, visualizer, and audio controls.', category: 'Web App', skills: ['react', 'typescript', 'web audio api', 'css', 'howler'] },
  { title: 'Weather Dashboard', description: 'Build a weather app with city search, 7-day forecast, and animated icons.', category: 'Web App', skills: ['react', 'typescript', 'axios', 'recharts', 'leaflet'] },
  { title: 'Dictionary & Word Explorer', description: 'Create an advanced dictionary app with synonyms, usage examples, and pronunciation.', category: 'Web App', skills: ['react', 'typescript', 'node.js', 'express', 'axios'] },
  { title: 'Invoice Generator', description: 'Build a professional invoice builder with line items, tax calculation, and PDF export.', category: 'Web App', skills: ['react', 'typescript', 'jspdf', 'node.js', 'express'] },
  { title: 'Grocery List Manager', description: 'Create a smart grocery list app with categories, price tracking, and recurring item memory.', category: 'Web App', skills: ['react', 'typescript', 'node.js', 'express', 'mongodb'] },
  { title: 'Travel Planner App', description: 'Build an itinerary planner with day-by-day planning, maps, and packing checklist.', category: 'Web App', skills: ['react', 'typescript', 'leaflet', 'node.js', 'mongodb'] },
  { title: 'Countdown Timer Collection', description: 'Create a multi-purpose countdown app for events, focus sessions, and custom timers.', category: 'Web App', skills: ['react', 'typescript', 'css', 'javascript', 'howler'] },
  { title: 'Meditation & Breathing App', description: 'Build a guided breathing and meditation app with animated sessions and progress tracking.', category: 'Web App', skills: ['react', 'typescript', 'framer-motion', 'css', 'howler'] },

  // ── Productivity Tools ────────────────────────────────────────────────────
  { title: 'Markdown Note-Taking App', description: 'Build a split-pane markdown editor with folders, tags, and local storage sync.', category: 'Tools', skills: ['react', 'typescript', 'marked', 'codemirror', 'css'] },
  { title: 'Pomodoro Focus Timer', description: 'Create a Pomodoro app with session tracking, stats, and background sounds.', category: 'Tools', skills: ['react', 'typescript', 'css', 'howler', 'javascript'] },
  { title: 'Clipboard Manager', description: 'Build a browser clipboard manager that stores copy history with search and pin features.', category: 'Tools', skills: ['react', 'typescript', 'indexeddb', 'css', 'javascript'] },
  { title: 'JSON/YAML Editor', description: 'Create an interactive JSON and YAML editor with schema validation and diff view.', category: 'Tools', skills: ['react', 'typescript', 'codemirror', 'js-yaml', 'javascript'] },
  { title: 'Password Generator & Manager', description: 'Build a secure password tool with strength checker, custom rules, and local encrypted vault.', category: 'Tools', skills: ['react', 'typescript', 'crypto-js', 'zxcvbn', 'css'] },
  { title: 'Code Snippet Manager', description: 'Create a developer snippet library with syntax highlighting, tags, and quick copy.', category: 'Tools', skills: ['react', 'typescript', 'prism.js', 'mongodb', 'node.js'] },
  { title: 'Read-It-Later App', description: 'Build a read-later service where users save URLs, and it extracts and presents articles cleanly.', category: 'Tools', skills: ['react', 'node.js', 'cheerio', 'express', 'mongodb'] },
  { title: 'Time Zone Converter', description: 'Build a beautiful tool to compare times across multiple time zones simultaneously.', category: 'Tools', skills: ['react', 'typescript', 'luxon', 'date-fns', 'css'] },
  { title: 'API Tester (Postman Lite)', description: 'Create an in-browser REST API tester with request builder, history, and response viewer.', category: 'Tools', skills: ['react', 'typescript', 'axios', 'node.js', 'css'] },
  { title: 'Color Palette Studio', description: 'Build a color palette tool with accessibility checking, contrast ratios, and CSS export.', category: 'Tools', skills: ['react', 'typescript', 'chroma.js', 'css', 'javascript'] },
  { title: 'Regex Playground', description: 'Build an interactive regex tester with live highlighting and a reusable pattern library.', category: 'Tools', skills: ['react', 'javascript', 'typescript', 'css', 'node.js'] },
  { title: 'CSS Gradient Generator', description: 'Create a visual gradient builder with multi-stop support, preview, and CSS copy.', category: 'Tools', skills: ['react', 'typescript', 'css', 'javascript', 'chroma.js'] },
  { title: 'SVG Icon Editor', description: 'Build a browser-based SVG editor for tweaking icons with color, size, and path transforms.', category: 'Tools', skills: ['react', 'typescript', 'svg', 'css', 'javascript'] },
  { title: 'Text Diff Viewer', description: 'Create a clean diff viewer that highlights changes between two text blocks word-by-word.', category: 'Tools', skills: ['react', 'typescript', 'diff', 'css', 'javascript'] },
  { title: 'Unit Converter', description: 'Build a comprehensive unit converter covering length, weight, temperature, currency, and more.', category: 'Tools', skills: ['react', 'typescript', 'javascript', 'css', 'node.js'] },
  { title: 'QR Code Generator & Scanner', description: 'Create a QR code generator with custom styling and a live camera scanner.', category: 'Tools', skills: ['react', 'qrcode', 'typescript', 'css', 'javascript'] },

  // ── Data Visualization ────────────────────────────────────────────────────
  { title: 'CSV Data Visualizer', description: 'Build an interactive CSV viewer that auto-detects columns and renders charts from data.', category: 'Data', skills: ['react', 'typescript', 'recharts', 'd3', 'papaparse'] },
  { title: 'GitHub Stats Dashboard', description: 'Visualize GitHub profile stats, repo activity graphs, and language breakdowns via the GitHub API.', category: 'Data', skills: ['react', 'typescript', 'recharts', 'd3', 'axios'] },
  { title: 'Crypto Price Tracker', description: 'Build a dashboard tracking live cryptocurrency prices with candlestick charts and portfolio view.', category: 'Data', skills: ['react', 'typescript', 'recharts', 'axios', 'node.js'] },
  { title: 'Sports Stats Dashboard', description: 'Create an analytics dashboard for a sport of choice with charts, tables, and player comparisons.', category: 'Data', skills: ['react', 'typescript', 'recharts', 'd3', 'javascript'] },
  { title: 'Real-time Stock Watcher', description: 'Build a stock price monitor with real-time updates, watchlists, and simple technical indicators.', category: 'Data', skills: ['react', 'typescript', 'recharts', 'axios', 'socket.io'] },
  { title: 'World Map Data Explorer', description: 'Create an interactive SVG world map that visualizes country-level data with tooltips.', category: 'Data', skills: ['react', 'typescript', 'd3', 'topojson', 'css'] },
  { title: 'Fitness Progress Charts', description: 'Build a workout logging app with progress charts, volume tracking, and personal bests.', category: 'Data', skills: ['react', 'typescript', 'recharts', 'node.js', 'mongodb'] },

  // ── Browser Games ─────────────────────────────────────────────────────────
  { title: 'Typing Speed Racer', description: 'Build a multiplayer typing race with real-time WPM tracking, accuracy, and leaderboards.', category: 'Games', skills: ['react', 'socket.io', 'node.js', 'typescript', 'css'] },
  { title: 'Snake Game with Power-ups', description: 'Recreate the classic snake game with modern power-ups, modes, and high scores.', category: 'Games', skills: ['react', 'typescript', 'canvas', 'css', 'javascript'] },
  { title: 'Tetris Clone', description: 'Build a faithful Tetris implementation with hold piece, ghost piece, and score system.', category: 'Games', skills: ['react', 'typescript', 'canvas', 'javascript', 'css'] },
  { title: 'Wordle Clone', description: 'Recreate Wordle with a custom word list, hard mode, share feature, and dark theme.', category: 'Games', skills: ['react', 'typescript', 'javascript', 'css', 'node.js'] },
  { title: 'Memory Card Game', description: 'Build a card matching memory game with themes, difficulty levels, and timer.', category: 'Games', skills: ['react', 'typescript', 'css', 'framer-motion', 'javascript'] },
  { title: 'Minesweeper', description: 'Create a fully-featured Minesweeper with flagging, chord-click, and difficulty settings.', category: 'Games', skills: ['react', 'typescript', 'css', 'javascript', 'canvas'] },
  { title: '2048 Puzzle Game', description: 'Build the popular 2048 tile puzzle with undo, animations, and high score persistence.', category: 'Games', skills: ['react', 'typescript', 'framer-motion', 'css', 'javascript'] },
  { title: 'Chess Board (PvP)', description: 'Create a browser chess game with legal move validation, check detection, and PvP mode.', category: 'Games', skills: ['react', 'typescript', 'chess.js', 'css', 'javascript'] },
  { title: 'Tower Defense Game', description: 'Build a top-down tower defense game with wave mechanics, upgrades, and canvas rendering.', category: 'Games', skills: ['react', 'typescript', 'canvas', 'javascript', 'css'] },
  { title: 'Flappy Bird Clone', description: 'Recreate Flappy Bird in the browser with physics, obstacles, and a difficulty curve.', category: 'Games', skills: ['react', 'typescript', 'canvas', 'javascript', 'css'] },
  { title: 'Hangman Game', description: 'Build a themed hangman game with categories, hints, and animated SVG gallows.', category: 'Games', skills: ['react', 'typescript', 'svg', 'css', 'javascript'] },
  { title: 'Space Shooter Game', description: 'Create a scrolling space shooter with enemies, power-ups, and boss fights using canvas.', category: 'Games', skills: ['react', 'typescript', 'canvas', 'javascript', 'howler'] },
  { title: 'Tic-Tac-Toe with AI', description: 'Build a tic-tac-toe game with a minimax AI opponent and adjustable difficulty.', category: 'Games', skills: ['react', 'typescript', 'javascript', 'css', 'algorithm'] },
  { title: 'Infinite Runner Game', description: 'Create a browser-based endless runner with obstacles, coins, and procedural generation.', category: 'Games', skills: ['react', 'canvas', 'typescript', 'howler', 'javascript'] },
  { title: 'Breakout / Arkanoid Clone', description: 'Build a ball-and-paddle breakout game with power-ups, lives, and level editor.', category: 'Games', skills: ['react', 'typescript', 'canvas', 'javascript', 'css'] },

  // ── E-commerce ────────────────────────────────────────────────────────────
  { title: 'Product Landing Page Builder', description: 'Build a no-code landing page editor for products with drag-and-drop sections and live preview.', category: 'Web App', skills: ['react', 'typescript', 'framer-motion', 'css', 'node.js'] },
  { title: 'Shopping Cart & Checkout', description: 'Create a full e-commerce cart with product filters, cart management, and checkout flow.', category: 'Fullstack', skills: ['react', 'typescript', 'node.js', 'express', 'mongodb'] },
  { title: 'Flash Sale Timer App', description: 'Create an e-commerce flash deal system with countdown timers and live stock counters.', category: 'Web App', skills: ['react', 'socket.io', 'node.js', 'typescript', 'mongodb'] },
  { title: 'Coupon Code Manager', description: 'Build a discount code generator, validator, and redemption tracker for small shops.', category: 'Fullstack', skills: ['react', 'node.js', 'express', 'mongodb', 'typescript'] },

  // ── Social / Community ────────────────────────────────────────────────────
  { title: 'Micro-Blog Platform', description: 'Create a Twitter-like microblogging platform with posts, likes, follows, and hashtags.', category: 'Fullstack', skills: ['react', 'node.js', 'socket.io', 'express', 'mongodb'] },
  { title: 'Community Forum', description: 'Build a Reddit-style forum with threads, upvotes, categories, and nested comments.', category: 'Fullstack', skills: ['react', 'node.js', 'express', 'mongodb', 'typescript'] },
  { title: 'Anonymous Confessions Board', description: 'Create an anonymous sharing platform with moderation, upvotes, and category filters.', category: 'Fullstack', skills: ['react', 'node.js', 'express', 'mongodb', 'socket.io'] },
  { title: 'Study Partner Finder', description: 'Build a matchmaking platform for students to find study partners based on subject and schedule.', category: 'Fullstack', skills: ['react', 'socket.io', 'node.js', 'mongodb', 'typescript'] },
  { title: 'Remote Work Hub', description: 'Create a platform for remote workers to find coworking buddies, share resources, and post check-ins.', category: 'Fullstack', skills: ['react', 'node.js', 'socket.io', 'express', 'mongodb'] },
  { title: 'Daily Stand-up Tracker', description: 'Build a team stand-up tracker where members post daily updates and blockers.', category: 'Fullstack', skills: ['react', 'node.js', 'express', 'mongodb', 'typescript'] },

  // ── API / Backend Focused ─────────────────────────────────────────────────
  { title: 'URL Shortener with Analytics', description: 'Build a URL shortener that tracks click counts, referrers, and geographic data.', category: 'Fullstack', skills: ['node.js', 'express', 'mongodb', 'react', 'typescript'] },
  { title: 'REST API Playground', description: 'Scaffold a full CRUD REST API with auth, rate limiting, and Swagger docs.', category: 'Backend', skills: ['node.js', 'express', 'mongodb', 'jwt', 'typescript'] },
  { title: 'Webhook Relay & Inspector', description: 'Build a tool that receives webhooks, logs payloads, and lets you replay them.', category: 'Backend', skills: ['node.js', 'express', 'socket.io', 'typescript', 'mongodb'] },
  { title: 'API Mock Server', description: 'Create a mock server that generates realistic fake data for API endpoints on demand.', category: 'Tools', skills: ['node.js', 'express', 'faker.js', 'typescript', 'react'] },
  { title: 'GraphQL Server & Playground', description: 'Build a simple GraphQL server with schema explorer and live query playground.', category: 'Backend', skills: ['node.js', 'graphql', 'express', 'mongodb', 'typescript'] },
  { title: 'Email Template Builder', description: 'Build a drag-and-drop email template editor with preview and HTML export.', category: 'Tools', skills: ['react', 'typescript', 'mjml', 'node.js', 'express'] },
  { title: 'Notification Center API', description: 'Create an in-app notification system with read/unread, types, and real-time push.', category: 'Backend', skills: ['node.js', 'express', 'socket.io', 'mongodb', 'typescript'] },

  // ── Creative / Fun ────────────────────────────────────────────────────────
  { title: 'Meme Generator', description: 'Create a meme builder with templates, drag-and-drop text, image upload, and share link.', category: 'Web App', skills: ['react', 'typescript', 'canvas', 'css', 'javascript'] },
  { title: 'ASCII Art Generator', description: 'Build a tool that converts images or text to styled ASCII art with copy and download.', category: 'Tools', skills: ['react', 'typescript', 'canvas', 'javascript', 'css'] },
  { title: 'Pixel Art Editor', description: 'Create a browser pixel art editor with palette, fill, undo/redo, and PNG export.', category: 'Creative', skills: ['react', 'typescript', 'canvas', 'javascript', 'css'] },
  { title: 'Generative Art Canvas', description: 'Build an interactive generative art app where parameters create unique visuals.', category: 'Creative', skills: ['react', 'typescript', 'p5.js', 'canvas', 'css'] },
  { title: 'Random Quote Machine', description: 'Create a beautifully designed random quote generator with categories, favorites, and share.', category: 'Web App', skills: ['react', 'typescript', 'node.js', 'express', 'css'] },
  { title: 'Virtual Drum Kit', description: 'Build a browser drum machine with keyboard controls, sound packs, and beat recording.', category: 'Creative', skills: ['react', 'typescript', 'web audio api', 'css', 'howler'] },
  { title: 'Interactive Storyteller', description: 'Create a choose-your-own-adventure engine with branching narratives and progress saving.', category: 'Web App', skills: ['react', 'typescript', 'framer-motion', 'node.js', 'mongodb'] },
  { title: 'Mood Journal', description: 'Build a mood tracking journal with emoji entry, trend charts, and private notes.', category: 'Web App', skills: ['react', 'typescript', 'recharts', 'date-fns', 'node.js'] },
  { title: 'Emoji Keyboard Builder', description: 'Create a customisable emoji keyboard widget with categories, copy, and skin-tone support.', category: 'Web App', skills: ['react', 'typescript', 'css', 'javascript', 'node.js'] },
  { title: 'Soundboard App', description: 'Build a browser soundboard with customisable buttons, sound upload, and keyboard shortcuts.', category: 'Creative', skills: ['react', 'typescript', 'howler', 'css', 'javascript'] },
];

// Dynamic title variations so suggestions feel fresh each session
const TITLE_PREFIXES = ['', 'Modern ', 'Smart ', 'Next-Gen ', 'Open Source ', 'Minimal ', 'Full-Stack '];
const TITLE_SUFFIXES = ['', ' 2.0', ' Pro', ' Lite', ' Studio', ' Hub', ' Kit'];

export function generateProjectIdea(
  user1: IUser,
  user2: IUser
): { title: string; description: string; category: string; difficulty: string } {
  return generateProjectIdeas(user1, user2)[0];
}

export function generateProjectIdeas(
  user1: IUser,
  user2: IUser,
  count: number = 3
): Array<{ title: string; description: string; category: string; difficulty: string }> {
  const allSkills = [...user1.skills, ...user2.skills].map((s) => s.toLowerCase());
  const allInterests = [...user1.interests, ...user2.interests].map((i) => i.toLowerCase());

  const scored = PROJECT_TEMPLATES.map((template) => {
    let score = 0;
    for (const skill of template.skills) {
      if (allSkills.some((s) => s.includes(skill) || skill.includes(s))) score += 10;
    }
    if (allInterests.some((i) => template.category.toLowerCase().includes(i) || i.includes(template.category.toLowerCase()))) {
      score += 5;
    }
    return { template, score };
  });

  // Strong randomisation so each match session picks differently
  scored.sort((a, b) => b.score + Math.random() * 12 - (a.score + Math.random() * 12));

  const experienceLevels = ['beginner', 'intermediate', 'advanced', 'expert'];
  const user1Level = experienceLevels.indexOf(user1.experienceLevel);
  const user2Level = experienceLevels.indexOf(user2.experienceLevel);
  const avgLevel = Math.round((user1Level + user2Level) / 2);
  const difficulty = avgLevel <= 0 ? 'easy' : avgLevel >= 3 ? 'hard' : 'medium';

  return scored.slice(0, count).map(({ template }) => {
    const prefix = TITLE_PREFIXES[Math.floor(Math.random() * TITLE_PREFIXES.length)];
    const suffix = TITLE_SUFFIXES[Math.floor(Math.random() * TITLE_SUFFIXES.length)];
    const hasVariation = Math.random() > 0.4;
    return {
      title: hasVariation ? `${prefix}${template.title}${suffix}`.trim() : template.title,
      description: template.description,
      category: template.category,
      difficulty,
    };
  });
}
