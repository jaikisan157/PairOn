import mongoose, { Schema, Document } from 'mongoose';

export interface IFeedback extends Document {
  title: string;
  description: string;
  category: 'feature' | 'bug' | 'general';
  author: mongoose.Types.ObjectId;
  likes: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const feedbackSchema = new Schema<IFeedback>({
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, enum: ['feature', 'bug', 'general'], default: 'general' },
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  likes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
}, { timestamps: true });

export const Feedback = mongoose.model<IFeedback>('Feedback', feedbackSchema);
