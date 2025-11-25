import mongoose, { Document, Schema, Types } from 'mongoose';
import { ICfgTask, ICfgQuest } from './cfgQuest';
import { IReward } from './cfgReward';

export interface IUserQuest extends Document {
    _id: Types.ObjectId;
    userId: string; // telegramId
    questId: ICfgQuest;
    date: Date;
    type: 'one_time' | 'daily';
    description: string;
    reward: IReward[];
    tasks: Array<Omit<ICfgTask, '_id'> & { completed: boolean; checking: boolean; _id: Types.ObjectId }>;
    imageUrl: string;

    completed: boolean;
    rewardClaimed: boolean;
    rewardClaiming: boolean;
}

const taskSchema: Schema = new Schema({
    description: { type: String, required: true },
    type: { type: String, required: true },
    action: { type: String },
    imageUrl: { type: String, default: '' },
    completed: { type: Boolean, default: false },
    checking: { type: Boolean, default: false },
});

const userQuestSchema: Schema = new Schema(
    {
        userId: { type: String, required: true, ref: 'User', index: true },
        questId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'CfgQuest' },
        date: { type: Date, required: true },
        type: { type: String, required: true, enum: ['one_time', 'daily'] },
        description: { type: String, required: true },
        reward: { type: [Object], required: true },
        tasks: [taskSchema],
        imageUrl: { type: String, default: '' },

        completed: { type: Boolean, default: false },
        rewardClaimed: { type: Boolean, default: false },
        rewardClaiming: { type: Boolean, default: false },
    },
    { timestamps: true },
);

export default mongoose.model<IUserQuest>('UserQuest', userQuestSchema);
