import { REDIS_KEYS, redisCommands, redisHelper } from '../io/redis';
import BotConfig, { IBotBehavior } from '../models/botBehavior';
import { performBuySubscription } from '../services/botActionHandler';
import { formatDurationMs, getRandomInRange } from '../utils/common';
import logger from '../utils/logger';

const activeTimeouts: Map<string, Timer> = new Map();

let isRunning = false;
const isProduction = process.env.NODE_ENV === 'production';
const RANDOM_TIMEOUT_BUY_SUBSCRIPTION = isProduction ? 24 * 60 * 60 * 1000 : 1 * 60 * 1000;

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

// Function to reset the daily check-in schedule
const resetDailySchedule = async () => {
    try {
        const todayDateStr = new Date().toISOString().split('T')[0];
        const lastReset = await redisHelper.get(REDIS_KEYS.LAST_RESET_BUY_SUB);

        if (lastReset === todayDateStr) {
            logger.info('[buy_subscription] Daily schedule already reset today. Skipping reset.');
            return;
        }

        logger.info('[buy_subscription] Resetting daily schedule for bots.');
        const botConfigs = await BotConfig.find({
            'behaviors.buySubscription.enabled': true,
            $expr: { $gt: [{ $toDouble: '$balance' }, 1.99] },
        });
        const botIds = botConfigs.map((botConfig) => botConfig.telegramId);

        // Clear previous day's schedule and completed check-ins
        await redisHelper.del(REDIS_KEYS.SELECTED_BUY_SUB_SET);
        await redisHelper.del(REDIS_KEYS.COMPLETED_BUY_SUB_SET);
        for (const botId of botIds) {
            await redisHelper.del(REDIS_KEYS.BUY_SUB_SCHEDULE(botId));
        }

        await redisHelper.set(REDIS_KEYS.LAST_RESET_BUY_SUB, todayDateStr);

        const limitSetting = Number((await redisHelper.get(REDIS_KEYS.BUY_SUB_LIMIT_SETTING)) || '400');

        let buySubLimit = Math.round(getRandomInRange(0.8, 1.2) * limitSetting);
        // Select limited bots to checkin
        let selectedBotConfigs = botConfigs;
        if (buySubLimit > 0 && buySubLimit <= botConfigs.length) {
            selectedBotConfigs = getRandomBots(botConfigs, buySubLimit);
        } else {
            buySubLimit = botConfigs.length;
        }
        await redisHelper.set(REDIS_KEYS.BUY_SUB_LIMIT, buySubLimit.toString());

        for (const botConfig of selectedBotConfigs) {
            await redisHelper.sadd(REDIS_KEYS.SELECTED_BUY_SUB_SET, botConfig.telegramId);
        }

        logger.info(`[buy_subscription] Reset daily schedule completed. Buy sub limit today: ${buySubLimit} (setting: ${limitSetting})`);
    } catch (error) {
        logger.error(`[buy_subscription] Error in resetDailySchedule:`, error);
    }
};

const executeBuySubscription = async (botConfig: IBotBehavior) => {
    try {
        await performBuySubscription(botConfig);
    } catch (error) {
        logger.error(`[buy_subscription] Error buying subscription bot with telegramId ${botConfig.telegramId}`, error);
    } finally {
        activeTimeouts.delete(`${botConfig.telegramId}`);

        const scheduleKey = REDIS_KEYS.BUY_SUB_SCHEDULE(botConfig.telegramId);
        await redisCommands.del(scheduleKey);

        await redisHelper.sadd(REDIS_KEYS.COMPLETED_BUY_SUB_SET, botConfig.telegramId);
    }
};

