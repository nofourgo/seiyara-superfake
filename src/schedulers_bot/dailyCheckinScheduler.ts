import { redisHelper, REDIS_KEYS, redisCommands } from '../io/redis';
import BotConfig, { IBotBehavior } from '../models/botBehavior';
import { performDailyCheckin } from '../services/botActionHandler';
import { getRandomInRange } from '../utils/common';
import logger from '../utils/logger';

let isRunning = false;

// Map to track active timeouts for each bot
const activeTimeouts: Map<string, Timer> = new Map();

// Function to reset the daily check-in schedule
const resetDailySchedule = async () => {
    try {
        const todayDateStr = new Date().toISOString().split('T')[0];
        const lastReset = await redisHelper.get(REDIS_KEYS.LAST_RESET_CHECKIN);

        if (lastReset === todayDateStr) {
            logger.info('[daily_checkin] Daily schedule already reset today. Skipping reset.');
            return;
        }

        logger.info('[daily_checkin] Resetting daily schedule for bots.');
        const botConfigs = await BotConfig.find({ 'behaviors.dailyCheckin': true, $expr: { $gt: [{ $toDouble: '$balance' }, 0.0001] } });
        const botIds = botConfigs.map((botConfig) => botConfig.telegramId);

        // Clear previous day's schedule and completed check-ins
        await redisHelper.del(REDIS_KEYS.SELECTED_CHECKIN_SET);
        await redisHelper.del(REDIS_KEYS.COMPLETED_CHECKIN_SET);
        for (const botId of botIds) {
            await redisHelper.del(REDIS_KEYS.CHECKIN_SCHEDULE(botId));
        }

        await redisHelper.set(REDIS_KEYS.LAST_RESET_CHECKIN, todayDateStr);

        const minCheckin = Number((await redisHelper.get(REDIS_KEYS.MIN_CHECKIN)) || '0.8');
        const maxCheckin = Number((await redisHelper.get(REDIS_KEYS.MAX_CHECKIN)) || '0.9');

        let checkinLimit = Math.round(getRandomInRange(minCheckin, maxCheckin) * botConfigs.length);

        // Select limited bots to checkin
        let selectedBotConfigs = botConfigs;
        if (checkinLimit > 0) {
            selectedBotConfigs = getRandomBots(botConfigs, checkinLimit);
        } else {
            checkinLimit = botConfigs.length;
        }
        await redisHelper.set(REDIS_KEYS.CHECKIN_LIMIT, checkinLimit.toString());

        for (const botConfig of selectedBotConfigs) {
            await redisHelper.sadd(REDIS_KEYS.SELECTED_CHECKIN_SET, botConfig.telegramId);
        }

        logger.info(
            `[daily_checkin] Reset daily schedule completed. Checkin limit today: ${checkinLimit} (range setting rate: ${minCheckin}-${maxCheckin})`,
        );
    } catch (error) {
        logger.error(`[daily_checkin] Error in resetDailySchedule:`, error);
    }
};

// Function to execute daily check-in for a bot
const executeDailyCheckin = async (botConfig: any) => {
    try {
        // Perform the daily check-in action
        await performDailyCheckin(botConfig);

        // Mark bot as completed for today by adding to the completed set
        await redisHelper.sadd(REDIS_KEYS.COMPLETED_CHECKIN_SET, botConfig.telegramId);

        // logger.info(`[daily_checkin] Daily check-in completed for bot with telegramId: ${botConfig.telegramId}`);
    } catch (error) {
        logger.error(`[daily_checkin] Error executing daily check-in for bot with telegramId ${botConfig.telegramId}`, error);
    } finally {
        // Remove the bot from active timeouts
        activeTimeouts.delete(botConfig.telegramId);
    }
};

