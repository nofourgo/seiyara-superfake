import { redisCommands, redisHelper } from '../io/redis';
import { IReward } from '../models/cfgReward';
import CfgSubscription, { ICfgSubscription } from '../models/cfgSubscription';
import User, { IUser } from '../models/user';
import UserSubcription, { IUserSubscription } from '../models/userSubcription';
import { ACTION, recordActivityLog } from './activityLogService';
import { balanceService } from './balanceService';
import { addUserItem } from './inventoryService';
import * as referralService from '../services/referralService';

const DAILY_FREE_SPINS_KEY = (userId: string, now: Date) => `minigame:${userId}:${now.toISOString().slice(0, 10)}:free_spins:`;

export const getSpinCount = async (userId: string) => {
    // Retrieve the user from MongoDB
    const user: IUser | null = await User.findOne({ telegramId: userId });
    if (!user) {
        throw new Error('User not found');
    }

    // Get daily free spins count from Redis
    const now = new Date();
    const freeSpinsKey = DAILY_FREE_SPINS_KEY(userId, now);
    let dailySpins = await redisCommands.get(freeSpinsKey);
    let dailySpinCount = 0;

    if (dailySpins === null) {
        // Set initial free spins for the day if not already set
        const lockKey = `user:${userId}:spinLock`;
        const getLock = await redisHelper.set(lockKey, 'locked', { nx: true, ex: 1 });
        if (getLock) {
            dailySpinCount = 2; // Default free spins count
            await redisHelper.set(freeSpinsKey, dailySpinCount.toString(), { ex: 86400 }); // Expire in 24 hours
        }
    } else {
        dailySpinCount = parseInt(dailySpins);
    }

    // Calculate remaining spins: spinnedTicket + daily free spins
    const remainingSpins = user.spinnedTicket + dailySpinCount - user.spinnedCount;

    return { spinCount: remainingSpins };
};

export const spin = async (userId: string) => {
    // Retrieve the user from MongoDB
    const user: IUser | null = await User.findOne({ telegramId: userId });
    if (!user) {
        throw new Error('User not found');
    }

    const lockKey = `user:${userId}:spinLock`;
    // Attempt to acquire lock
    const isLocked = await redisHelper.set(lockKey, 'locked', { nx: true, ex: 1 }); // Lock expires after 1 seconds
    if (!isLocked) {
        throw new Error('Too many requests. Please wait to spin.');
    }

    // Get daily free spins count from Redis
    const now = new Date();
    const freeSpinsKey = DAILY_FREE_SPINS_KEY(userId, now);
    let dailySpins = await redisCommands.get(freeSpinsKey);
    let dailySpinCount = 0;

    if (dailySpins === null) {
        // Set initial free spins for the day if not already set
        dailySpinCount = 2; // Default free spins count
        await redisHelper.set(freeSpinsKey, dailySpinCount.toString(), { ex: 86400 }); // Expire in 24 hours
    } else {
        dailySpinCount = parseInt(dailySpins);
    }

    // Check if user has any spins left (either free spins or referral count)
    if (dailySpinCount > 0) {
        // Decrement daily free spins in Redis
        await redisCommands.decr(freeSpinsKey);
    } else if (user.spinnedCount < user.spinnedTicket) {
        // If no free spins left, decrement referral count in MongoDB
        const result = await User.findOneAndUpdate({ telegramId: userId }, { $inc: { spinnedCount: 1 } }, { new: true });
        if (!result) {
            throw new Error('Too many requests. Please wait to spin.');
        }
    } else {
        // No spins available
        throw new Error('No spins remaining.');
    }

    let reward = await getSpinReward(user);

    return { reward };
};

// Define rewards with their cumulative probabilities
const rewards = [
    { name: 'lucky_chest', quantity: 30, cumulativeChance: 30 },
    { name: 'dragon_chest', quantity: 10, cumulativeChance: 60 },
    { name: 'diamond', quantity: 30, cumulativeChance: 80 },
    { name: 'seya', quantity: 20, cumulativeChance: 99 },
    { name: 'sei', quantity: 0.1, cumulativeChance: 99.01 },
    // Dont use this: { name: 'jackpot', quantity: 100, cumulativeChance: 99.8 },
    { name: 'no_ads', quantity: 1, cumulativeChance: 99.005 },
    { name: 'basic_daily_reward', quantity: 1, cumulativeChance: 99.0055 },
    { name: 'lucky_chest', quantity: 50, cumulativeChance: 100 },
];