const buySubscription = async (botConfig: IBotBehavior) => {
    try {
        if (!botConfig.behaviors.buySubscription.noAds7d && !botConfig.behaviors.buySubscription.basic7d) {
            return;
        }

        const isCompleted = await redisHelper.sismember(REDIS_KEYS.COMPLETED_BUY_SUB_SET, botConfig.telegramId);
        if (isCompleted) {
            // logger.info(`[buy_subscription] Bot with telegramId: ${botConfig.telegramId} has already completed buy sub today. Skipping.`);
            return;
        }

        const scheduleKey = REDIS_KEYS.BUY_SUB_SCHEDULE(botConfig.telegramId);
        const scheduleTime = await redisCommands.get(scheduleKey);

        if (scheduleTime) {
            if (activeTimeouts.get(`${botConfig.telegramId}`)) {
                return;
            }

            const scheduledTimeout = Math.max(parseInt(scheduleTime) - new Date().getTime(), 1 * 1000);
            const timeoutID = setTimeout(async () => {
                executeBuySubscription(botConfig);
            }, scheduledTimeout);

            activeTimeouts.set(`${botConfig.telegramId}`, timeoutID);

            // logger.info(
            //     `[buy_subscription] Scheduling from Redis bot telegramId: ${botConfig.telegramId} in ${formatDurationMs(scheduledTimeout)} ....`,
            // );
            return;
        }

        // Not scheduled yet, calculate a new delay
        let scheduledTimeout;
        const now = new Date();
        const startTime = new Date(now.getTime());
        startTime.setHours(0, 5);
        const endTime = new Date(now.getTime());
        endTime.setHours(23, 55);

        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'local') {
            scheduledTimeout = Math.floor(Math.random() * 60 * 1000); // Random delay within the next minute for testing
        } else {
            // Production Mode: Schedule within the time window
            if (now < startTime) {
                const timeUntilStart = startTime.getTime() - now.getTime();
                const windowDuration = endTime.getTime() - startTime.getTime();
                scheduledTimeout = timeUntilStart + Math.floor(Math.random() * windowDuration);
            } else if (now >= startTime && now < endTime) {
                const remainingTime = endTime.getTime() - now.getTime();
                scheduledTimeout = Math.floor(Math.random() * remainingTime);
            } else {
                return;
            }
        }

        await redisCommands.set(scheduleKey, new Date().getTime() + scheduledTimeout);

        const timeoutID = setTimeout(async () => {
            executeBuySubscription(botConfig);
        }, scheduledTimeout);

        activeTimeouts.set(`${botConfig.telegramId}`, timeoutID);

        // logger.info(`[buy_subscription] Scheduling bot telegramId: ${botConfig.telegramId} in ${formatDurationMs(scheduledTimeout)} ....`);
    } catch (error) {
        logger.error(`[buy_subscription] Error scheduling buy subscription for bot telegramId ${botConfig.telegramId}`, error);
    }
};

// Main function to schedule all daily check-ins
export const scheduleAllBotActions = async () => {
    if (isRunning) {
        return;
    }

    logger.info('[buy_subscription] Started scheduleAllBotActions');
    isRunning = true;

    try {
        // Reset the daily schedule if needed
        await resetDailySchedule();

        const selectedBotIds: string[] = await redisCommands.smembers(REDIS_KEYS.SELECTED_BUY_SUB_SET);
        const selectedBotConfigs = await BotConfig.find({ telegramId: { $in: selectedBotIds } });

        // Schedule each bot's check-in independently
        for (const botConfig of selectedBotConfigs) {
            await buySubscription(botConfig);
        }

        logger.info('[buy_subscription] Finished scheduleAllBotActions');
    } catch (error) {
        logger.error(`[buy_subscription] Error in scheduleAllBotActions`, error);
    } finally {
        isRunning = false;
    }
};

export const startBuySubscriptionScheduler = async () => {
    try {
        await scheduleAllBotActions();
        setInterval(scheduleAllBotActions, 60 * 60 * 1000); // 1 hours
    } catch (error) {
        logger.error(`[buy_subscription] Error in startBuySubscriptionScheduler:`, error);
    }
};
