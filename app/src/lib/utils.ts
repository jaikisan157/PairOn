import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export function formatDuration(hours: number): string {
  if (hours < 24) {
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''}`;
}

export function calculateMatchScore(
  user1Skills: string[],
  user1Interests: string[],
  user1Reputation: number,
  user2Skills: string[],
  user2Interests: string[],
  user2Reputation: number,
  previousMatches: string[]
): number {
  // Skill complementarity (40%)
  const user1SkillSet = new Set(user1Skills.map(s => s.toLowerCase()));
  const user2SkillSet = new Set(user2Skills.map(s => s.toLowerCase()));
  
  // Complementary skills = skills that don't overlap (different expertise)
  const uniqueToUser1 = user1Skills.filter(s => !user2SkillSet.has(s.toLowerCase()));
  const uniqueToUser2 = user2Skills.filter(s => !user1SkillSet.has(s.toLowerCase()));
  
  const totalUniqueSkills = uniqueToUser1.length + uniqueToUser2.length;
  const totalSkills = user1Skills.length + user2Skills.length;
  const skillComplementarity = totalSkills > 0 ? (totalUniqueSkills / totalSkills) * 100 : 50;
  
  // Interest overlap (20%)
  const user1InterestSet = new Set(user1Interests.map(i => i.toLowerCase()));
  const overlappingInterests = user2Interests.filter(i => 
    user1InterestSet.has(i.toLowerCase())
  );
  const totalInterests = new Set([...user1Interests, ...user2Interests]).size;
  const interestOverlap = totalInterests > 0 
    ? (overlappingInterests.length / totalInterests) * 100 
    : 50;
  
  // Reputation weight (20%)
  const avgReputation = (user1Reputation + user2Reputation) / 2;
  const reputationWeight = (avgReputation / 5) * 100;
  
  // Activity status (20%) - simplified as random for demo
  const activityStatus = 80;
  
  // Calculate weighted score
  const score = (
    skillComplementarity * 0.4 +
    interestOverlap * 0.2 +
    reputationWeight * 0.2 +
    activityStatus * 0.2
  );
  
  // Penalty for previous matches (avoid repeated matching)
  const previousMatchPenalty = previousMatches.includes('user-2') ? 15 : 0;
  
  return Math.min(100, Math.max(0, Math.round(score - previousMatchPenalty)));
}

export function getReputationBadge(reputation: number): { label: string; color: string } {
  if (reputation >= 4.5) return { label: 'Exceptional', color: 'bg-green-500' };
  if (reputation >= 4.0) return { label: 'Very Helpful', color: 'bg-blue-500' };
  if (reputation >= 3.0) return { label: 'Helpful', color: 'bg-yellow-500' };
  return { label: 'New', color: 'bg-gray-400' };
}

export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

export function debounce<T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}
