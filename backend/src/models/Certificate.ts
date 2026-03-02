import mongoose, { Schema, Document } from 'mongoose';

export interface ICertificate extends Document {
    userId: string;
    sessionId: string;
    projectTitle: string;
    projectDescription: string;
    partnerName: string;
    partnerId: string;
    skills: string[];
    duration: number; // minutes
    completedAt: Date;
    certificateId: string; // unique verifiable ID
    creditsSpent: number;
    createdAt: Date;
}

const CertificateSchema = new Schema<ICertificate>(
    {
        userId: { type: String, required: true, index: true },
        sessionId: { type: String, required: true },
        projectTitle: { type: String, required: true },
        projectDescription: { type: String, required: true },
        partnerName: { type: String, required: true },
        partnerId: { type: String, required: true },
        skills: { type: [String], default: [] },
        duration: { type: Number, required: true },
        completedAt: { type: Date, required: true },
        certificateId: {
            type: String,
            required: true,
            unique: true,
            default: () => `PAIRON-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
        },
        creditsSpent: { type: Number, default: 50 },
    },
    { timestamps: true }
);

export const Certificate = mongoose.model<ICertificate>('Certificate', CertificateSchema);
