import mongoose from 'mongoose';
import User, { IUser } from '../models/user';
import { IReward } from '../models/cfgReward';
import CfgPool, { ICfgPool } from '../models/cfgPool';
import { balanceService } from '../services/balanceService';
import { addUserItem, stakeUserItem } from '../services/inventoryService';
import UserPool, { IUserPool, IUserPoolAction } from '../models/userPool';
import { redisHelper } from '../io/redis';
import logger from '../utils/logger';
import { ACTION, recordActivityLog } from './activityLogService';
import { transferSeiReward } from '../libs/seichain';

export interface IUserPoolCreateDto {
    description: string;
    startTime: Date;
    endTime: Date;
    reward: IReward;
    stakedItem: 'seya' | 'dragon_ball';
    imageUrl: string;
}

export const createPool = async (poolInput: IUserPoolCreateDto): Promise<ICfgPool> => {
    const { description, startTime, endTime, reward, stakedItem, imageUrl } = poolInput;

    if (startTime.getTime() % (60 * 60 * 1000) != 0 || startTime.getTime() % (60 * 60 * 1000) != 0) {
        throw new Error('startTime and endTime need to be hour rounded');
    }
    if (startTime < endTime) {
        throw new Error('startTime must >= endTime');
    }
    if (stakedItem != 'seya' && stakedItem != 'dragon_ball') {
        throw new Error('Invalid staked item');
    }
    if (!['sei', 'seya'].includes(reward.type)) {
        throw new Error('Invalid reward type');
    }
    if (reward.quantity <= 0) {
        throw new Error('Invalid reward quantity');
    }
    let rp = 0.05;
    if (reward.type == 'sei') {
        rp = 0.05;
    } else if (reward.type == 'seya') {
        rp = 0.2;
    }
    const cfgPool: ICfgPool = new CfgPool({
        description: description,
        startTime: startTime,
        endTime: endTime,
        reward: reward,
        stakedItem: stakedItem,
        imageUrl: imageUrl,
        rp: rp,
    });
    await cfgPool.save();

    return cfgPool;
};

export const getPools = async (userId: string) => {
    const user: IUser | null = await User.findOne({ telegramId: userId });
    if (user == null) {
        throw new Error('User not found');
    }

    const pools: ICfgPool[] = await CfgPool.find({}, { rp: 0, rewardHistories: 0, uStats: 0, bStats: 0 }).sort({ startTime: -1, endTime: 1 }).exec();
    return pools;
};

export const getUserPool = async (userId: string, poolId: string) => {
    const user: IUser | null = await User.findOne({ telegramId: userId });
    if (user == null) {
        throw new Error('User not found');
    }

    const pool: ICfgPool | null = await CfgPool.findOne(
        { _id: new mongoose.Types.ObjectId(poolId) },
        { rp: 0, rewardHistories: 0, uStats: 0, bStats: 0 },
    );
    if (pool == null) {
        throw new Error('Pool not found');
    }

    const userPool: IUserPool | null = await UserPool.findOne(
        { userId: userId, poolId: new mongoose.Types.ObjectId(poolId) },
        { rewards: 0, actions: 0 },
    );

    return { pool, userPool };
};

