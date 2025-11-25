import { redisCommands, redisHelper } from '../io/redis';
import CfgSubscription, { ICfgSubscription } from '../models/cfgSubscription';
import User, { IUser } from '../models/user';
import * as inventoryService from '../services/inventoryService';
import UserSubcription, { IUserSubscription } from '../models/userSubcription';
import * as redis from '../services/redis';
import * as referralService from './referralService';
import { ACTION, recordActivityLog } from './activityLogService';
import { purchase } from '../libs/seichain';
import { decryptData } from '../utils/encryption';
import { balanceService } from './balanceService';

export const getActiveSubscriptions = async () => {
    const activeSubs: ICfgSubscription[] = await CfgSubscription.find({ active: true }).exec();

    return { subscriptions: activeSubs };
};

export const getUserSubscriptions = async (telegramId: string) => {
    const userSubs: IUserSubscription[] = await UserSubcription.find({ userId: telegramId })
        .sort({ purchasedAt: -1 })
        .populate('subscription')
        .exec();

    const userSubsWithClaimStatus = await Promise.all(
        userSubs.map(async (userSub) => {
            let claimed = true;
            if (userSub.type == 'basic_daily_reward' || userSub.type == 'advanced_daily_reward') {
                const claimStr = await redisCommands.get(
                    userSubClaimKey(userSub._id.toString())
                );

                claimed = !claimStr ? false : true;
            }
            return {
                ...userSub.toObject(),
                claimed,
            };
        }),
    );

    return { subscriptions: userSubsWithClaimStatus };
};

export const purchaseSubscription = async (userId: string, cfgSubscriptionId: string) => {
    // Find the user and validate existence
    const user: IUser | null = await User.findOne(
        { telegramId: userId },
        { mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 },
    ).exec();
    if (!user) {
        throw new Error('User not found');
    }

    // Find the subscription and validate its status
    const sub: ICfgSubscription | null = await CfgSubscription.findOne({ _id: cfgSubscriptionId, active: true }).exec();
    if (!sub) {
        throw new Error('Subscription not found or inactive');
    }

    // Attempt to make the purchase
    let receipt;
    try {
        receipt = await purchase(decryptData(user.privateKey), sub.seiPrice);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
        await recordActivityLog({
            gameId: user.gameId,
            telegramId: user.telegramId,
            action: ACTION.BUY_SUB,
            status: 'failed',
            subName: `${sub.type} ${sub.subsTimeDay}day`,
            cfgSubscriptionId: sub._id,
            details: `Purchase error: ${errorMessage}`,
        });
        throw new Error(`Payment is not successful: ${errorMessage}`);
    }

    // Check receipt status
    if (receipt?.status === 1) {
        // Payment succeeded
    } else {
        const receiptDetails = receipt ? JSON.stringify(receipt) : 'No receipt';
        await recordActivityLog({
            gameId: user.gameId,
            telegramId: user.telegramId,
            action: ACTION.BUY_SUB,
            status: 'failed',
            subName: `${sub.type} ${sub.subsTimeDay}day`,
            cfgSubscriptionId: sub._id,
            details: `Transaction failed: ${receiptDetails}`,
        });
        throw new Error(`Payment is not successful: ${receipt?.status || receipt?.code || 'unknown'}`);
    }

    const now = new Date();
    const previousSameTypeSub: IUserSubscription | null = await UserSubcription.findOne({ userId: userId, type: sub.type })
        .sort({ purchasedAt: -1 })
        .populate('subscription')
        .exec();

    if (previousSameTypeSub && now < previousSameTypeSub.endTime) {
        // Extend subscription if user has an active one
        previousSameTypeSub.day += sub.subsTimeDay;
        previousSameTypeSub.endTime = new Date(previousSameTypeSub.endTime.getTime() + sub.subsTimeDay * 24 * 60 * 60 * 1000);
        previousSameTypeSub.purchasedAt = now;

        await previousSameTypeSub.save();

        await referralService.recordBonusForReferer(userId, user.referredByCode, { type: 'sei', quantity: sub.seiPrice });
        await User.findOneAndUpdate({ telegramId: user.telegramId }, { $inc: { spentSei: sub.seiPrice } });

        await recordActivityLog({
            gameId: user.gameId,
            telegramId: user.telegramId,
            action: ACTION.BUY_SUB,
            sei: -sub.seiPrice,
            subName: `${sub.type} ${sub.subsTimeDay}day`,
            cfgSubscriptionId: sub._id,
            details: 'Subscription extended',
        });
        return { subscription: previousSameTypeSub };
    }

    // Start a new subscription
    const endTime = new Date(now.getTime() + sub.subsTimeDay * 24 * 60 * 60 * 1000);
    const newSubs: IUserSubscription = new UserSubcription({
        userId: userId,
        subscription: sub,
        type: sub.type,
        name: sub.name,
        day: sub.subsTimeDay,
        startTime: now,
        endTime: endTime,
        purchasedAt: now,
    });
    await newSubs.save();

    const firstPurchaseReward = {
        gold: 0,
        diamond: 0,
        seya: 0,
    };
    if (!previousSameTypeSub) {
        for (const reward of sub.firstPurchaseReward) {
            if (reward.type == 'gold') {
                firstPurchaseReward.gold += reward.quantity;
            } else if (reward.type == 'diamond') {
                firstPurchaseReward.diamond += reward.quantity;
            } else if (reward.type == 'seya') {
                firstPurchaseReward.seya += reward.quantity;
            }
        }
    }
    await balanceService.addUserBalance(userId, firstPurchaseReward);

    await referralService.recordBonusForReferer(userId, user.referredByCode, { type: 'sei', quantity: sub.seiPrice });
    await recordActivityLog({
        gameId: user.gameId,
        telegramId: user.telegramId,
        action: ACTION.BUY_SUB,
        sei: -sub.seiPrice,
        subName: `${sub.type} ${sub.subsTimeDay}day`,
        cfgSubscriptionId: sub._id,
        details: 'New subscription started, with potential first-buy diamond bonus',
    });
    await User.findOneAndUpdate({ telegramId: user.telegramId }, { $inc: { spentSei: sub.seiPrice } });

    return { subscription: newSubs, firstPurchasedReward: sub.firstPurchaseReward };
};

