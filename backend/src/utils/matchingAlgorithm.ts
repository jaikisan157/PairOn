import type { IUser } from '../types';

/**
 * Matching Algorithm for PairOn
 * 
 * The algorithm calculates a match score based on four weighted factors:
 * 1. Skill Complementarity (40%): Prefers users with different but complementary skills
 * 2. Interest Overlap (20%): Some shared interests for better collaboration
 * 3. Reputation Weight (20%): Higher reputation users get better matches
 * 4. Activity Status (20%): Rewards active users
 * 
 * Additional rules:
 * - Avoid repeated matching (penalty for previous matches)
 * - Only match active users (online in last 24 hours)
 */

interface MatchScoreInput {
  user1: IUser;
  user2: IUser;
}

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

export function calculateMatchScore(
  user1: IUser,
  user2: IUser
): MatchScoreResult {
  // 1. Skill Complementarity (40% weight)
  // We want users with DIFFERENT skills (complementary expertise)
  const user1SkillSet = new Set(user1.skills.map((s) => s.toLowerCase()));
  const user2SkillSet = new Set(user2.skills.map((s) => s.toLowerCase()));

  // Count unique skills for each user
  const uniqueToUser1 = user1.skills.filter(
    (s) => !user2SkillSet.has(s.toLowerCase())
  ).length;
  const uniqueToUser2 = user2.skills.filter(
    (s) => !user1SkillSet.has(s.toLowerCase())
  ).length;

  const totalUniqueSkills = uniqueToUser1 + uniqueToUser2;
  const totalSkills = user1.skills.length + user2.skills.length;

  // Higher complementarity = more unique skills between them
  const skillComplementarity =
    totalSkills > 0 ? (totalUniqueSkills / totalSkills) * 100 : 50;

  // 2. Interest Overlap (20% weight)
  // We want SOME shared interests for better collaboration
  const user1InterestSet = new Set(user1.interests.map((i) => i.toLowerCase()));
  const overlappingInterests = user2.interests.filter((i) =>
    user1InterestSet.has(i.toLowerCase())
  ).length;
  const totalInterests = new Set([
    ...user1.interests,
    ...user2.interests,
  ]).size;

  // Some overlap is good (30-70% is ideal)
  const interestOverlap =
    totalInterests > 0
      ? Math.min(100, (overlappingInterests / totalInterests) * 200)
      : 50;

  // 3. Reputation Weight (20% weight)
  // Average reputation of both users, normalized to 0-100
  const avgReputation = (user1.reputation + user2.reputation) / 2;
  const reputationWeight = (avgReputation / 5) * 100;

  // 4. Activity Status (20% weight)
  // Check if users are online or recently active
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const user1Active =
    user1.isOnline || new Date(user1.lastActive) > oneDayAgo;
  const user2Active =
    user2.isOnline || new Date(user2.lastActive) > oneDayAgo;

  const activityStatus =
    user1Active && user2Active ? 100 : user1Active || user2Active ? 50 : 0;

  // Calculate weighted score
  const weightedScore =
    skillComplementarity * 0.4 +
    interestOverlap * 0.2 +
    reputationWeight * 0.2 +
    activityStatus * 0.2;

  // Previous match penalty (avoid repeated matching)
  const previousMatchPenalty = user1.previousMatches.includes(user2._id.toString())
    ? 15
    : 0;

  // Final score (clamped between 0 and 100)
  const finalScore = Math.min(
    100,
    Math.max(0, Math.round(weightedScore - previousMatchPenalty))
  );

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

/**
 * Find the best match for a user from a pool of candidates
 */
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
    // Skip if same user
    if (candidate._id.toString() === user._id.toString()) continue;

    const result = calculateMatchScore(user, candidate);

    if (result.score > bestScore && result.score >= minScore) {
      bestScore = result.score;
      bestMatch = candidate;
      bestBreakdown = result.breakdown;
    }
  }

  return {
    matchedUser: bestMatch,
    score: bestScore,
    breakdown: bestBreakdown,
  };
}

/**
 * Get project ideas based on matched users' skills and interests.
 * Returns 3 ideas tailored to the users' combined skill set.
 */

interface ProjectTemplate {
  title: string;
  description: string;
  category: string;
  skills: string[]; // skills that make this template relevant
}

