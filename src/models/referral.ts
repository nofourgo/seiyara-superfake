import mongoose, { Document, Schema } from 'mongoose';

export interface IReferral extends Document {
    telegramId: string;
    inviteCode: string;

    bonusDiamond: number;
    bonusSei: number;
}

const referralSchema: Schema = new Schema({
    telegramId: { type: String, required: true, unique: true },
    inviteCode: { type: String, required: true, index: true },
    bonusDiamond: { type: Number, default: 0 },
    bonusSei: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model<IReferral>('Referral', referralSchema);
