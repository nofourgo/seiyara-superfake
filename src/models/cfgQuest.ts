import mongoose, { Document, Schema } from 'mongoose';
import { IReward } from './cfgReward';

export interface ICfgTask {
    _id: mongoose.Types.ObjectId;
    description: string;
    type:
        | 'gift_welcome'
        | 'join_telegram_channel'
        | 'join_telegram_group'
        | 'follow_twitter'
        | 'like_and_repost_tweet'
        | 'connect_twitter'
        | 'connect_wallet'
        | 'check_balance'
        | 'confirm_onchain';
    action: string;
    imageUrl: string;
}

export interface ICfgQuest extends Document {
    _id: mongoose.Types.ObjectId;
    name: string;
    type: 'one_time' | 'daily';
    tasks: ICfgTask[];
    reward: IReward[];
    startDate: Date;
    endDate: Date;
    imageUrl: string;
}

const cfgTaskSchema: Schema = new Schema({
    description: { type: String, required: true },
    type: {
        type: String,
        required: true,
        enum: [
            'gift_welcome',
            'join_telegram_channel',
            'join_telegram_group',
            'follow_twitter',
            'like_and_repost_tweet',
            'connect_twitter',
            'connect_wallet',
            'check_balance',
            'confirm_onchain',
        ],
    },
    action: { type: String },
    imageUrl: { type: String, default: '' },
});

const cfgQuestSchema: Schema = new Schema(
    {
        name: { type: String, required: true },
        type: { type: String, required: true, enum: ['one_time', 'daily'] },
        tasks: { type: [cfgTaskSchema], required: true },
        reward: { type: [Object], required: true },
        startDate: { type: Date },
        endDate: { type: Date },
        imageUrl: { type: String, default: '' },
    },
    { timestamps: true },
);

export default mongoose.model<ICfgQuest>('CfgQuest', cfgQuestSchema);
