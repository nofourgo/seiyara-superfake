import mongoose, { Document, Schema } from 'mongoose';

export interface IBotActionLog extends Document {
    telegramId: string;
    action: string;
    timestamp: Date;
    details?: {
        invoiceId?: string;
        amount?: string;
        recipientAddress?: string;
        status?: 'success' | 'failed';
        error?: string;
        [key: string]: any; // Additional metadata
    };
}

const botActionLogSchema: Schema = new Schema({
    telegramId: { type: String, required: true },
    action: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    details: {
        invoiceId: { type: String },
        amount: { type: String },
        recipientAddress: { type: String },
        status: { type: String, enum: ['success', 'failed'] },
        error: { type: String },
        land: { type: Number },
        tree: { type: Number },
    },
});

export default mongoose.model<IBotActionLog>('BotActionLog', botActionLogSchema);