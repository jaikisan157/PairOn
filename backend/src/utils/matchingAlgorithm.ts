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
 * Get project idea based on matched users' skills and interests
 */
export function generateProjectIdea(
  user1: IUser,
  user2: IUser
): { title: string; description: string; category: string; difficulty: string } {
  const allSkills = [...user1.skills, ...user2.skills];
  const allInterests = [...user1.interests, ...user2.interests];

  // Determine difficulty based on experience levels
  const experienceLevels = ['beginner', 'intermediate', 'advanced', 'expert'];
  const user1Level = experienceLevels.indexOf(user1.experienceLevel);
  const user2Level = experienceLevels.indexOf(user2.experienceLevel);
  const avgLevel = Math.round((user1Level + user2Level) / 2);
  const difficulty = experienceLevels[avgLevel] || 'medium';

  // Determine category based on interests
  const category = allInterests[0] || 'Web Development';

  // Generate project title based on skills
  const primarySkill = allSkills[0] || 'Development';
  const secondarySkill = allSkills[1] || 'Design';

  const projectTemplates = [
    {
      title: `${primarySkill} & ${secondarySkill} Collaboration Tool`,
      description: `Build a tool that combines ${primarySkill} and ${secondarySkill} for better productivity.`,
    },
    {
      title: `${category} Dashboard`,
      description: `Create a dashboard for ${category.toLowerCase()} with real-time data visualization.`,
    },
    {
      title: `${primarySkill} Learning Platform`,
      description: `Design a platform to help others learn ${primarySkill} effectively.`,
    },
    {
      title: `${category} Automation Tool`,
      description: `Build an automation tool to streamline ${category.toLowerCase()} workflows.`,
    },
  ];

  const template = projectTemplates[Math.floor(Math.random() * projectTemplates.length)];

  return {
    title: template.title,
    description: template.description,
    category,
    difficulty: difficulty === 'beginner' ? 'easy' : difficulty === 'expert' ? 'hard' : 'medium',
  };
}
