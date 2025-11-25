import mongoose from 'mongoose';

import Badge, { ICfgBadge } from '../models/cfgBadge';
import UserBadge, { IUserBadge } from '../models/userBadge';
import User, { IUser } from '../models/user';
import { redisHelper } from '../io/redis';
import { checkin } from '../libs/seichain';
import { decryptData } from '../utils/encryption';
import { ACTION, recordActivityLog } from './activityLogService';

const BADGE_CLAIM_SEI_PRICE = 0.0001;

// Get Badges
const updateUserBadgeProgress = (user: IUser, userBadge: IUserBadge) => {
    if (userBadge.badge.type == 'og') {
        userBadge.completed = true;
    }
};

export const getUserBadges = async (userId: string): Promise<IUserBadge[]> => {
    const user: IUser | null = await User.findOne(
        { telegramId: userId },
        { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 },
    ).exec();
    if (!user) {
        throw new Error('User not found');
    }

    // Fetch all badges
    const badges: ICfgBadge[] = await Badge.find().exec();
    if (badges.length === 0) {
        throw new Error('No badges found');
    }

    let userBadges: IUserBadge[] = await UserBadge.find({ userId }).populate('badge').exec();
    await Promise.all(
        userBadges.map(async (userBadge) => {
            updateUserBadgeProgress(user, userBadge);
            return await userBadge.save();
        }),
    );

    // get new one time badges and add for user
    const newUserBadges: IUserBadge[] = await Promise.all(
        badges
            .filter((badge) => !userBadges.some((existingBadge) => (existingBadge.badge as unknown as mongoose.Types.ObjectId).equals(badge._id)))
            .map(async (badge) => {
                const userBadge = new UserBadge({
                    userId,
                    badge: badge,
                    badgeType: badge.type,
                    completed: false,
                    claimed: false,
                });
                updateUserBadgeProgress(user, userBadge);
                return await userBadge.save();
            }),
    );

    return [...userBadges, ...newUserBadges].sort((a, b) => {
        return Number(a.claimed) - Number(b.claimed);
    });
};

const LOCK_BADGE_CLAIM = (userBadgeId: string) => `lock:badge_claim:${userBadgeId}`;
export const claimUserBadge = async (userId: string, userBadgeId: mongoose.Types.ObjectId) => {
    if (new Date() >= new Date(Date.UTC(2024, 10, 4, 0, 0, 0))) {
        throw new Error('The time to claim OG Badge is over');
    }

    const userBadge = await UserBadge.findOne({ _id: userBadgeId, completed: true, claimed: false }).populate('badge').exec();
    if (!userBadge) {
        throw new Error('No badge found or the badge has been claimed');
    }

    // lock
    const locked = await redisHelper.set(LOCK_BADGE_CLAIM(userBadgeId.toString()), 'locked', { nx: true, ex: 10 }); // 10s
    if (!locked) {
        throw new Error('Badge claim is in progress. Please wait!');
    }

    try {
        const user: IUser | null = await User.findOne({ telegramId: userId }).exec();
        if (!user) {
            throw new Error('User not found');
        }

        if (process.env.NODE_ENV === 'local') {
            // auto pass
        } else {
            // pay sei to claim
            let receipt;
            try {
                receipt = await checkin(decryptData(user.privateKey), BADGE_CLAIM_SEI_PRICE);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
                await recordActivityLog({
                    gameId: user.gameId,
                    telegramId: user.telegramId,
                    action: ACTION.CLAIM_BADGE,
                    status: 'failed',
                    details: `Claim badge error: ${errorMessage}`,
                });
                throw new Error(`Claiming badge is not successful: ${errorMessage}`);
            }

            // Validate transaction receipt
            if (receipt?.status !== 1) {
                const receiptDetails = JSON.stringify(receipt);
                await recordActivityLog({
                    gameId: user.gameId,
                    telegramId: user.telegramId,
                    action: ACTION.CLAIM_BADGE,
                    status: 'failed',
                    details: `Transaction claim badge failed: ${receiptDetails}`,
                });
                throw new Error(`Claiming badge is not successful: ${receipt?.status || 'unknown'}`);
            }
        }

        userBadge.claimed = true;
        await userBadge.save();

        await recordActivityLog({
            gameId: user.gameId,
            telegramId: user.telegramId,
            action: ACTION.CLAIM_BADGE,
            details: userBadge.badgeType,
        });
        await User.findOneAndUpdate({ telegramId: user.telegramId }, { $inc: { spentSei: BADGE_CLAIM_SEI_PRICE } });

        return { userBadge };
    } catch (error) {
        throw error;
    } finally {
        // release lock
        await redisHelper.del(LOCK_BADGE_CLAIM(userBadgeId.toString()));
    }
};