export const stakePool = async (userId: string, poolId: string, stakedItem: string, stakedAmount: number) => {
    if (stakedAmount <= 0) {
        throw new Error('Invalid staked amount');
    }
    const user: IUser | null = await User.findOne({ telegramId: userId });
    if (user == null) {
        throw new Error('User not found');
    }
    if (user.headquarter.level < 10) {
        throw new Error('User headquarter level needs to reach level 10 to stake');
    }
    const pool: ICfgPool | null = await CfgPool.findOne({ _id: new mongoose.Types.ObjectId(poolId) }, { rewardHistories: 0 });
    if (pool == null) {
        throw new Error('Pool not found');
    }
    if (pool.startTime > new Date()) {
        throw new Error('Pool is not started. Please wait!');
    }
    if (pool.endTime < new Date()) {
        throw new Error('Pool have been ended');
    }

    // lock
    const getLock = await redisHelper.set(`lock_user_pool:${userId}:${poolId}`, 'locked', { nx: true, ex: 5 });
    if (!getLock) {
        throw new Error(`Please try again!`);
    }

    try {
        // stake
        if (stakedItem != pool.stakedItem) {
            throw new Error(`Invalid staked item ${stakedItem}: must be ${pool.stakedItem}`);
        }

        if (stakedItem == 'seya') {
            try {
                await balanceService.deductUserBalance(userId, { seya: stakedAmount });
            } catch (error) {
                logger.error('Error stake', error);
                throw new Error(`You don't have enough ${stakedAmount} ${stakedItem}`);
            }
        } else if (stakedItem == 'dragon_ball') {
            try {
                await stakeUserItem(userId, 'dragon_ball', 7, stakedAmount);
            } catch (error) {
                logger.error('Error stake', error);
                throw new Error(`You don't have enough ${stakedAmount} ${stakedItem}`);
            }
        }

        let userPool: IUserPool | null = await UserPool.findOne({ userId: userId, poolId: new mongoose.Types.ObjectId(poolId) }, { rewards: 0 });
        let isNew = false;
        if (!userPool) {
            userPool = new UserPool({
                userId: userId,
                poolId: new mongoose.Types.ObjectId(poolId),
                stakedItem,
                rewardType: pool.reward.type,

                stakedAmount: 0,
                actions: [],

                rewardedAmount: 0,
                rewards: [],
            });
            isNew = true;
        }

        userPool.stakedAmount += stakedAmount;
        const action: IUserPoolAction = {
            action: 'stake',
            amount: stakedAmount,
            createdAt: new Date(),
        };
        userPool.actions.push(action);

        await userPool.save();

        await CfgPool.findOneAndUpdate({ _id: pool._id }, { $inc: { 'stats.stakedAmount': stakedAmount, 'stats.stakedUser': isNew ? 1 : 0 } });
        if (!user.userCheck) {
            await CfgPool.findOneAndUpdate({ _id: pool._id }, { $inc: { 'uStats.stakedAmount': stakedAmount, 'uStats.stakedUser': isNew ? 1 : 0 } });
        } else {
            await CfgPool.findOneAndUpdate({ _id: pool._id }, { $inc: { 'bStats.stakedAmount': stakedAmount, 'bStats.stakedUser': isNew ? 1 : 0 } });
        }

        await recordActivityLog({
            gameId: user.gameId,
            telegramId: user.telegramId,
            action: ACTION.STAKE_POOL,
            status: 'ok',
            detailsObj: { userId, poolId, stakedItem, stakedAmount },
        });
        return { userPool };
    } catch (error) {
        throw error;
    } finally {
        await redisHelper.del(`lock_user_pool:${userId}:${poolId}`);
    }
};

export const unstakePool = async (userId: string, poolId: string, stakedItem: string, stakedAmount: number) => {
    const user: IUser | null = await User.findOne({ telegramId: userId });
    if (user == null) {
        throw new Error('User not found');
    }
    const pool: ICfgPool | null = await CfgPool.findOne({ _id: new mongoose.Types.ObjectId(poolId) }, { rewardHistories: 0 });
    if (pool == null) {
        throw new Error('Pool not found');
    }
    const userPool: IUserPool | null = await UserPool.findOne({ userId: userId, poolId: new mongoose.Types.ObjectId(poolId) }, { rewards: 0 });
    if (userPool == null) {
        throw new Error('User pool not found');
    }

    // lock
    const getLock = await redisHelper.set(`lock_user_pool:${userId}:${poolId}`, 'locked', { nx: true, ex: 5 });
    if (!getLock) {
        throw new Error(`Please try again later!`);
    }

    try {
        // unstake
        if (stakedItem != pool.stakedItem) {
            throw new Error(`Invalid staked item ${stakedItem}: must be ${pool.stakedItem}`);
        }

        if (stakedItem == 'seya') {
            try {
                await balanceService.addUserBalance(userId, { seya: stakedAmount });
            } catch (error) {
                logger.error('Error unstake', error);
                throw error;
            }
        } else if (stakedItem == 'dragon_ball') {
            try {
                await addUserItem(userId, 'dragon_ball', 7, stakedAmount);
            } catch (error) {
                logger.error('Error unstake', error);
                throw error;
            }
        }

        // TODO: userPool.stakedAmount -= stakedAmount;
        const action: IUserPoolAction = {
            action: 'unstake',
            amount: stakedAmount,
            createdAt: new Date(),
        };
        userPool.actions.push(action);

        await userPool.save();

        await recordActivityLog({
            gameId: user.gameId,
            telegramId: user.telegramId,
            action: ACTION.UNSTAKE_POOL,
            status: 'ok',
            detailsObj: { userId, poolId, stakedItem, stakedAmount },
        });

        return { userPool };
    } catch (error) {
        throw error;
    } finally {
        await redisHelper.del(`lock_user_pool:${userId}:${poolId}`);
    }
};

