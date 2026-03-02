import { User, CreditTransaction } from '../models';

// Credit amounts for each action
export const CREDIT_VALUES = {
    // Earning
    onboarding_bonus: 25,
    profile_complete: 10,
    session_complete: 50,
    quickchat_helpful: 5,
    positive_feedback: 10,
    daily_streak: 3,
    submission: 15,
    help_user: 10,

    // Spending
    certificate: 50,
    skill_badge: 30,
    priority_matching: 20,
    profile_boost: 15,
    unlock_ideas: 10,
    remark_removal: 100, // real dollars handled separately, but this is the credit component
};

// Reputation points per action
export const REPUTATION_VALUES = {
    session_complete: 5,
    quickchat_helpful: 1,
    positive_feedback: 3,
    submission: 2,
};

/**
 * Award credits to a user and log the transaction
 */
export async function awardCredits(
    userId: string,
    source: keyof typeof CREDIT_VALUES,
    description: string,
    customAmount?: number
): Promise<{ credits: number; transaction: any }> {
    const amount = customAmount || CREDIT_VALUES[source] || 0;
    if (amount <= 0) throw new Error('Invalid credit amount');

    // Update user credits
    const user = await User.findByIdAndUpdate(
        userId,
        { $inc: { credits: amount } },
        { new: true }
    );

    if (!user) throw new Error('User not found');

    // Log transaction
    const transaction = new CreditTransaction({
        userId,
        amount,
        type: 'earned',
        source,
        description,
    });
    await transaction.save();

    return { credits: user.credits, transaction };
}

/**
 * Spend credits from a user and log the transaction
 */
export async function spendCredits(
    userId: string,
    source: keyof typeof CREDIT_VALUES,
    description: string,
    customAmount?: number
): Promise<{ credits: number; transaction: any }> {
    const amount = customAmount || CREDIT_VALUES[source] || 0;
    if (amount <= 0) throw new Error('Invalid credit amount');

    // Check sufficient balance
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    if (user.credits < amount) throw new Error('Insufficient credits');

    // Deduct credits
    user.credits -= amount;
    await user.save();

    // Log transaction
    const transaction = new CreditTransaction({
        userId,
        amount: -amount,
        type: 'spent',
        source,
        description,
    });
    await transaction.save();

    return { credits: user.credits, transaction };
}

/**
 * Award reputation to a user
 */
export async function awardReputation(
    userId: string,
    source: keyof typeof REPUTATION_VALUES
): Promise<number> {
    const points = REPUTATION_VALUES[source] || 0;
    if (points <= 0) return 0;

    const user = await User.findByIdAndUpdate(
        userId,
        { $inc: { reputation: points } },
        { new: true }
    );

    return user?.reputation || 0;
}
