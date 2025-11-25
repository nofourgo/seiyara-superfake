import mongoose, { Document, Schema, Types } from 'mongoose';
import { IReward } from './cfgReward';

export interface ICfgTree extends Document {
    _id: Types.ObjectId;
    name: string;
    description: string;
    minUserLevel: number;
    seiPrice: number;
    reward: IReward[];
    harvestTimeInSec: number;
    landSlots: number[];
    chestChance: number;
}

const cfgTreeSchema: Schema = new Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    minUserLevel: { type: Number, required: true },
    seiPrice: { type: Number, default: 0 },
    reward: { type: [Object], required: true },
    harvestTimeInSec: { type: Number, required: true }, // in seconds
    landSlots: { type: [Number] },
    chestChance: { type: Number },
}, { timestamps: true });

export default mongoose.model<ICfgTree>('CfgTree', cfgTreeSchema);