// Function to schedule daily check-in for a single bot
const scheduleBotAction = async (botConfig: any) => {
    const redisLockKey = `lock:${REDIS_KEYS.CHECKIN_SCHEDULE(botConfig.telegramId)}`;
    const redisScheduledKey = REDIS_KEYS.CHECKIN_SCHEDULE(botConfig.telegramId);

    try {
        // Check if the bot has already completed check-in for the day
        const isCompleted = await redisHelper.sismember(REDIS_KEYS.COMPLETED_CHECKIN_SET, botConfig.telegramId);
        if (isCompleted) {
            // logger.info(`[daily_checkin] Bot with telegramId: ${botConfig.telegramId} has already completed check-in today. Skipping.`);
            return;
        }

        // Try to acquire a lock for this bot
        const lockResult = await redisHelper.set(redisLockKey, 'locked', { nx: true, ex: 60 });
        if (!lockResult) {
            // logger.info(`[daily_checkin] Lock already acquired for bot with telegramId: ${botConfig.telegramId}. Skipping.`);
            return;
        }

        // Check if the bot is already scheduled in Redis
        const scheduledTimestamp = await redisHelper.get(redisScheduledKey);
        if (scheduledTimestamp) {
            const now = Date.now();
            const randomDelay = Math.max(Number(scheduledTimestamp) - now, 0); // Ensure the delay is non-negative
            // logScheduledAction('daily check-in', botConfig.telegramId, randomDelay, '');

            // If there is already a timeout for this bot, clear it first
            if (activeTimeouts.has(botConfig.telegramId)) {
                // logger.info(`[daily_checkin] Already scheduling timeout for bot with telegramId: ${botConfig.telegramId}`);
                return;
            }

            // logger.info(
            //     `[daily_checkin] Assigned schedule at ${new Date(new Date().getTime() + randomDelay)} for bot with telegramId: ${botConfig.telegramId}`,
            // );

            // Schedule the action again based on the saved timestamp in Redis
            const timeoutId = setTimeout(async () => {
                // logExecutedAction('daily check-in', botConfig.telegramId, '');
                await executeDailyCheckin(botConfig);
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
        startTime.setHours(0, 15);
        const endTime = new Date(now.getTime());
        endTime.setHours(23, 45);

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
        // logger.info(`[daily_checkin] Assigned schedule at ${new Date(scheduledTime)} for bot with telegramId: ${botConfig.telegramId}`);

        // logScheduledAction('daily check-in', botConfig.telegramId, randomDelay, '');

        // Schedule the action
        const timeoutId = setTimeout(async () => {
            // logExecutedAction('daily check-in', botConfig.telegramId, '');
            await executeDailyCheckin(botConfig);
            await redisHelper.del(redisLockKey); // Release the lock
        }, randomDelay);

        // Store the new timeout ID in the map
        activeTimeouts.set(botConfig.telegramId, timeoutId);
    } catch (error) {
        logger.error(`Error in scheduleBotAction for telegramId ${botConfig.telegramId}:`, error);
        await redisHelper.del(redisLockKey); // Ensure the lock is released in case of an error
    }
};

const getRandomBots = (array: IBotBehavior[], n: number) => {
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

// Main function to schedule all daily check-ins
export const scheduleAllBotActions = async () => {
    if (isRunning) {
        return;
    }
    isRunning = true;

    try {
        logger.info(`[daily_checkin] Start scheduleAllBotActions`);
        // Reset the daily schedule if needed
        await resetDailySchedule();

        const selectedBotIds: string[] = await redisCommands.smembers(REDIS_KEYS.SELECTED_CHECKIN_SET);
        let selectedBotConfigs: IBotBehavior[];
        if (selectedBotIds.length > 0) {
            selectedBotConfigs = await BotConfig.find({ telegramId: { $in: selectedBotIds } });
        } else {
            selectedBotConfigs = await BotConfig.find({ 'behaviors.dailyCheckin': true }); // backward
        }

        // Schedule each bot's check-in independently
        for (const botConfig of selectedBotConfigs) {
            await scheduleBotAction(botConfig);
        }
        logger.info(`[daily_checkin] Finished scheduleAllBotActions`);
    } catch (error) {
        logger.error(`[daily_checkin] Error in scheduleAllBotActions`, error);
    } finally {
        isRunning = false;
    }
};

// Start the daily check-in scheduler and re-check periodically

export const startDailyCheckinScheduler = async () => {
    try {
        await scheduleAllBotActions();
        setInterval(scheduleAllBotActions, 5 * 60 * 1000);
    } catch (error) {
        logger.error(`Error in startDailyCheckinScheduler:`, error);
    }
};
