import mongoose, { Document, Schema } from 'mongoose';
import { ICfgItem } from './cfgItem';

export interface IUserInventory extends Document {
    _id: mongoose.Types.ObjectId;
    userId: string;
    itemType: string;
    itemLevel: number;
    item: ICfgItem;
    quantity: number;
    acquiredAt: Date;
}

const userInventorySchema: Schema = new Schema({
    userId: { type: String, required: true, ref: 'User' },
    itemType: { type: String, required: true, enum: ['lucky_chest', 'dragon_chest', 'dragon_ball'] },
    itemLevel: { type: Number, required: true, default: 1 },
    item: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'CfgItem' },
    quantity: { type: Number, required: true },
    acquiredAt: { type: Date, required: true },
}, { timestamps: true });

userInventorySchema.index({ userId: 1, itemType: 1, itemLevel: 1 }, { unique: true });

export default mongoose.model<IUserInventory>('UserInventory', userInventorySchema);
