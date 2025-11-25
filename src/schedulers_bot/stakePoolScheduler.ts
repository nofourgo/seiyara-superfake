import cfgPool, { ICfgPool } from '../models/cfgPool';
import user, { IUser } from '../models/user';
import userInventory, { IUserInventory } from '../models/userInventory';
import { stakePool } from '../services/poolService';
import { getRandomInRange } from '../utils/common';
import logger from '../utils/logger';

let isRunning = false;

const SCHEDULE_INTERVAL = process.env.NODE_ENV === 'production' ? 10 * 1000 : 1 * 60 * 1000;

// Map to track active timeouts for each bot
const activeTimeouts: Map<string, Timer> = new Map();

const getRandomBots = (array: any, n: any) => {
    if (array.length == 0) {
        return array;
    }
    if (n > array.length) {
        n = array.length;
    }

    // Create a copy of the array to avoid mutating the original
    const shuffled = [...array];

    // Fisher-Yates shuffle
    for (let i = array.length - 1; i > array.length - 1 - n; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Return the first n elements of the shuffled array
    return shuffled.slice(array.length - n);
};

// Function to execute daily check-in for a bot
const executeStake = async (botId: string, poolId: string, stakedItem: string, amount: number) => {
    try {
        await stakePool(botId, poolId, stakedItem, amount);
        // logger.info(`[stake_pool] Done stake pool for bot ${botId} pool ${poolId}: ${amount} ${stakedItem}`);
    } catch (error) {
        logger.error(`[stake_pool] Error stake for bot ${botId} pool ${poolId}: ${amount} ${stakedItem}`, error);
    } finally {
        activeTimeouts.delete(`${botId}_${poolId}`);
    }
};

// Function to schedule daily check-in for a single bot
const schedulePool = async (pool: ICfgPool) => {
    if (pool.endTime <= new Date() || pool.startTime > new Date()) {
        return;
    }
    const nextSchedule = new Date().getTime() + SCHEDULE_INTERVAL;
    var allStats = pool.stats,
        userStats = pool.uStats,
        botStats = pool.bStats;
    let needToStake = 1;
    if (userStats.stakedAmount > pool.rp * allStats.stakedAmount) {
        needToStake = userStats.stakedAmount / pool.rp - botStats.stakedAmount;
    }

    // logger.info(
    //     `[stake_pool] Pool info: ${pool.description}, userStaked=${userStats.stakedAmount}, botStaked=${botStats.stakedAmount}, needToStake=${needToStake}`,
    // );

    let botIds: string[] = [];
    let stakedAmounts: number[] = [];
    let scheduleToStake = 0;

    if (pool.stakedItem == 'dragon_ball') {
        let botWithDragonBalls: IUserInventory[] = await userInventory
            .find({ itemType: 'dragon_ball', itemLevel: 7, userId: { $regex: /^b/ }, quantity: { $gt: 0 } })
            .exec();
        botWithDragonBalls = getRandomBots(botWithDragonBalls, botWithDragonBalls.length);

        for (let i = 0; i < botWithDragonBalls.length; i++) {
            const botWithDragonBall = botWithDragonBalls[i];
            botIds.push(botWithDragonBall.userId);

            const actualStake =
                needToStake - scheduleToStake >= botWithDragonBall.quantity ? botWithDragonBall.quantity : Math.round(getRandomInRange(1, 3));

            stakedAmounts.push(actualStake);
            scheduleToStake += actualStake;
            if (scheduleToStake >= needToStake) {
                break;
            }
        }
    } else if (pool.stakedItem == 'seya') {
        let botWithSeyas = await user.find({ seya: { $gt: 0 }, telegramId: { $regex: /^b/ } }).exec();
        botWithSeyas = getRandomBots(botWithSeyas, botWithSeyas.length);

        for (let i = 0; i < botWithSeyas.length; i++) {
            const botWithSeya = botWithSeyas[i];
            botIds.push(botWithSeya.telegramId);

            const actualStake = needToStake - scheduleToStake >= botWithSeya.seya ? botWithSeya.seya : Math.round(getRandomInRange(100, 300));

            stakedAmounts.push(actualStake);
            scheduleToStake += actualStake;

            if (scheduleToStake >= needToStake) {
                break;
            }
        }
    }

    // logger.info(
    //     `[stake_pool] Schedule to stake: pool=${pool.description}, need=${needToStake}, schedule=${scheduleToStake}, botCount=${botIds.length}`,
    // );

    for (let i = 0; i < botIds.length; i++) {
        const botId = botIds[i];
        const amount = stakedAmounts[i];

        if (activeTimeouts.has(`${botId}_${pool._id.toString()}`)) {
            continue;
        }
        const delayTimeout = getRandomInRange(0, nextSchedule - new Date().getTime());

        const timeoutId = setTimeout(async () => {
            await executeStake(botId, pool._id.toString(), pool.stakedItem, amount);
        }, delayTimeout);
        activeTimeouts.set(`${botId}_${pool._id.toString()}`, timeoutId);
    }
};

// Main function to schedule all daily check-ins
export const scheduleAllPools = async () => {
    if (isRunning) {
        return;
    }
    isRunning = true;

    try {
        logger.info(`[stake_pool] Start scheduleAllPools`);

        const pools: ICfgPool[] = await cfgPool.find({ endTime: { $gt: new Date() } });

        for (const pool of pools) {
            await schedulePool(pool);
        }
        logger.info(`[stake_pool] Finished scheduleAllPools`);
    } catch (error) {
        logger.error(`[stake_pool] Error in scheduleAllPools`, error);
    } finally {
        isRunning = false;
    }
};

export const startStakePoolScheduler = async () => {
    try {
        await scheduleAllPools();
        setInterval(scheduleAllPools, SCHEDULE_INTERVAL);
    } catch (error) {
        logger.error(`[stake_pool] Error in startStakePoolScheduler:`, error);
    }
};
