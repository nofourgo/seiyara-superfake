import logger from '../utils/logger';
import Database from '../libs/database';
import CfgPool, { ICfgPool, ICfgPoolRewardHistory } from '../models/cfgPool';
import UserPool, { IUserPool, IUserPoolReward } from '../models/userPool';
import { unstakePool } from '../services/poolService';

const POOL_REWARD_INTERVAL = process.env.NODE_ENV === 'production' ? 60 * 60 * 1000 : 5 * 60 * 1000;

let isInProgress = false;

const dbInstance = Database.getInstance();
const db = await dbInstance.getDb();
const todoCollection = db.collection('todos');

export const distributeRewardForAllPools = async () => {
    if (isInProgress) {
        return;
    }

    isInProgress = true;
    try {
        const pools: ICfgPool[] = await CfgPool.find({ isClaimable: false }).exec();

        for (const pool of pools) {
            await distributePoolReward(pool);
        }
    } catch (error) {
        logger.error('[distributed_pool_reward] Error when distributing reward for all pools', error);
    } finally {
        isInProgress = false;
    }
};

const distributePoolReward = async (pool: ICfgPool) => {
    let isContinue = true;
    while (isContinue) {
        try {
            if (pool.startTime > new Date()) {
                return;
            }
            if (pool.isClaimable) {
                return;
            }
            let rewardRoundTime = pool.startTime;
            if (pool.rewardHistories && pool.rewardHistories.length > 0) {
                rewardRoundTime = new Date(pool.rewardHistories[pool.rewardHistories.length - 1].round.getTime() + POOL_REWARD_INTERVAL);
            }
            if (rewardRoundTime > new Date()) {
                return;
            }
            if (rewardRoundTime.getTime() + POOL_REWARD_INTERVAL > new Date().getTime()) {
                isContinue = false;
            }

            const roundCount = (pool.endTime.getTime() - pool.startTime.getTime()) / POOL_REWARD_INTERVAL;
            const roundReward = pool.reward.quantity / roundCount;

            const userPools: IUserPool[] = await UserPool.find({ poolId: pool._id }).exec();

            let totalPoint = 0;
            let userPoints = [];

            // calculate points
            for (let i = 0; i < userPools.length; i++) {
                const userPool = userPools[i];
                const userActions = userPool.actions;
                let userPoint = 0;
                let legitActions = [];
                for (const action of userActions) {
                    if (action.action == 'stake' && action.createdAt < rewardRoundTime) {
                        const timeFactor = Math.min(1, (rewardRoundTime.getTime() - action.createdAt.getTime()) / POOL_REWARD_INTERVAL);
                        userPoint += action.amount * timeFactor;

                        legitActions.push(action);
                    }
                }
                totalPoint += userPoint;
                userPoints.push(userPoint);
            }

            let distributedReward = 0,
                ur = 0,
                br = 0;
            // distribute reward by points
            for (let i = 0; i < userPools.length; i++) {
                const userPool = userPools[i];
                if (userPoints[i] <= 0) {
                    continue;
                }

                let userReward: IUserPoolReward | null = null;
                for (const prevReward of userPool.rewards) {
                    if (prevReward.rewardTime == rewardRoundTime) {
                        userReward = prevReward;
                    }
                }

                if (!userReward) {
                    const userRoundReward = (userPoints[i] / totalPoint) * roundReward;
                    userReward = {
                        rewardedAmount: userRoundReward,
                        stakedAmount: userPoints[i],
                        rewardTime: rewardRoundTime,
                        createdAt: new Date(),
                    };

                    // Save user pool
                    userPool.rewards.push(userReward);
                    userPool.rewardedAmount += userRoundReward;
                    await userPool.save();
                }

                distributedReward += userReward.rewardedAmount;
                if (userPool.userId.startsWith('b')) {
                    br += userReward.rewardedAmount;
                } else {
                    ur += userReward.rewardedAmount;
                }
            }

            // Save pool
            pool.stats.paidReward += distributedReward;
            if (rewardRoundTime.getTime() >= pool.endTime.getTime()) {
                pool.isClaimable = true;
            }
            const rewardHistoryRecord: ICfgPoolRewardHistory = {
                round: rewardRoundTime,
                distributedReward,
                br,
                ur,
            };
            pool.rewardHistories.push(rewardHistoryRecord);
            await pool.save();

            logger.info(`[distributed_pool_reward] Done distributing rewards for pool ${pool._id}: ${JSON.stringify(rewardHistoryRecord)}`);
            const todo = {
                todo_type: 'bot:send/tele/message',
                message_type: 'msgBot:poolReward',
                admin_address: 'game_event_bot',
                created_at: new Date(),
                status: 'pending',
                target_type: 'group',
                target_id: '-1002407656944', // Hardcoded group ID
                thread_id: '7574', // Hardcoded thread ID for the test
                message: `Pool [${pool.description}] reward: time=${rewardRoundTime}: totalReward=${distributedReward}, user=${ur}, bot=${br}, userRewardRate=${Number((ur / distributedReward) * 100).toFixed(2)}%`,
            };
            await todoCollection.insertOne(todo);

            if (pool.isClaimable) {
                logger.info(`[distributed_pool_reward] Unstake all for pool ${pool._id}`);
                for (let i = 0; i < userPools.length; i++) {
                    const userPool = userPools[i];
                    try {
                        await unstakePool(userPool.userId, userPool.poolId.toString(), userPool.stakedItem, userPool.stakedAmount);
                    } catch (error) {
                        logger.error(`[distributed_pool_reward] Error when unstaking for userpool ${userPool._id}`, error);
                    }
                }
                const todo = {
                    todo_type: 'bot:send/tele/message',
                    message_type: 'msgBot:poolReward',
                    admin_address: 'game_event_bot',
                    created_at: new Date(),
                    status: 'pending',
                    target_type: 'group',
                    target_id: '-1002407656944', // Hardcoded group ID
                    thread_id: '7574', // Hardcoded thread ID for the test
                    message: `Pool [${pool.description}] ended`,
                };
                await todoCollection.insertOne(todo);
            }
        } catch (error) {
            logger.error(`[distributed_pool_reward] Error when distributing rewards for pool ${pool._id}`, error);
            isContinue = false;
        } finally {
        }
    }
};
