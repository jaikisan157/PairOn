import mongoose, { Schema } from 'mongoose';
import type { IMatch, ICollaborationSession } from '../types';

const ProjectIdeaSchema = new Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, required: true },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
});

const MatchSchema = new Schema<IMatch>(
  {
    user1Id: {
      type: String,
      required: true,
    },
    user2Id: {
      type: String,
      required: true,
    },
    mode: {
      type: String,
      enum: ['sprint', 'challenge', 'build'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'active', 'completed', 'cancelled'],
      default: 'pending',
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endsAt: {
      type: Date,
      required: true,
    },
    projectIdea: {
      type: ProjectIdeaSchema,
      default: null,
    },
    matchScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
  },
  {
    timestamps: true,
  }
);

export const Match = mongoose.model<IMatch>('Match', MatchSchema);

// Collaboration Session Schema
const MessageSchema = new Schema({
  id: { type: String, required: true },
  senderId: { type: String, required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  type: { type: String, enum: ['text', 'system', 'ai'], default: 'text' },
});

const TaskSchema = new Schema({
  id: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  status: { type: String, enum: ['todo', 'in-progress', 'done'], default: 'todo' },
  assigneeId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const SubmissionSchema = new Schema({
  link: { type: String, required: true },
  description: { type: String, required: true },
  submittedAt: { type: Date, default: Date.now },
  submittedBy: { type: String, required: true },
});

const CollaborationSessionSchema = new Schema<ICollaborationSession>(
  {
    matchId: {
      type: String,
      required: true,
    },
    participants: {
      type: [String],
      required: true,
    },
    messages: {
      type: [MessageSchema],
      default: [],
    },
    tasks: {
      type: [TaskSchema],
      default: [],
    },
    submission: {
      type: SubmissionSchema,
      default: null,
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'abandoned'],
      default: 'active',
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    endsAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

export const CollaborationSession = mongoose.model<ICollaborationSession>(
  'CollaborationSession',
  CollaborationSessionSchema
);
