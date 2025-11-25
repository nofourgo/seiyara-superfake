import mongoose, { Document, Schema } from 'mongoose';
import { ICfgAchievementTask } from './cfgAchievement';
import { IReward } from './cfgReward';

export interface IUserAchievement extends Document {
    _id: mongoose.Types.ObjectId;
    userId: string; // telegramId
    achievementId: mongoose.Types.ObjectId;
    description: string;
    tasks: Array<Omit<ICfgAchievementTask, '_id'> & { progressLevel: number; completed: boolean; checking: boolean; _id: mongoose.Types.ObjectId }>;
    reward: IReward[];

    completed: boolean;
    rewardClaimed: boolean;
    rewardClaiming: boolean;
}

const taskSchema: Schema = new Schema({
    description: { type: String, required: true },
    type: { type: String, required: true, enum: ['level_hq', 'login', 'checkin_onchain', 'invite', 'spend_sei', 'login_10d', 'checkin_onchain_10d'] },
    conditionLevel: { type: Number, required: true },
    progressLevel: { type: Number, required: true, default: 0 },
    completed: { type: Boolean, default: false },
    checking: { type: Boolean, default: false },
});

const userAchievementSchema: Schema = new Schema({
    userId: { type: String, required: true, ref: 'User' }, // telegramId
    achievementId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'CfgAchievement' },
    description: { type: String, required: true },
    tasks: [taskSchema],
    reward: { type: [Object], required: true },
    completed: { type: Boolean, default: false },
    rewardClaimed: { type: Boolean, default: false },
    rewardClaiming: { type: Boolean, default: false },
    createdAt: { type: Date, default: new Date() },
});

userAchievementSchema.index({ userId: 1, achievementId: 1 }, { unique: true });

export default mongoose.model<IUserAchievement>('UserAchievement', userAchievementSchema);
