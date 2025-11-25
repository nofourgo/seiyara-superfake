import { redisHelper, REDIS_KEYS, redisCommands } from '../io/redis';
import BotConfig, { IBotBehavior } from '../models/botBehavior';
import userAchievement, { IUserAchievement } from '../models/userAchievement';
import { performClaimSeiAchieve } from '../services/botActionHandler';
import { getRandomInRange } from '../utils/common';
import logger from '../utils/logger';

let isRunning = false;

// Map to track active timeouts for each bot
const activeTimeouts: Map<string, Timer> = new Map();

const isClaimed = async (botConfig: IBotBehavior): Promise<boolean> => {
    const botAchievements: IUserAchievement[] = await userAchievement.find({
        userId: botConfig.telegramId,
        'tasks.0.type': { $in: ['login_10d', 'checkin_onchain_10d'] },
        rewardClaimed: false,
    });
    if (botAchievements.length == 2) {
        return true;
    }
    return false;
};

// Function to reset the daily check-in schedule
const resetDailySchedule = async () => {
    try {
        const todayDateStr = new Date().toISOString().split('T')[0];
        const isFirstInit = await redisHelper.set(REDIS_KEYS.CLAIM_SEI_ACHI_INIT(todayDateStr), 'init', { nx: true, ex: 24 * 60 * 60 });
        if (!isFirstInit) {
            return;
        }

        logger.info(`[claim_sei_achieve] Init schedule for bots for new day ${todayDateStr}`);
        const botConfigs: IBotBehavior[] = await BotConfig.find({});

        // Clear bot scheduled time
        for (const botConfig of botConfigs) {
            await redisHelper.del(REDIS_KEYS.CHECKIN_SCHEDULE(botConfig.telegramId));
        }

        const settingLimit = Number((await redisHelper.get(REDIS_KEYS.CLAIM_SEI_ACHI_LIMIT_SETTING)) || '8000');
        let limit = Math.round(getRandomInRange(0.85, 1.15) * settingLimit);

        // Select limited bots to checkin
        let count = 0;
        let selectedBotConfigs: IBotBehavior[] = [];
        // sort by balance
        const sortedBotConfigs = botConfigs.sort((a, b) => parseFloat(a.balance) - parseFloat(b.balance));
        for (let i = 0; i < sortedBotConfigs.length; i++) {
            const botConfig: IBotBehavior = sortedBotConfigs[i];
            if (await isClaimed(botConfig)) {
                continue;
            }
            selectedBotConfigs.push(botConfig);
            await redisCommands.sadd(REDIS_KEYS.CLAIM_SEI_ACHI_SELECTED(todayDateStr), botConfig.telegramId);
            count++;
            if (count == limit) {
                break;
            }
        }
        logger.info(
            `[claim_sei_achieve] Init daily schedule completed ${todayDateStr}. Claim sei achievement limit today: ${limit} (limit setting: ${settingLimit})`,
        );
    } catch (error) {
        logger.error(`[claim_sei_achieve] Error in resetDailySchedule:`, error);
    }
};

// Function to execute daily check-in for a bot
const executeClaimSeiAchieve = async (botConfig: IBotBehavior) => {
    const todayDateStr = new Date().toISOString().split('T')[0];
    try {
        // Perform the daily check-in action
        await performClaimSeiAchieve(botConfig);

        // logger.info(`[claim_sei_achieve] Claim completed for bot with telegramId: ${botConfig.telegramId}`);
    } catch (error) {
        logger.error(`[claim_sei_achieve] Error executing claim sei reward for bot with telegramId ${botConfig.telegramId}`, error);
    } finally {
        await redisHelper.sadd(REDIS_KEYS.CLAIM_SEI_ACHI_COMPLETED(todayDateStr), botConfig.telegramId);
        activeTimeouts.delete(botConfig.telegramId);
    }
};

