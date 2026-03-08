import mongoose, { Schema, Document } from 'mongoose';

export interface IFriendship extends Document {
    requesterId: string;
    recipientId: string;
    status: 'pending' | 'accepted' | 'declined';
    createdAt: Date;
    updatedAt: Date;
}

const FriendshipSchema = new Schema<IFriendship>(
    {
        requesterId: { type: String, required: true, index: true },
        recipientId: { type: String, required: true, index: true },
        status: {
            type: String,
            enum: ['pending', 'accepted', 'declined'],
            default: 'pending',
        },
    },
    { timestamps: true }
);

// Compound index for fast lookup
FriendshipSchema.index({ requesterId: 1, recipientId: 1 }, { unique: true });

export const Friendship = mongoose.model<IFriendship>('Friendship', FriendshipSchema);