const getSpinReward = async (user: IUser) => {
    const randomNum = Math.random() * 100; // Random number between 0 and 100

    let randomReward;
    for (let reward of rewards) {
        if (randomNum < reward.cumulativeChance) {
            randomReward = reward;
            break;
        }
    }
    if (!randomReward) {
        randomReward = rewards[0];
    }

    switch (randomReward.name) {
        case 'lucky_chest':
            await addUserItem(user.telegramId, 'lucky_chest', 1, randomReward.quantity);
            await recordActivityLog({
                gameId: user.gameId,
                telegramId: user.telegramId,
                action: ACTION.SPIN_MINIGAME,
                quantity: randomReward.quantity,
                itemType: 'lucky_chest',
            });
            break;
        case 'dragon_chest':
            await addUserItem(user.telegramId, 'dragon_chest', 0, randomReward.quantity);
            await recordActivityLog({
                gameId: user.gameId,
                telegramId: user.telegramId,
                action: ACTION.SPIN_MINIGAME,
                quantity: randomReward.quantity,
                itemType: 'dragon_chest',
            });
            break;
        case 'diamond':
            await balanceService.addUserBalance(user.telegramId, { diamond: randomReward.quantity });
            await recordActivityLog({
                gameId: user.gameId,
                telegramId: user.telegramId,
                action: ACTION.SPIN_MINIGAME,
                diamond: randomReward.quantity,
            });
            await referralService.recordBonusForReferer(user.telegramId, user.referredByCode, { type: 'diamond', quantity: randomReward.quantity });
            break;
        case 'seya':
            await balanceService.addUserBalance(user.telegramId, { seya: randomReward.quantity });
            await recordActivityLog({
                gameId: user.gameId,
                telegramId: user.telegramId,
                action: ACTION.SPIN_MINIGAME,
                seya: randomReward.quantity,
            });
            break;
        case 'sei':
            await balanceService.addUserBalance(user.telegramId, { sei: randomReward.quantity });
            await recordActivityLog({
                gameId: user.gameId,
                telegramId: user.telegramId,
                action: ACTION.SPIN_MINIGAME,
                sei: randomReward.quantity,
            });
            break;
        case 'no_ads':
        case 'basic_daily_reward':
            let sub: ICfgSubscription | null;
            if (randomReward.name == 'no_ads') {
                sub = await CfgSubscription.findOne({ type: 'no_ads', subsTimeDay: 7 }).exec();
            } else if (randomReward.name == 'basic_daily_reward') {
                sub = await CfgSubscription.findOne({ type: 'basic_daily_reward', subsTimeDay: 7 }).exec();
            } else {
                sub = null;
            }
            if (!sub) {
                throw new Error('No cfg subscription found for spin reward: ${randomReward.name}');
            }

            const now = new Date();
            const previousSameTypeSub: IUserSubscription | null = await UserSubcription.findOne({ userId: user.telegramId, type: sub.type })
                .sort({ purchasedAt: -1 })
                .populate('subscription')
                .exec();

            if (previousSameTypeSub && now < previousSameTypeSub.endTime) {
                // Extend subscription if user has an active one
                previousSameTypeSub.day += sub.subsTimeDay;
                previousSameTypeSub.endTime = new Date(previousSameTypeSub.endTime.getTime() + sub.subsTimeDay * 24 * 60 * 60 * 1000);
                previousSameTypeSub.purchasedAt = now;

                await previousSameTypeSub.save();
                await recordActivityLog({
                    gameId: user.gameId,
                    telegramId: user.telegramId,
                    action: ACTION.SPIN_MINIGAME,
                    subName: `${sub.type} ${sub.subsTimeDay}day`,
                    cfgSubscriptionId: sub._id,
                    details: 'Minigame: Subscription extended',
                });
            } else {
                // Start a new subscription
                const endTime = new Date(now.getTime() + sub.subsTimeDay * 24 * 60 * 60 * 1000);
                const newSubs: IUserSubscription = new UserSubcription({
                    userId: user.telegramId,
                    subscription: sub,
                    type: sub.type,
                    name: sub.name,
                    day: sub.subsTimeDay,
                    startTime: now,
                    endTime: endTime,
                    purchasedAt: now,
                });
                await newSubs.save();

                await recordActivityLog({
                    gameId: user.gameId,
                    telegramId: user.telegramId,
                    action: ACTION.SPIN_MINIGAME,
                    subName: `${sub.type} ${sub.subsTimeDay}day`,
                    cfgSubscriptionId: sub._id,
                    details: 'Minigame: New subscription started',
                });
            }
            break;
    }

    return {
        name: randomReward.name,
        quantity: randomReward.quantity,
    };
};