// Function to schedule daily check-in for a single bot
const scheduleBotAction = async (botConfig: any) => {
    const redisLockKey = `lock:${REDIS_KEYS.CLAIM_SEI_ACHI_SCHEDULE(botConfig.telegramId)}`;
    const redisScheduledKey = REDIS_KEYS.CLAIM_SEI_ACHI_SCHEDULE(botConfig.telegramId);
    const todayDateStr = new Date().toISOString().split('T')[0];

    try {
        // Check if the bot has already completed for the day
        const isCompleted = await redisHelper.sismember(REDIS_KEYS.CLAIM_SEI_ACHI_COMPLETED(todayDateStr), botConfig.telegramId);
        if (isCompleted) {
            return;
        }

        // Try to acquire a lock for this bot
        const lockResult = await redisHelper.set(redisLockKey, 'locked', { nx: true, ex: 60 });
        if (!lockResult) {
            return;
        }

        // Check if the bot is already scheduled in Redis
        const scheduledTimestamp = await redisHelper.get(redisScheduledKey);
        if (scheduledTimestamp) {
            const now = Date.now();
            const randomDelay = Math.max(Number(scheduledTimestamp) - now, 0); // Ensure the delay is non-negative

            if (activeTimeouts.has(botConfig.telegramId)) {
                return;
            }

            // logger.info(
            //     `[claim_sei_achieve] Assigned schedule from Redis at ${new Date(new Date().getTime() + randomDelay)} for bot with telegramId: ${botConfig.telegramId}`,
            // );

            // Schedule the action again based on the saved timestamp in Redis
            const timeoutId = setTimeout(async () => {
                // logExecutedAction('daily check-in', botConfig.telegramId, '');
                await executeClaimSeiAchieve(botConfig);
                await redisHelper.del(redisLockKey); // Release the lock
            }, randomDelay);

            // Store the new timeout ID in the map
            activeTimeouts.set(botConfig.telegramId, timeoutId);
            return;
        }

        // Not scheduled yet, calculate a new delay
        let randomDelay;
        const now = new Date();
        const startTime = new Date(now.getTime());
        startTime.setHours(0, 5);
        const endTime = new Date(now.getTime());
        endTime.setHours(23, 55);

        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'local') {
            randomDelay = Math.floor(Math.random() * 60 * 1000); // Random delay within the next minute for testing
        } else {
            // Production Mode: Schedule within the time window
            if (now < startTime) {
                const timeUntilStart = startTime.getTime() - now.getTime();
                const windowDuration = endTime.getTime() - startTime.getTime();
                randomDelay = timeUntilStart + Math.floor(Math.random() * windowDuration);
            } else if (now >= startTime && now < endTime) {
                const remainingTime = endTime.getTime() - now.getTime();
                randomDelay = Math.floor(Math.random() * remainingTime);
            } else {
                await redisHelper.del(redisLockKey);
                return;
            }
        }

        // Save the scheduled timestamp in Redis
        const scheduledTime = Date.now() + randomDelay;
        await redisHelper.set(redisScheduledKey, scheduledTime.toString(), { ex: 24 * 60 * 60 });
        // logger.info(`[claim_sei_achieve] Assigned new schedule at ${new Date(scheduledTime)} for bot with telegramId: ${botConfig.telegramId}`);

        // Schedule the action
        const timeoutId = setTimeout(async () => {
            // logExecutedAction('daily check-in', botConfig.telegramId, '');
            await executeClaimSeiAchieve(botConfig);
            await redisHelper.del(redisLockKey); // Release the lock
        }, randomDelay);

        // Store the new timeout ID in the map
        activeTimeouts.set(botConfig.telegramId, timeoutId);
    } catch (error) {
        logger.error(`[claim_sei_achieve] Error in scheduleBotAction for telegramId ${botConfig.telegramId}:`, error);
        await redisHelper.del(redisLockKey); // Ensure the lock is released in case of an error
    }
};

// Main function to schedule all daily check-ins
export const scheduleAllBotActions = async () => {
    if (isRunning) {
        return;
    }
    isRunning = true;

    try {
        logger.info(`[claim_sei_achieve] Start scheduleAllBotActions`);
        // Reset the daily schedule if needed
        await resetDailySchedule();

        const todayDateStr = new Date().toISOString().split('T')[0];
        const selectedBotIds: string[] = await redisCommands.smembers(REDIS_KEYS.CLAIM_SEI_ACHI_SELECTED(todayDateStr));

        let selectedBotConfigs: IBotBehavior[] = await BotConfig.find({ telegramId: { $in: selectedBotIds } });

        for (const botConfig of selectedBotConfigs) {
            await scheduleBotAction(botConfig);
        }
        logger.info(`[claim_sei_achieve] Finished scheduleAllBotActions`);
    } catch (error) {
        logger.error(`[claim_sei_achieve] Error in scheduleAllBotActions`, error);
    } finally {
        isRunning = false;
    }
};

// Start the daily check-in scheduler and re-check periodically

export const startClaimSeiAchieScheduler = async () => {
    try {
        await scheduleAllBotActions();
        setInterval(scheduleAllBotActions, 5 * 60 * 1000);
    } catch (error) {
        logger.error(`Error in startClaimSeiAchieScheduler:`, error);
    }
};
