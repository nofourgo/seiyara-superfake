import mongoose, { Document, Schema, Types } from 'mongoose';
import { ICfgTree } from './cfgTree';

export interface IUserTree extends Document {
    userId: string; // TelegramID
    tree: ICfgTree;
    treeName: string;
    isInCrop: boolean;
    unlocked: boolean;
    producedCrops: number;
}

const userTreeSchema: Schema = new Schema({
    userId: { type: String, required: true, ref: 'User' },
    tree: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'CfgTree' },
    treeName: { type: String, required: true },
    isInCrop: { type: Boolean, default: false },
    unlocked: { type: Boolean, default: true },
    producedCrops: { type: Number, default: 0 },
}, { timestamps: true });

userTreeSchema.index({ userId: 1, treeName: 1 }, { unique: true });

export default mongoose.model<IUserTree>('UserTree', userTreeSchema);
