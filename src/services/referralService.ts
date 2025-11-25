import Referral, { IReferral } from '../models/referral';
import User, { IUser } from '../models/user';
import { ACTION, recordActivityLog } from './activityLogService';
import { balanceService } from './balanceService';
import logger from '../utils/logger';

const TOP_FRIEND_LIMIT = 100;

const BONUS_DIAMOND_RATE = 0.05;
const BONUS_SEI_RATE = 0.1;

interface UserReferralInfo {
    totalFriend: number;
    topFriends: Array<{ userId: string; gameId: string; username: string; bonusDiamond: number; bonusSei: number }>;
    totalBonusDiamond: number;
    totalBonusSei: number;
    claimedDiamond: number;
    claimedSei: number;
}

export const getUserReferrals = async (userId: string): Promise<UserReferralInfo> => {
    const user: IUser | null = await User.findOne(
        { telegramId: userId },
        { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 },
    ).exec();
    if (!user) {
        throw new Error('User not found');
    }

    const friendCount: number = await Referral.countDocuments({ inviteCode: user.inviteCode }).exec();
    const topFriends: Array<{ userId: string; gameId: string; username: string; bonusDiamond: number; bonusSei: number }> = await Referral.aggregate([
        {
            $match: {
                inviteCode: user.inviteCode,
            },
        },
        {
            $lookup: {
                from: 'users',
                localField: 'telegramId',
                foreignField: 'telegramId',
                as: 'refereeInfo',
            },
        },
        {
            $unwind: '$refereeInfo',
        },
        {
            $project: {
                _id: 0,
                telegramId: 1,
                inviteCode: 1,
                bonusDiamond: 1,
                bonusSei: 1,
                gameId: '$refereeInfo.gameId',
                username: '$refereeInfo.username',
            },
        },
    ])
        .sort({ bonusSei: -1, bonusDiamond: -1 })
        .limit(TOP_FRIEND_LIMIT)
        .exec();

    return {
        totalFriend: friendCount,
        topFriends: topFriends,
        totalBonusDiamond: user.referralBonus.totalDiamond,
        claimedDiamond: user.referralBonus.claimedDiamond,
        totalBonusSei: user.referralBonus.totalSei,
        claimedSei: user.referralBonus.claimedSei,
    };
};

export const claimBonus = async (userId: string) => {
    let user: IUser | null = await User.findOne(
        { telegramId: userId },
        { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 },
    ).exec();
    if (!user) {
        throw new Error('User not found');
    }

    // verify reward
    const diamondAmountToClaim = user.referralBonus?.totalDiamond - user.referralBonus?.claimedDiamond;
    const seiAmountToClaim = user.referralBonus?.totalSei - user.referralBonus?.claimedSei;

    if (diamondAmountToClaim <= 0 && seiAmountToClaim <= 0) {
        throw new Error(`You don't have any bonus $DIAMOND or $SEI to claim now`);
    }

    // claim reward
    const claimed = [];
    if (diamondAmountToClaim > 0) {
        claimed.push({
            type: 'diamond',
            quantity: diamondAmountToClaim,
        });
    }

    if (seiAmountToClaim > 0) {
        claimed.push({
            type: 'sei',
            quantity: seiAmountToClaim,
        });
    }
    await balanceService.addUserBalanceByClaimRefBonus(userId, { diamond: diamondAmountToClaim, sei: seiAmountToClaim });

    await recordActivityLog({
        gameId: user.gameId,
        telegramId: user.telegramId,
        action: ACTION.CLAIM_REF_BONUS,
        sei: seiAmountToClaim,
        diamond: diamondAmountToClaim,
    });

    return {
        reward: claimed,
        referralBonus: user.referralBonus,
    };
};

export const recordBonusForReferer = async (userId: string, inviteCode: string | undefined, bonus: { type: 'diamond' | 'sei'; quantity: number }) => {
    try {
        if (!inviteCode) {
            return;
        }
        if (bonus.quantity <= 0) {
            return;
        }

        const referral: IReferral | null = await Referral.findOne({ telegramId: userId }).exec();
        if (!referral) {
            throw new Error(`Referral not found: telegramId=${userId} inviteCode=${inviteCode}`);
        }

        const referer: IUser | null = await User.findOne(
            { inviteCode: referral.inviteCode },
            { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 },
        ).exec();
        if (!referer) {
            throw new Error(`Referer not found: inviteCode=${inviteCode}`);
        }

        if (bonus.type == 'diamond') {
            const bonusDiamond = Math.round(bonus.quantity * BONUS_DIAMOND_RATE);

            await Referral.findOneAndUpdate({ telegramId: userId }, { $inc: { bonusDiamond: bonusDiamond } });
            await User.findOneAndUpdate({ inviteCode: referral.inviteCode }, { $inc: { 'referralBonus.totalDiamond': bonusDiamond } });
        } else if (bonus.type == 'sei') {
            const bonusSei = bonus.quantity * BONUS_SEI_RATE;

            await Referral.findOneAndUpdate({ telegramId: userId }, { $inc: { bonusSei: bonusSei } });
            await User.findOneAndUpdate({ inviteCode: referral.inviteCode }, { $inc: { 'referralBonus.totalSei': bonusSei } });
        }
    } catch (error) {
        logger.error('Error when record ref bonus', error);
    }
};