const PROJECT_TEMPLATES: ProjectTemplate[] = [
  // Web Development
  { title: 'Real-time Chat Application', description: 'Build a full-stack chat app with rooms, direct messages, and typing indicators.', category: 'Web Development', skills: ['react', 'node.js', 'socket.io', 'javascript', 'typescript'] },
  { title: 'E-commerce Dashboard', description: 'Create an admin dashboard with real-time analytics, inventory management, and order tracking.', category: 'Web Development', skills: ['react', 'next.js', 'node.js', 'mongodb', 'postgresql'] },
  { title: 'Blog Platform with CMS', description: 'Build a modern blog with markdown editor, categories, tags, and SEO optimization.', category: 'Web Development', skills: ['react', 'next.js', 'tailwindcss', 'node.js', 'mongodb'] },
  { title: 'Task Management Board', description: 'Create a Trello-like kanban board with drag-and-drop, real-time sync, and team features.', category: 'Web Development', skills: ['react', 'typescript', 'node.js', 'socket.io', 'mongodb'] },
  { title: 'URL Shortener with Analytics', description: 'Build a URL shortener that tracks clicks, geographic data, and referral sources.', category: 'Web Development', skills: ['node.js', 'express', 'mongodb', 'react', 'javascript'] },

  // Mobile
  { title: 'Fitness Tracker App', description: 'Build a mobile app that tracks workouts, calories, and displays progress charts.', category: 'Mobile Development', skills: ['react native', 'flutter', 'swift', 'kotlin', 'mobile'] },
  { title: 'Expense Splitter', description: 'Create an app for groups to split bills, track who owes whom, and settle debts.', category: 'Mobile Development', skills: ['react native', 'flutter', 'firebase', 'mobile', 'javascript'] },
  { title: 'Habit Tracker with Streaks', description: 'Build a habit tracking app with daily reminders, streak tracking, and data visualization.', category: 'Mobile Development', skills: ['react native', 'flutter', 'mobile', 'typescript', 'firebase'] },

  // AI/ML
  { title: 'Sentiment Analysis Dashboard', description: 'Build a tool that analyzes sentiment from social media posts or product reviews using NLP.', category: 'AI/ML', skills: ['python', 'machine learning', 'nlp', 'tensorflow', 'react'] },
  { title: 'Image Classification Web App', description: 'Create a web app where users upload images and get AI-powered classifications.', category: 'AI/ML', skills: ['python', 'tensorflow', 'pytorch', 'react', 'flask'] },
  { title: 'AI-Powered Resume Screener', description: 'Build a tool that parses resumes and scores candidates based on job requirements.', category: 'AI/ML', skills: ['python', 'machine learning', 'nlp', 'node.js', 'react'] },
  { title: 'Chatbot with Natural Language', description: 'Create an AI chatbot that understands natural language and provides helpful responses.', category: 'AI/ML', skills: ['python', 'nlp', 'machine learning', 'javascript', 'react'] },

  // DevOps / Backend
  { title: 'CI/CD Pipeline Dashboard', description: 'Build a monitoring dashboard for CI/CD pipelines with build status and deployment history.', category: 'DevOps', skills: ['docker', 'kubernetes', 'aws', 'node.js', 'react'] },
  { title: 'API Rate Limiter Service', description: 'Create a distributed rate limiting service with Redis and a monitoring dashboard.', category: 'Backend', skills: ['node.js', 'redis', 'docker', 'go', 'python'] },
  { title: 'Microservices Starter Kit', description: 'Build a template with API gateway, service discovery, and inter-service communication.', category: 'Backend', skills: ['node.js', 'docker', 'kubernetes', 'go', 'python'] },

  // Data / Analytics
  { title: 'Data Visualization Tool', description: 'Build an interactive dashboard that visualizes CSV/JSON data with charts and filters.', category: 'Data', skills: ['python', 'd3.js', 'react', 'postgresql', 'data science'] },
  { title: 'Web Scraper with Dashboard', description: 'Create a web scraper that collects data and displays it in a beautiful dashboard.', category: 'Data', skills: ['python', 'node.js', 'react', 'mongodb', 'data science'] },

  // Design / UI
  { title: 'Design System Library', description: 'Build a reusable component library with documentation, theming, and accessibility.', category: 'Design', skills: ['react', 'ui/ux design', 'css', 'tailwindcss', 'figma'] },
  { title: 'Portfolio Builder', description: 'Create a tool where users pick templates, customize, and deploy personal portfolios.', category: 'Design', skills: ['react', 'next.js', 'css', 'ui/ux design', 'figma'] },

  // Games
  { title: 'Multiplayer Quiz Game', description: 'Build a real-time multiplayer quiz game with rooms, scoring, and leaderboards.', category: 'Gaming', skills: ['javascript', 'typescript', 'socket.io', 'react', 'node.js'] },
  { title: '2D Platformer Game', description: 'Create a browser-based 2D platformer with levels, enemies, and a level editor.', category: 'Gaming', skills: ['javascript', 'game development', 'html5', 'canvas', 'typescript'] },

  // Blockchain
  { title: 'NFT Marketplace', description: 'Build a marketplace for creating, listing, and trading digital collectibles.', category: 'Blockchain', skills: ['solidity', 'ethereum', 'react', 'web3', 'blockchain'] },
  { title: 'DeFi Yield Calculator', description: 'Create a tool that compares DeFi yields across protocols and tracks returns.', category: 'Blockchain', skills: ['solidity', 'web3', 'react', 'blockchain', 'javascript'] },

  // Open Source / Tools
  { title: 'CLI Tool for Developers', description: 'Build a useful CLI utility (code formatter, project scaffolder, or dev workflow tool).', category: 'Tools', skills: ['node.js', 'python', 'go', 'rust', 'typescript'] },
  { title: 'VS Code Extension', description: 'Create a productivity-boosting VS Code extension with custom commands and UI.', category: 'Tools', skills: ['typescript', 'javascript', 'node.js', 'vscode', 'electron'] },
  { title: 'Open Source Documentation Site', description: 'Build a beautiful documentation site generator with search, versioning, and themes.', category: 'Open Source', skills: ['react', 'next.js', 'markdown', 'typescript', 'node.js'] },

  // Cybersecurity
  { title: 'Password Strength Analyzer', description: 'Build a tool that checks password strength, suggests improvements, and detects breaches.', category: 'Security', skills: ['cybersecurity', 'python', 'node.js', 'react', 'javascript'] },
  { title: 'Network Scanner Dashboard', description: 'Create a web-based network scanning tool with port analysis and vulnerability detection.', category: 'Security', skills: ['cybersecurity', 'python', 'node.js', 'react', 'networking'] },

  // Generic (good for any skill combo)
  { title: 'Collaborative Whiteboard', description: 'Build a real-time collaborative whiteboard with drawing, sticky notes, and sharing.', category: 'Collaboration', skills: ['react', 'socket.io', 'node.js', 'canvas', 'typescript'] },
  { title: 'Event Management Platform', description: 'Create a platform for organizing events with RSVP, ticketing, and notifications.', category: 'Web Development', skills: ['react', 'node.js', 'mongodb', 'express', 'javascript'] },
  { title: 'Social Media Scheduler', description: 'Build a tool to schedule and manage posts across multiple social media platforms.', category: 'Web Development', skills: ['react', 'node.js', 'api', 'mongodb', 'typescript'] },
];

