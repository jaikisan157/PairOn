import mongoose, { Schema, Document } from 'mongoose';

export interface IDMMessage {
    id: string;
    senderId: string;
    content: string;
    timestamp: Date;
    read: boolean;
}

export interface IDirectMessage extends Document {
    participants: [string, string]; // exactly 2 user IDs
    messages: IDMMessage[];
    lastMessageAt: Date;
    lastMessage?: string;
}

const DMMessageSchema = new Schema<IDMMessage>({
    id: { type: String, required: true },
    senderId: { type: String, required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    read: { type: Boolean, default: false },
}, { _id: false });

const DirectMessageSchema = new Schema<IDirectMessage>({
    participants: {
        type: [String],
        required: true,
        validate: { validator: (v: string[]) => v.length === 2, message: 'DM must have exactly 2 participants' },
    },
    messages: { type: [DMMessageSchema], default: [] },
    lastMessageAt: { type: Date, default: Date.now },
    lastMessage: { type: String },
}, { timestamps: true });

// Index for quick lookup by participant pair
DirectMessageSchema.index({ participants: 1 });

export const DirectMessage = mongoose.model<IDirectMessage>('DirectMessage', DirectMessageSchema);
