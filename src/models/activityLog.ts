import mongoose, { Document, Schema } from 'mongoose';
import { ICfgShopItem } from './cfgShopItem';
import { ICfgSubscription } from './cfgSubscription';
import { ICfgQuest } from './cfgQuest';
import { ICfgAchievement } from './cfgAchievement';
import { ICfgLand } from './cfgLand';
import { ICfgTree } from './cfgTree';

export interface IActivityLog extends Document {
    gameId: number; // Refers to the user performing the action
    telegramId: string; // Refers to the user performing the action
    action: string;

    status?: string;

    sei?: number;
    diamond?: number;
    seya?: number;
    quantity?: number;
    onchainSei?: number;

    landSlot?: number;
    cfgLand?: ICfgLand;

    treeName?: string;
    cfgTree?: ICfgTree;

    shopItemName?: string;
    cfgShopItem?: ICfgShopItem;

    subName?: string;
    cfgSubscription?: ICfgSubscription;

    questName?: string;
    cfgQuest?: ICfgQuest;

    achivementName?: string;
    cfgAchievement?: ICfgAchievement;

    hqLevel?: number;

    itemType?: string;
    itemLevel?: number;

    details?: string; // Optional details about the action
    detailsObj?: object;

    country?: string; // Country of the user (if available)
    city?: string; // City of the user (if available)
}

const activityLogSchema: Schema = new Schema(
    {
        telegramId: { type: String, required: true, ref: 'User' },
        action: { type: String, required: true },

        status: { type: String, default: 'ok' },

        sei: { type: Number },
        diamond: { type: Number },
        seya: { type: Number },
        quantity: { type: Number },
        onchainSei: { type: Number },

        landSlot: { type: Number },
        cfgLand: { type: mongoose.Schema.Types.ObjectId, ref: 'CfgLand' },

        treeName: { type: String },
        cfgTree: { type: mongoose.Schema.Types.ObjectId, ref: 'CfgTree' },

        shopItemName: { type: String },
        cfgShopItem: { type: mongoose.Schema.Types.ObjectId, ref: 'CfgShopItem' },

        subName: { type: String },
        cfgSubscription: { type: mongoose.Schema.Types.ObjectId, ref: 'CfgSubscription' },

        questName: { type: String },
        cfgQuest: { type: mongoose.Schema.Types.ObjectId, ref: 'CfgQuest' },

        achivementName: { type: String },
        cfgAchievement: { type: mongoose.Schema.Types.ObjectId, ref: 'CfgAchievement' },

        hqLevel: { type: Number },

        itemType: { type: String },
        itemLevel: { type: Number },

        details: { type: String }, // Optional details about the action
        detailsObj: { type: Object, default: {} },

        country: { type: String }, // Country of the user (if available)
        city: { type: String }, // City of the user (if available)
    },
    { timestamps: true },
);

// Indexes for faster lookups by telegramId and action
activityLogSchema.index({ telegramId: 1 });
activityLogSchema.index({ action: 1 });

export default mongoose.model<IActivityLog>('ActivityLog', activityLogSchema);
