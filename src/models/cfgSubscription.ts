import mongoose, { Schema, Document } from 'mongoose';
import { IReward } from './cfgReward';

// Define an interface for the ShopItem (renamed to ICfgShopItem)
export interface ICfgSubscription extends Document {
    _id: mongoose.Types.ObjectId;
    type: 'basic_daily_reward' | 'advanced_daily_reward' | 'no_ads';
    name: string;
    seiPrice: number;
    dailyReward: IReward[];
    firstPurchaseReward: IReward[];
    subsTimeDay: number;
    active: boolean;
}

// Define the Mongoose schema (renamed to CfgShopItemSchema)
const cfgSubscriptionSchema: Schema = new Schema({
    type: { type: String, enum: ['basic_daily_reward', 'advanced_daily_reward', 'no_ads'], required: true },
    name: { type: String, required: true },
    seiPrice: {
        type: Number,
        required: true,
        validate: {
            validator: (value: number) => value > 0,
            message: 'seiPrice must be greater than 0',
        },
    },
    dailyReward: { type: [Object], required: true },
    firstPurchaseReward: { type: [Object] },
    active: { type: Boolean, default: true },
    subsTimeDay: { type: Number, required: true },
}, { timestamps: true });

// Export the model
export default mongoose.model<ICfgSubscription>('CfgSubscription', cfgSubscriptionSchema);
