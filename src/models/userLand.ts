import mongoose, { Document, Schema } from 'mongoose';
import { ICfgLand } from './cfgLand';
import { ICfgTree } from './cfgTree';

export interface IUserLand extends Document {
    userId: string;
    land: ICfgLand;
    slot: number;
    crop?: {
        tree: ICfgTree;
        startTime: Date;
        endTime: Date;
        claimed: boolean;
    };
    unlocked: boolean;
}

const cropSchema: Schema = new Schema(
    {
        tree: { type: mongoose.Schema.Types.ObjectId, ref: 'CfgTree' },
        startTime: { type: Date },
        endTime: { type: Date },
        claimed: { type: Boolean, default: false },
    },
    { _id: false },
);

const userLandSchema: Schema = new Schema(
    {
        userId: { type: String, required: true, ref: 'User' },
        land: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'CfgLand' },
        slot: { type: Number, required: true },
        crop: cropSchema,
        unlocked: { type: Boolean, required: true },
    },
    { timestamps: true },
);

userLandSchema.index({ userId: 1, slot: 1 }, { unique: true });

export default mongoose.model<IUserLand>('UserLand', userLandSchema);
