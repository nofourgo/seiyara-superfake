import { redisCommands, redisHelper } from '../io/redis';
import { purchase } from '../libs/seichain';
import User, { IUser } from '../models/user';
import { decryptData } from '../utils/encryption';
import { ACTION, recordActivityLog } from './activityLogService';
import * as referralService from '../services/referralService';

const USER_BOOST_KEY = (userId: string) => `boost:${userId}`;
const USER_FREE_BOOST_KEY = (userId: string, date: string) => `boost:${userId}:${date}`;

const BOOST_SEI_PRICE = 0.01;
const BOOST_TIME = 60 * 60 * 1000; // 1 hour
const BOOST_TIME_BY_AD = 20 * 60 * 1000; // 20m

const getBoost = async (userId: string) => {
    const user: IUser | null = await User.findOne({ telegramId: userId }).exec();
    if (!user) {
        throw new Error('User not found');
    }

    let hasBoost = false;
    let endTime = null;
    const endTimestamp = await redisCommands.get(USER_BOOST_KEY(userId));
    if (endTimestamp && parseInt(endTimestamp) > new Date().getTime()) {
        hasBoost = true;
        endTime = new Date(parseInt(endTimestamp));
    }

    const now = new Date();
    const freeBoostByAd = await redisCommands.get(USER_FREE_BOOST_KEY(userId, now.toISOString().split('T')[0]));

    return { hasBoost, endTime, watchAd: freeBoostByAd ? true : false };
};

const purchaseBoost = async (userId: string) => {
    const user: IUser | null = await User.findOne({ telegramId: userId }).exec();
    if (!user) {
        throw new Error('User not found');
    }

    const now = new Date();

    const endTimestamp = await redisCommands.get(USER_BOOST_KEY(userId));
    let endTime = now;
    if (endTimestamp && parseInt(endTimestamp) > now.getTime()) {
        // extend
        endTime = new Date(parseInt(endTimestamp));
    }

    if (endTime.getTime() + BOOST_TIME - now.getTime() > 12 * 60 * 60 * 1000) {
        throw new Error('You can not extend boost time duration more than 12 hours');
    }

    let receipt;
    if (process.env.NODE_ENV === 'local') {
        // pass
    } else {
        try {
            receipt = await purchase(decryptData(user.privateKey), BOOST_SEI_PRICE);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            await recordActivityLog({
                gameId: user.gameId,
                telegramId: user.telegramId,
                action: ACTION.BUY_BOOST,
                status: 'failed',
                details: `Error during purchase: ${errorMessage}`,
            });
            throw new Error(`Payment is not successful: ${errorMessage}`);
        }

        if (receipt?.status === 1) {
            // Successful transaction
        } else {
            await recordActivityLog({
                gameId: user.gameId,
                telegramId: user.telegramId,
                action: ACTION.BUY_BOOST,
                status: 'failed',
                details: JSON.stringify(receipt), // Store the entire receipt as a JSON string
            });
            throw new Error(`Payment is not successful: ${receipt?.status || receipt?.code || 'unknown'}`);
        }
    }

    await referralService.recordBonusForReferer(userId, user.referredByCode, { type: 'sei', quantity: BOOST_SEI_PRICE });
    await recordActivityLog({
        gameId: user.gameId,
        telegramId: user.telegramId,
        action: ACTION.BUY_BOOST,
        sei: -BOOST_SEI_PRICE,
    });
    await User.findOneAndUpdate({ telegramId: user.telegramId }, { $inc: { spentSei: BOOST_SEI_PRICE } });

    const newEndTimestamp = endTime.getTime() + BOOST_TIME;
    await redisHelper.set(USER_BOOST_KEY(userId), newEndTimestamp.toString(), { ex: 13 * 60 * 60 * 1000 });

    return { hasBoost: true, endTime: new Date(newEndTimestamp) };
};

const getFreeBoostByAd = async (userId: string) => {
    const user: IUser | null = await User.findOne({ telegramId: userId }).exec();
    if (!user) {
        throw new Error('User not found');
    }

    const now = new Date();
    const firstTimeInDay = await redisHelper.set(USER_FREE_BOOST_KEY(userId, now.toISOString().split('T')[0]), 'watched', { ex: 24 * 60 * 60, nx: true });
    if (!firstTimeInDay) {
        throw new Error('You already get free boost by watching ad today');
    }

    const endTimestamp = await redisCommands.get(USER_BOOST_KEY(userId));
    let endTime = now;
    if (endTimestamp && parseInt(endTimestamp) > now.getTime()) {
        // extend
        endTime = new Date(parseInt(endTimestamp));
    }

    const newEndTimestamp = endTime.getTime() + BOOST_TIME_BY_AD;
    await redisHelper.set(USER_BOOST_KEY(userId), newEndTimestamp.toString(), { ex: 13 * 60 * 60 * 1000 });

    await recordActivityLog({
        gameId: user.gameId,
        telegramId: user.telegramId,
        action: ACTION.GET_FREE_BOOST_BY_AD,
    });

    return { hasBoost: true, endTime: new Date(newEndTimestamp) };
};

export const boostService = {
    getBoost,
    purchaseBoost,
    getFreeBoostByAd,
};