export function generateProjectIdea(
  user1: IUser,
  user2: IUser
): { title: string; description: string; category: string; difficulty: string } {
  const ideas = generateProjectIdeas(user1, user2);
  return ideas[0];
}

export function generateProjectIdeas(
  user1: IUser,
  user2: IUser,
  count: number = 3
): Array<{ title: string; description: string; category: string; difficulty: string }> {
  const allSkills = [...user1.skills, ...user2.skills].map(s => s.toLowerCase());
  const allInterests = [...user1.interests, ...user2.interests].map(i => i.toLowerCase());

  // Score each template based on skill match
  const scored = PROJECT_TEMPLATES.map(template => {
    let score = 0;

    // Skills match (weighted heavily)
    for (const skill of template.skills) {
      if (allSkills.some(s => s.includes(skill) || skill.includes(s))) {
        score += 10;
      }
    }

    // Interest/category match
    if (allInterests.some(i =>
      template.category.toLowerCase().includes(i) || i.includes(template.category.toLowerCase())
    )) {
      score += 5;
    }

    return { template, score };
  });

  // Sort by score (best match first), add some randomness to avoid same results
  scored.sort((a, b) => (b.score + Math.random() * 3) - (a.score + Math.random() * 3));

  // Determine difficulty
  const experienceLevels = ['beginner', 'intermediate', 'advanced', 'expert'];
  const user1Level = experienceLevels.indexOf(user1.experienceLevel);
  const user2Level = experienceLevels.indexOf(user2.experienceLevel);
  const avgLevel = Math.round((user1Level + user2Level) / 2);
  const difficulty = avgLevel <= 0 ? 'easy' : avgLevel >= 3 ? 'hard' : 'medium';

  // Return top N unique ideas
  return scored.slice(0, count).map(({ template }) => ({
    title: template.title,
    description: template.description,
    category: template.category,
    difficulty,
  }));
}

