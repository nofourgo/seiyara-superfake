import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IUserPoolAction {
    action: 'stake' | 'unstake';
    amount: number;
    createdAt: Date;
}

export interface IUserPoolReward {
    rewardedAmount: number;
    stakedAmount: number;
    rewardTime: Date;
    createdAt: Date;
}

export interface IUserPool extends Document {
    _id: Types.ObjectId;
    userId: string;
    poolId: Types.ObjectId;
    stakedItem: 'seya' | 'dragon_ball';
    rewardType: 'sei' | 'seya' | 'onchain_sei';

    stakedAmount: number;
    actions: IUserPoolAction[];

    rewardedAmount: number;
    rewards: IUserPoolReward[];
    claimed: boolean;
}

const userPoolActionSchema: Schema = new Schema(
    {
        action: { type: String, enum: ['stake', 'unstake'], required: true },
        amount: { type: Number, required: true },
        createdAt: { type: Date, required: true },
    },
    { _id: false },
);

const userPoolRewardSchema: Schema = new Schema(
    {
        rewardedAmount: { type: Number, required: true },
        stakedAmount: { type: Number, required: true },
        rewardTime: { type: Date, required: true },
        createdAt: { type: Date, required: true },
    },
    { _id: false },
);

const userPoolSchema: Schema = new Schema(
    {
        userId: { type: String, required: true, index: true },
        poolId: { type: mongoose.Types.ObjectId, required: true, index: true },
        stakedItem: { type: String, required: true, enum: ['seya', 'dragon_ball'] },
        rewardType: { type: String, required: true, enum: ['sei', 'seya', 'onchain_sei'] },

        stakedAmount: { type: Number, required: true },
        actions: [userPoolActionSchema],

        rewardedAmount: { type: Number, default: 0 },
        rewards: [userPoolRewardSchema],
        claimed: { type: Boolean, default: false },
    },
    { timestamps: true },
);

export default mongoose.model<IUserPool>('UserPool', userPoolSchema);
