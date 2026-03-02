import mongoose, { Schema } from 'mongoose';
import type { ICreditTransaction, IRating, IReport } from '../types';

const CreditTransactionSchema = new Schema<ICreditTransaction>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    type: {
      type: String,
      enum: ['earned', 'spent'],
      required: true,
    },
    source: {
      type: String,
      enum: [
        // Earning
        'session_complete',
        'submission',
        'positive_feedback',
        'help_user',
        'quickchat_helpful',
        'profile_complete',
        'daily_streak',
        'onboarding_bonus',
        // Spending
        'priority_matching',
        'profile_boost',
        'unlock_ideas',
        'certificate',
        'skill_badge',
        'remark_removal',
      ],
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const CreditTransaction = mongoose.model<ICreditTransaction>(
  'CreditTransaction',
  CreditTransactionSchema
);

// Rating Schema
const RatingSchema = new Schema<IRating>(
  {
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    raterId: {
      type: String,
      required: true,
    },
    ratedId: {
      type: String,
      required: true,
    },
    rating: {
      type: String,
      enum: ['helpful', 'very-helpful', 'exceptional'],
      required: true,
    },
    feedback: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

export const Rating = mongoose.model<IRating>('Rating', RatingSchema);

// Report Schema
const ReportSchema = new Schema<IReport>(
  {
    reporterId: {
      type: String,
      required: true,
    },
    reportedId: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'reviewed', 'resolved'],
      default: 'pending',
    },
  },
  {
    timestamps: true,
  }
);

export const Report = mongoose.model<IReport>('Report', ReportSchema);
