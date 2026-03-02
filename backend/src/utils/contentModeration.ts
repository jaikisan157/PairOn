/**
 * Content Moderation Utility
 * 
 * Filters explicit/adult/inappropriate content from messages.
 * Uses a curated word list + pattern matching for bypass attempts (l33t speak, etc.)
 */

// Curated list of explicit/inappropriate words/phrases
// This is intentionally kept minimal and uses patterns to catch variations
const EXPLICIT_PATTERNS: RegExp[] = [
    // Sexual content patterns
    /\b(s+e+x+|p+o+r+n+|n+u+d+e+|n+a+k+e+d+|b+o+o+b+|d+i+c+k+|p+e+n+i+s+|v+a+g+i+n+a+|a+s+s+h+o+l+e+|f+u+c+k+|s+h+i+t+|b+i+t+c+h+|w+h+o+r+e+|s+l+u+t+)\b/i,

    // L33t speak variations
    /\b(s3x|p0rn|fck|f\*ck|sh\*t|b\*tch|d\*ck|a\$\$)\b/i,

    // Harassment patterns
    /\b(k+i+l+l\s+y+o+u+r+s+e+l+f+|k+y+s+|r+a+p+e+|m+o+l+e+s+t+)\b/i,

    // Racial slurs (abbreviated patterns to avoid listing full words)
    /\b(n+i+g+g+|f+a+g+g*o*t*|r+e+t+a+r+d+)\b/i,

    // Drug solicitation
    /\b(buy\s+drugs|sell\s+drugs|weed\s+for\s+sale|cocaine|heroin)\b/i,

    // Common bypass: spaces between letters of slurs
    /f\s*u\s*c\s*k/i,
    /s\s*h\s*i\s*t/i,
    /b\s*i\s*t\s*c\s*h/i,

    // Sexting indicators
    /\b(send\s+nudes?|show\s+me\s+your|wanna\s+hook\s*up|dtf|horny)\b/i,

    // Dating/personal info solicitation  
    /\b(what'?s?\s+your\s+(number|phone|insta|snap))\b/i,
];

// Additional single-word blocklist (exact match, case-insensitive)
const BLOCKED_WORDS = new Set([
    'fuck', 'shit', 'bitch', 'ass', 'dick', 'cock', 'pussy', 'cunt',
    'whore', 'slut', 'fag', 'nigger', 'nigga', 'retard', 'retarded',
    'porn', 'hentai', 'xxx', 'milf', 'dildo', 'orgasm', 'masturbate',
]);

export interface ModerationResult {
    isClean: boolean;
    reason?: string;
}

/**
 * Check if a message contains explicit or inappropriate content.
 * Returns { isClean: true } if the message is safe to send.
 * Returns { isClean: false, reason } if it should be blocked.
 */
export function moderateMessage(content: string): ModerationResult {
    if (!content || content.trim().length === 0) {
        return { isClean: true };
    }

    const normalized = content.toLowerCase().trim();

    // Check individual words against blocklist
    const words = normalized.split(/\s+/);
    for (const word of words) {
        // Strip common punctuation from word edges
        const cleanWord = word.replace(/[^a-z0-9]/g, '');
        if (BLOCKED_WORDS.has(cleanWord)) {
            return {
                isClean: false,
                reason: 'Message contains inappropriate language. Keep conversations professional.',
            };
        }
    }

    // Check against regex patterns
    for (const pattern of EXPLICIT_PATTERNS) {
        if (pattern.test(normalized)) {
            return {
                isClean: false,
                reason: 'Message contains explicit or inappropriate content. PairOn is a professional platform.',
            };
        }
    }

    return { isClean: true };
}

/**
 * Calculate the chat priority penalty based on warning count.
 * Priority starts at 100 and decreases with each warning.
 */
export function calculateChatPriority(warnings: number, hasPermanentRemark: boolean): number {
    if (hasPermanentRemark) return 10; // Very low priority  

    switch (warnings) {
        case 0: return 100;
        case 1: return 70;
        case 2: return 40;
        default: return 10;
    }
}
