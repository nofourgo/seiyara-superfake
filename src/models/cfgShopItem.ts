import mongoose, { Schema, Document } from 'mongoose';
import { IReward } from './cfgReward';

export interface ICfgShopItem extends Document {
    _id: mongoose.Types.ObjectId;
    type: 'diamond' | 'dragon_chest' | 'spin_ticket';
    quantity: number;
    promotionRate: number;
    seiPrice: number;
    description: string;
    firstPurchaseReward: IReward[];
    active: boolean;
}

const cfgShopItemSchema: Schema = new Schema<ICfgShopItem>(
    {
        type: { type: String, enum: ['diamond', 'dragon_chest', 'spin_ticket'], required: true },
        quantity: {
            type: Number,
            required: true,
            validate: {
                validator: (value: number) => value > 0,
                message: 'quantity must be greater than 0',
            },
        },
        promotionRate: { type: Number, default: 0 },
        seiPrice: {
            type: Number,
            required: true,
            validate: {
                validator: (value: number) => value > 0,
                message: 'seiPrice must be greater than 0',
            },
        },
        firstPurchaseReward: { type: [Object] },
        description: { type: String },
        active: { type: Boolean, default: true },
    },
    { timestamps: true },
);

// Export the model
export default mongoose.model<ICfgShopItem>('CfgShopItem', cfgShopItemSchema);