export const claimPool = async (userId: string, poolId: string) => {
    const user: IUser | null = await User.findOne({ telegramId: userId });
    if (user == null) {
        throw new Error('User not found');
    }
    const pool: ICfgPool | null = await CfgPool.findOne({ _id: new mongoose.Types.ObjectId(poolId) }, { rewardHistories: 0 });
    if (pool == null) {
        throw new Error('Pool not found');
    }
    const userPool: IUserPool | null = await UserPool.findOne(
        { userId: userId, poolId: new mongoose.Types.ObjectId(poolId) },
        { rewards: 0, actions: 0 },
    );
    if (userPool == null) {
        throw new Error('User pool not found');
    }
    if (pool.endTime > new Date()) {
        throw new Error('You can only claim reward after the pool ends');
    }

    // lock
    const getLock = await redisHelper.set(`lock_user_pool:${userId}:${poolId}`, 'locked', { nx: true, ex: 5 });
    if (!getLock) {
        throw new Error(`Please try again!`);
    }

    try {
        if (!pool.isClaimable) {
            throw new Error('Pool reward is being distributed, please wait for a while');
        }
        if (userPool.claimed) {
            throw new Error('Pool reward have been claimed');
        }
        if (userPool.rewardedAmount <= 0) {
            throw new Error('No reward to claim');
        }

        const poolReward = { sei: 0, seya: 0, onchainSei: 0 };
        if (pool.reward.type == 'sei') {
            poolReward.sei = userPool.rewardedAmount;
        } else if (pool.reward.type == 'seya') {
            poolReward.seya = userPool.rewardedAmount;
        } else if (pool.reward.type == 'onchain_sei') {
            poolReward.onchainSei = userPool.rewardedAmount;
        }

        if (poolReward.onchainSei > 0) {
            if (process.env.NODE_ENV == 'production') {
                if (process.env.QUEST_REWARD_SENDER_PK != undefined && process.env.QUEST_REWARD_SENDER_PK != null) {
                    userPool.claimed = true;
                    await userPool.save();

                    try {
                        await transferSeiReward(process.env.QUEST_REWARD_SENDER_PK, user.evmAddress, poolReward.onchainSei);
                    } catch (error) {
                        await recordActivityLog({
                            status: 'failed',
                            gameId: user.gameId,
                            telegramId: user.telegramId,
                            action: ACTION.CLAIM_POOL,
                            details: JSON.stringify(error),
                            detailsObj: { userId, poolId, poolReward },
                        });
                        throw error;
                    } finally {
                        userPool.claimed = false;
                        await userPool.save();
                    }
                } else {
                    throw new Error('Unexpected error. Please contact with us!');
                }
            }
        } else {
            await balanceService.addUserBalance(userId, poolReward);

            userPool.claimed = true;
            await userPool.save();
        }

        await recordActivityLog({
            status: 'ok',
            gameId: user.gameId,
            telegramId: user.telegramId,
            action: ACTION.CLAIM_POOL,
            seya: poolReward.seya,
            sei: poolReward.sei,
            onchainSei: poolReward.onchainSei,
            detailsObj: { userId, poolId, poolReward },
        });

        return { reward: poolReward };
    } catch (error) {
        throw error;
    } finally {
        await redisHelper.del(`lock_user_pool:${userId}:${poolId}`);
    }
};
