import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IIdleFarming extends Document {
    _id: Types.ObjectId;
    userId: string;
    startTime: Date;
    endTime: Date;
    maxTimeMinute: number;
    gold: number;
    chest: number;
    claimed: boolean;
}

const idleFarmingSchema: Schema = new Schema(
    {
        userId: { type: String, required: true, ref: 'User', unique: true },
        startTime: { type: Date, required: true },
        endTime: { type: Date, required: true },
        maxTimeMinute: { type: Number, required: true },
        gold: { type: Number, required: true },
        chest: { type: Number, required: true },
        claimed: { type: Boolean, default: false },
    },
    { timestamps: true },
);

export default mongoose.model<IIdleFarming>('IdleFarming', idleFarmingSchema);
