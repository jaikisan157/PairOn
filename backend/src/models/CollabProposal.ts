import mongoose, { Schema } from 'mongoose';
import type { ICollabProposal } from '../types';

const ProjectIdeaSchema = new Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
});

const CollabProposalSchema = new Schema<ICollabProposal>(
    {
        proposerId: {
            type: String,
            required: true,
            index: true,
        },
        recipientId: {
            type: String,
            required: true,
            index: true,
        },
        mode: {
            type: String,
            enum: ['sprint', 'challenge', 'build'],
            required: true,
        },
        projectIdea: {
            type: ProjectIdeaSchema,
            required: true,
        },
        ideaSource: {
            type: String,
            enum: ['user', 'ai'],
            required: true,
        },
        message: {
            type: String,
            maxlength: 200,
        },
        status: {
            type: String,
            enum: ['pending', 'accepted', 'declined', 'expired'],
            default: 'pending',
        },
        quickChatId: {
            type: String,
            default: null,
        },
        expiresAt: {
            type: Date,
            required: true,
            default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
    },
    {
        timestamps: true,
    }
);

// Auto-expire proposals
CollabProposalSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const CollabProposal = mongoose.model<ICollabProposal>(
    'CollabProposal',
    CollabProposalSchema
);
