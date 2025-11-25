import User, { IUser } from '../models/user';
import { incrUserWeeklyByType } from './redis';

interface IBalance {
    gold?: number;
    diamond?: number;
    sei?: number;
    seya?: number;
}

// Concurrency
const addUserBalance = async (userId: string, amount: IBalance): Promise<IBalance> => {
    const updatedUser: IUser | null = await User.findOneAndUpdate(
        { telegramId: userId },
        {
            $inc: {
                gold: amount.gold || 0,
                totalEarnedGold: amount.gold || 0,
                diamond: amount.diamond || 0,
                sei: amount.sei || 0,
                seya: amount.seya || 0,
            },
        },
        { returnOriginal: false },
    );

    if (!updatedUser) {
        throw new Error('Error when updating user balance: user not found');
    }

    if (amount.gold) {
        await incrUserWeeklyByType('gold', updatedUser.gameId, amount.gold);
        await checkAndUpdateUserLevel(updatedUser);
    }

    return {
        gold: updatedUser.gold,
        diamond: updatedUser.diamond,
        sei: updatedUser.sei,
        seya: updatedUser.seya,
    };
};

const addUserBalanceByClaimRefBonus = async (userId: string, amount: IBalance): Promise<IBalance> => {
    const updatedUser: IUser | null = await User.findOneAndUpdate(
        { telegramId: userId },
        {
            $inc: {
                diamond: amount.diamond || 0,
                'referralBonus.claimedDiamond': amount.diamond || 0,
                sei: amount.sei || 0,
                'referralBonus.claimedSei': amount.sei || 0,
            },
        },
        { returnOriginal: false },
    );

    if (!updatedUser) {
        throw new Error('Error when updating user balance: user not found');
    }

    return {
        gold: updatedUser.gold,
        diamond: updatedUser.diamond,
        sei: updatedUser.sei,
        seya: updatedUser.seya,
    };
};

const deductUserBalance = async (userId: string, amount: IBalance): Promise<IBalance> => {
    let updates = {
        gold: 0,
        diamond: 0,
        sei: 0,
        seya: 0,
    };
    if (amount.gold) {
        updates.gold = -amount.gold;
    }
    if (amount.diamond) {
        updates.diamond = -amount.diamond;
    }
    if (amount.sei) {
        updates.sei = -amount.sei;
    }
    if (amount.seya) {
        updates.seya = -amount.seya;
    }

    const updatedUser: IUser | null = await User.findOneAndUpdate(
        {
            telegramId: userId,
            gold: { $gte: amount.gold || 0 },
            diamond: { $gte: amount.diamond || 0 },
            sei: { $gte: amount.sei || 0 },
            seya: { $gte: amount.seya || 0 },
        },
        { $inc: updates },
        { returnOriginal: false },
    );

    if (!updatedUser) {
        throw new Error('Error when deducting user balance: not enough balance or user not found');
    }

    return {
        gold: updatedUser.gold,
        diamond: updatedUser.diamond,
        sei: updatedUser.sei,
        seya: updatedUser.seya,
    };
};

const checkAndUpdateUserLevel = async (user: IUser) => {
    // Update exp and check new level
    user.exp = Math.ceil(user.totalEarnedGold / 100);
    if (!user.expForNextLevel || user.exp >= user.expForNextLevel) {
        const result = calcGoldForLevel(user.totalEarnedGold);
        if (result) {
            user.level = result.newLevel;
            user.expForNextLevel = result.newExpForNextLevel;
        }
    }
    user.save();
};

const calcGoldForLevel = (gold: number): { newLevel: number; newExpForNextLevel: number } | null => {
    let expRequired = 15; // level 2
    let lastExp = 15;
    let factor = 1.1;

    for (let lvl = 2; lvl <= 100; lvl++) {
        if (Math.ceil(gold / 100) < expRequired) {
            return { newLevel: lvl - 1, newExpForNextLevel: Math.round(expRequired) };
        }

        const expToLevelUp = lastExp * factor;
        expRequired = expRequired + expToLevelUp;
        factor += 0.013;
        lastExp = expToLevelUp;
    }

    // reach max level
    return null;
};

export const balanceService = {
    addUserBalance,
    addUserBalanceByClaimRefBonus,
    deductUserBalance,
};
