import mongoose, { Document, Schema, Types } from 'mongoose';
import { IReward } from './cfgReward';

export interface ICfgPoolStats {
    stakedAmount: number;
    stakedUser: number;
    paidReward: number;
}

export interface ICfgPoolRewardHistory {
    round: Date;
    distributedReward: number;
    br: number;
    ur: number;
}

export interface ICfgPool extends Document {
    _id: Types.ObjectId;
    description: string;
    startTime: Date;
    endTime: Date;
    reward: IReward;
    stakedItem: 'seya' | 'dragon_ball';
    imageUrl: string;
    rp: number; // reward percentage for users

    stats: ICfgPoolStats;
    uStats: ICfgPoolStats;
    bStats: ICfgPoolStats;

    isClaimable: boolean;
    rewardHistories: ICfgPoolRewardHistory[];
}

const cfgPoolStatSchema: Schema = new Schema(
    {
        stakedAmount: { type: Number, default: 0 },
        stakedUser: { type: Number, default: 0 },
        paidReward: { type: Number, default: 0 },
    },
    { _id: false },
);

const cfgPoolRewardHistorySchema: Schema = new Schema(
    {
        round: { type: Date, required: true },
        distributedReward: { type: Number, default: 0 },
        br: { type: Number, default: 0 },
        ur: { type: Number, default: 0 },
    },
    { _id: false },
);

const cfgPoolSchema: Schema = new Schema(
    {
        description: { type: String, required: true }, // Name of the pool
        startTime: { type: Date, required: true },
        endTime: { type: Date, required: true },
        reward: { type: Object, required: true },
        stakedItem: { type: String, required: true, enum: ['seya', 'dragon_ball'] },
        imageUrl: { type: String },
        rp: { type: Number, required: true, default: 0.05 },

        stats: cfgPoolStatSchema,
        uStats: cfgPoolStatSchema,
        bStats: cfgPoolStatSchema,

        isClaimable: { type: Boolean, default: false },
        rewardHistories: [cfgPoolRewardHistorySchema],
    },
    { timestamps: true },
);

export default mongoose.model<ICfgPool>('CfgPool', cfgPoolSchema);
