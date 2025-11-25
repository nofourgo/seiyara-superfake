import mongoose, { Document, Schema } from 'mongoose';

export interface ICfgLand extends Document {
    _id: mongoose.Types.ObjectId;
    slot: number;
    minUserLevel: number;
    seiPrice: number;
}

const cfgLandSchema: Schema = new Schema({
    slot: { type: Number, required: true, unique: true, index: true },
    minUserLevel: { type: Number },
    seiPrice: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model<ICfgLand>('CfgLand', cfgLandSchema);
