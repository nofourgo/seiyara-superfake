import mongoose, { Document, Schema } from 'mongoose';

export interface IBotBehavior extends Document {
    telegramId: string;
    privateKey?: string;
    walletAddress: string;
    balance: string;
    lastRefreshed: Date;
    behaviors: {
        dailyCheckin: boolean;
        buyLand: {
            enabled: boolean;
            maxLand: number;
        };
        earnGold: {
            enabled: boolean;
            target: number;
            speed: number;
        };
        buySubscription: {
            enabled: boolean;
            noAds7d: boolean;
            basic7d: boolean;
        };
        upgradeHQ: {
            enabled: boolean;
            maxLevel: number;
        };
    };
    withdrewSei: number;
}

const botBehaviorSchema: Schema = new Schema(
    {
        telegramId: { type: String, required: true, unique: true },
        privateKey: { type: String, default: '' },
        walletAddress: { type: String, default: '' },
        balance: { type: String, default: '' },
        lastRefreshed: { type: Date, default: null },
        behaviors: {
            dailyCheckin: { type: Boolean, default: false },
            buyLand: {
                enabled: { type: Boolean, default: false },
                maxLand: { type: Number, default: 0 },
            },
            earnGold: {
                enabled: { type: Boolean, default: false },
                target: { type: Number, default: 0 },
                speed: { type: Number, default: 0, min: 0, max: 10 },
            },
            buySubscription: {
                enabled: { type: Boolean, default: false },
                noAds7d: { type: Boolean, default: false },
                basic7d: { type: Boolean, default: false },
            },
            upgradeHQ: {
                enabled: { type: Boolean, default: false },
                maxLevel: { type: Number, default: 0 },
            },
        },
        withdrewSei: { type: Number, default: 0 },
    },
    { timestamps: true },
);

export default mongoose.model<IBotBehavior>('BotBehavior', botBehaviorSchema);
