import mongoose, { Document, Schema } from 'mongoose';
import { ICfgBadge } from './cfgBadge';

export interface IUserBadge extends Document {
    _id: mongoose.Types.ObjectId;
    userId: string; // telegramId
    badge: ICfgBadge;
    badgeType: string;
    completed: boolean;
    claimed: boolean;
}

const userBadgeSchema: Schema<IUserBadge> = new Schema(
    {
        userId: { type: String, required: true, ref: 'User' },
        badge: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'CfgBadge' },
        badgeType: { type: String, required: true },
        completed: { type: Boolean, default: false },
        claimed: { type: Boolean, default: false },
    },
    { timestamps: true },
);

userBadgeSchema.index({ userId: 1, badgeId: 1 }, { unique: true });

export default mongoose.model<IUserBadge>('UserBadge', userBadgeSchema);
