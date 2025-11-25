import mongoose, { Document, Schema } from 'mongoose';
import { IReward } from './cfgReward';

export interface ICfgAchievementTask {
    _id: mongoose.Types.ObjectId;
    description: string;
    type: 'level_hq' | 'login' | 'checkin_onchain' | 'invite' | 'spend_sei' | 'login_10d' | 'checkin_onchain_10d';
    conditionLevel: number;
}

export interface ICfgAchievement extends Document {
    _id: mongoose.Types.ObjectId;
    name: string;
    tasks: ICfgAchievementTask[];
    reward: IReward[];
}

const cfgAchievementTaskSchema: Schema = new Schema({
    type: { type: String, required: true, enum: ['level_hq', 'login', 'checkin_onchain', 'invite', 'spend_sei', 'login_10d', 'checkin_onchain_10d'] },
    description: { type: String, required: true },
    conditionLevel: { type: Number, required: true },
});

const cfgAchievementSchema: Schema = new Schema(
    {
        name: { type: String, required: true },
        tasks: { type: [cfgAchievementTaskSchema], required: true },
        reward: { type: [Object], required: true },
    },
    { timestamps: true },
);

export default mongoose.model<ICfgAchievement>('CfgAchievement', cfgAchievementSchema);
