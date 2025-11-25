import mongoose, { Document, Schema } from 'mongoose';

export interface ICfgBadge extends Document {
    _id: mongoose.Types.ObjectId;
    name: string;
    type: 'og';
    description: string;
}

const cfgBadgeSchema: Schema<ICfgBadge> = new Schema({
    name: { type: String, required: true },
    type: { type: String, required: true, enum: ['og']},
    description: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.model<ICfgBadge>('CfgBadge', cfgBadgeSchema);
