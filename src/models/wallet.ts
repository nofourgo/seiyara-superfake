import mongoose, { Document, Schema } from 'mongoose';

export interface IWallet extends Document {
    telegramId: string;
    gold: number;
    gem: number;
    tonWalletAddress?: string;
    evmWalletAddress?: string;
    seiWalletAddress?: string;
}

const walletSchema: Schema = new Schema({
    telegramId: { type: String, required: true, unique: true },
    gold: { type: Number, default: 0 },
    gem: { type: Number, default: 0 },
    tonWalletAddress: { type: String, match: [/^.+$/, 'Invalid TON wallet address'] },
    evmWalletAddress: { type: String, match: [/^.+$/, 'Invalid EVM wallet address'] },
    seiWalletAddress: { type: String, match: [/^.+$/, 'Invalid SEI wallet address'] },
});

export default mongoose.model<IWallet>('Wallet', walletSchema);
