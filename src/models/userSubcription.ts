import mongoose, { Document, Schema } from 'mongoose';
import { ICfgSubscription } from './cfgSubscription';

export interface IUserSubscription extends Document {
    userId: string;
    subscription: ICfgSubscription;
    type: string;
    name: string;
    day: number;
    startTime: Date;
    endTime: Date;
    purchasedAt: Date;
}

const userSubscription: Schema = new Schema({
    userId: { type: String, required: true, ref: 'User', index: true },
    subscription: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'CfgSubscription' },
    type: { type: String, required: true },
    name: { type: String, required: true },
    day: { type: Number, required: true },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    purchasedAt: { type: Date, required: true },
}, { timestamps: true });

export default mongoose.model<IUserSubscription>('UserSubscription', userSubscription);
