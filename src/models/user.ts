import mongoose, { Document, Schema } from 'mongoose';

export interface IHeadQuarterConfig {
    nextUpgradeTimeSecond: number;
    nextUpgradeFeeDiamond: number;
}

export interface IHeadQuarter {
    level: number;

    isUpgrading: boolean;
    upgradeStartTime: Date | null;
    upgradeEndTime: Date | null;

    nextUpgradeTimeSecond: number;
    nextUpgradeFeeDiamond: number;
}

export interface IUserStats {
    totalCrop: number;
    totalRegrowTime: number;
    sellPriceEachCrop: number;
}

export interface IUserReferralBonus {
    totalDiamond: number;
    claimedDiamond: number;

    totalSei: number;
    claimedSei: number;
}

export interface IReferralConfig {
    configRefMaxInvites: number;
    configRefThreshold: number;
    configRefReduction: number;
    currentReferralCount: number;
}

export interface IUser extends Document {
    telegramId: string;
    gameId: number;
    username: string;
    firstName: string;
    lastName: string;
    photoUrl?: string;
    createdAt: Date;
    lastActiveAt: Date | null;
    lastOnchainCheckinAt: Date | null;
    isNewUser: boolean;

    referralCount: number;
    referredByCode?: string;
    referredByRemark?: string;
    inviteCode: string;
    referralBonus: IUserReferralBonus;
    referralConfig: IReferralConfig;
    spinnedTicket: number;
    spinnedCount: number;

    gold: number;
    diamond: number;
    seya: number;
    sei: number;
    seiConverting: boolean;

    spentSei: number;

    headquarter: IHeadQuarter;
    stats: IUserStats;

    level: number;
    totalEarnedGold: number;
    exp: number;
    expForNextLevel: number;

    loginCount: number;
    checkinOnchainCount: number;

    // New Wallet Fields
    evmAddress: string;
    seiAddress: string;
    publicKey: string;
    privateKey: string;
    mnemonic: string;

    ip_location: Array<{
        ip_address: string;
        country: string;
        city: string;
        latitude: number;
        longitude: number;
        lastActiveAt: Date;
    }>;

    userCheck: boolean;
}

const ipLocationSchema = new Schema(
    {
        ip_address: { type: String },
        country: { type: String },
        city: { type: String },
        latitude: { type: Number },
        longitude: { type: Number },
        lastActiveAt: { type: Date },
    },
    { _id: false },
);

const userStatsSchema: Schema = new Schema<IUserStats>(
    {
        totalCrop: { type: Number, default: 0 },
        totalRegrowTime: { type: Number, default: 0 },
        sellPriceEachCrop: { type: Number, default: 0 },
    },
    { _id: false },
);

const userReferralBonusSchema: Schema = new Schema<IUserReferralBonus>(
    {
        totalDiamond: { type: Number, default: 0 },
        totalSei: { type: Number, default: 0 },
        claimedDiamond: { type: Number, default: 0 },
        claimedSei: { type: Number, default: 0 },
    },
    { _id: false },
);

const headquarterSchema: Schema = new Schema<IHeadQuarter>(
    {
        level: { type: Number, required: true, default: 1 },
        nextUpgradeTimeSecond: { type: Number, required: true },
        nextUpgradeFeeDiamond: { type: Number, required: true },
        isUpgrading: { type: Boolean },
        upgradeStartTime: { type: Date },
        upgradeEndTime: { type: Date },
    },
    { _id: false },
);

const referralConfigSchema: Schema = new Schema({
    configRefMaxInvites: { type: Number, default: 0 },
    configRefThreshold: { type: Number, default: 0 },
    configRefReduction: { type: Number, default: 0 },
    currentReferralCount: { type: Number, default: 0 },
});

const userSchema: Schema = new Schema<IUser>(
    {
        telegramId: { type: String, required: true, unique: true },
        gameId: { type: Number, unique: true, sparse: true },
        username: { type: String },
        firstName: { type: String },
        lastName: { type: String },
        photoUrl: { type: String },
        lastActiveAt: { type: Date, default: null },
        lastOnchainCheckinAt: { type: Date, default: null },
        isNewUser: { type: Boolean },

        referralCount: { type: Number, default: 0 },
        referredByCode: { type: String, default: null, index: true },
        referredByRemark: { type: String, default: null, index: true },
        inviteCode: { type: String, required: true, unique: true },
        referralBonus: { type: userReferralBonusSchema, required: true, default: { totalDiamond: 0, totalSei: 0, claimedDiamond: 0, claimedSei: 0 } },
        spinnedTicket: { type: Number, default: 0 },
        spinnedCount: { type: Number, default: 0 },

        gold: { type: Number, default: 0, min: [0, 'Not enough gold'] },
        diamond: { type: Number, default: 0, min: [0, 'Not enough diamond'] },
        seya: { type: Number, default: 0, min: [0, 'Not enough seya'] },
        sei: { type: Number, default: 0, min: [0, 'Not enough sei'] },
        seiConverting: { type: Boolean, default: false },

        spentSei: { type: Number, default: 0 },

        headquarter: { type: headquarterSchema },
        stats: { type: userStatsSchema },

        level: { type: Number, default: 1 },
        totalEarnedGold: { type: Number, default: 0 },
        exp: { type: Number, default: 0 },
        expForNextLevel: { type: Number, default: 0 },

        loginCount: { type: Number, default: 0 },
        checkinOnchainCount: { type: Number, default: 0 },

        // New Wallet Fields
        evmAddress: { type: String, required: true },
        seiAddress: { type: String, required: true },
        publicKey: { type: String, required: true },
        privateKey: { type: String, required: true },
        mnemonic: { type: String, required: true },

        ip_location: [ipLocationSchema],
        referralConfig: { type: referralConfigSchema },
        userCheck: { type: Boolean, default: false },
    },
    { timestamps: true },
);

// Pre-save hook to ensure unique gameId
userSchema.pre('save', async function (next) {
    const user = this as unknown as IUser;

    if (!user.gameId) {
        let genGameID: number = Math.floor(Math.random() * 900000000) + 100000000;
        while (await mongoose.model('User').findOne({ gameId: genGameID }).exec()) {
            genGameID = Math.floor(Math.random() * 900000000) + 100000000;
        }
        user.gameId = genGameID;
    }
    next();
});

export default mongoose.model<IUser>('User', userSchema);
