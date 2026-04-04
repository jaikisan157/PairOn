import mongoose, { Schema, Document } from 'mongoose';

export interface IProject extends Document {
  userId: string;
  sessionId: string;
  partnerName: string;
  partnerId: string;
  partnerReputation: number;
  mode: string;
  projectIdea?: { title?: string; description?: string };
  status: string;
  startedAt: string;
  endsAt: string;
  tasksTotal: number;
  tasksDone: number;
  submissionLink?: string;
  submissionDesc?: string;
  files?: Record<string, string>;
  savedAt: Date;
}

const ProjectSchema = new Schema<IProject>(
  {
    userId: { type: String, required: true, index: true },
    sessionId: { type: String, required: true },
    partnerName: { type: String, default: 'Partner' },
    partnerId: { type: String, default: '' },
    partnerReputation: { type: Number, default: 0 },
    mode: { type: String, default: 'sprint' },
    projectIdea: {
      title: { type: String },
      description: { type: String },
    },
    status: { type: String, default: 'completed' },
    startedAt: { type: String },
    endsAt: { type: String },
    tasksTotal: { type: Number, default: 0 },
    tasksDone: { type: Number, default: 0 },
    submissionLink: { type: String, default: '' },
    submissionDesc: { type: String, default: '' },
    // files map: path → content. We store as Mixed to handle arbitrary keys.
    files: { type: Schema.Types.Mixed, default: {} },
    savedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Compound index so a user can't save the same session twice
ProjectSchema.index({ userId: 1, sessionId: 1 }, { unique: true });

export const Project = mongoose.model<IProject>('Project', ProjectSchema);
