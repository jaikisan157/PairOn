import mongoose, { Schema } from 'mongoose';
import type { IQuickChat } from '../types';

const QuickChatMessageSchema = new Schema({
    id: { type: String, required: true },
    senderId: { type: String, required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    type: { type: String, enum: ['text', 'system'], default: 'text' },
});

const QuickChatRatingSchema = new Schema({
    userId: { type: String, required: true },
    rating: { type: String, enum: ['helpful', 'not-helpful'], required: true },
});

const QuickChatSchema = new Schema<IQuickChat>(
    {
        participants: {
            type: [String],
            required: true,
            validate: {
                validator: (v: string[]) => v.length === 2,
                message: 'Quick chat must have exactly 2 participants',
            },
        },
        mode: {
            type: String,
            enum: ['doubt', 'tech-talk'],
            required: true,
        },
        topic: {
            type: String,
            maxlength: 50,
            default: null,
        },
        messages: {
            type: [QuickChatMessageSchema],
            default: [],
        },
        status: {
            type: String,
            enum: ['active', 'ended'],
            default: 'active',
        },
        ratings: {
            type: [QuickChatRatingSchema],
            default: [],
        },
        endedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// Index for finding active chats efficiently
QuickChatSchema.index({ participants: 1, status: 1 });

export const QuickChat = mongoose.model<IQuickChat>('QuickChat', QuickChatSchema);