const userSubClaimKey = (userSubId: string) => {
    const firstTodayTs = new Date().setHours(0, 0, 0, 0);
    return `daily_sub_claim:${userSubId}_${firstTodayTs}`;
};

export const claimSubscription = async (userId: string, cfgSubscriptionId: string) => {
    const user: IUser | null = await User.findOne(
        { telegramId: userId },
        { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 },
    ).exec();
    if (!user) {
        throw new Error('User not found');
    }

    const currentSub: IUserSubscription | null = await UserSubcription.findOne({
        userId: userId,
        subscription: cfgSubscriptionId,
        endTime: { $gt: new Date() },
    })
        .populate('subscription')
        .exec();
    if (!currentSub) {
        throw new Error('This subscription is not found or expired');
    }

    const isFirstClaimed = await redisHelper.set(
        userSubClaimKey(currentSub._id.toString()),
        'claimed',
        { nx: true, ex: 24 * 60 * 60 }
    );

    if (!isFirstClaimed) {
        throw new Error('You have claimed this subscription reward today');
    }

    if (currentSub.subscription.type == 'basic_daily_reward' || currentSub.subscription.type == 'advanced_daily_reward') {
        let subDailyReward = {
            gold: 0,
            diamond: 0,
        };
        for (let i = 0; i < currentSub.subscription.dailyReward.length; i++) {
            const reward = currentSub.subscription.dailyReward[i];
            if (reward.type == 'gold') {
                subDailyReward.gold += reward.quantity;
            } else if (reward.type == 'diamond') {
                subDailyReward.diamond += reward.quantity;
            } else if (reward.type == 'lucky_chest') {
                await inventoryService.addUserItem(userId, 'lucky_chest', 0, reward.quantity);
            }
        }
        await balanceService.addUserBalance(userId, subDailyReward);

        await recordActivityLog({
            gameId: user.gameId,
            telegramId: user.telegramId,
            action: ACTION.CLAIM_DAILY_SUB,
            diamond: subDailyReward.diamond,
            subName: `${currentSub.subscription.type} ${currentSub.subscription.subsTimeDay}day`,
            cfgSubscriptionId: currentSub.subscription._id,
        });

        return { reward: currentSub.subscription.dailyReward };
    } else if (currentSub.subscription.type == 'no_ads') {
        return { message: 'Claimed OK' };
    }
};

export const checkFreeAd = async (userId: string) => {
    const noAdSub: IUserSubscription | null = await UserSubcription.findOne({ userId: userId, type: 'no_ads', endTime: { $gte: new Date() } }).exec();
    if (!noAdSub) {
        // no active sub
        return { freeAd: false };
    }
    return { freeAd: true };
};
