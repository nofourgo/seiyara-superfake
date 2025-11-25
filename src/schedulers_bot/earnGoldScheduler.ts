import { redisHelper, REDIS_KEYS, redisCommands } from '../io/redis';
import BotConfig, { IBotBehavior } from '../models/botBehavior';
import { EARN_GOLD_RANDOM_TIMEOUT, performEarnGold } from '../services/botActionHandler';
import { formatDurationMs, getTodayTimeEnd } from '../utils/common';
import logger from '../utils/logger';

const activeTimeouts: Map<string, Timer> = new Map();

let isRunning = false;

const executeEarnGold = async (botConfig: IBotBehavior) => {
    // acquire lock to schedule
    const now = new Date();
    const todayDateStr = now.toISOString().split('T')[0];
    const lockKey = `lock:${REDIS_KEYS.EARN_GOLD_SCHEDULE(botConfig.telegramId, todayDateStr)}`;
    const acquireLock = await redisHelper.set(lockKey, 'busy', { nx: true, ex: 30 }); // 10s
    if (!acquireLock) {
        return;
    }

    try {
        // Perform the daily check-in action
        const { nextSchedule } = await performEarnGold(botConfig);
        if (!nextSchedule) {
            activeTimeouts.delete(botConfig.telegramId);
            await redisCommands.del(REDIS_KEYS.EARN_GOLD_SCHEDULE(botConfig.telegramId, todayDateStr));
            return;
        }

        // Schedule next timeout
        await redisCommands.set(REDIS_KEYS.EARN_GOLD_SCHEDULE(botConfig.telegramId, todayDateStr), nextSchedule);
        const scheduledTimeout = Math.max(nextSchedule - new Date().getTime(), 1000);
        const timeoutId = setTimeout(() => {
            executeEarnGold(botConfig);
        }, scheduledTimeout);
        activeTimeouts.set(botConfig.telegramId, timeoutId);
        // logger.info(`[earn_gold] Scheduling for bot with telegramId: ${botConfig.telegramId}, ${JSON.stringify(botConfig.behaviors.earnGold)} in ${formatDurationMs(scheduledTimeout)} ...`);
    } catch (error) {
        activeTimeouts.delete(botConfig.telegramId);
        logger.error(`[earn_gold] Error perform with telegramId ${botConfig.telegramId}`, error);
    } finally {
        await redisHelper.del(lockKey);
    }
};

const scheduleEarnGold = async (botConfig: IBotBehavior) => {
    if (!botConfig.telegramId) {
        logger.error(`[earn_gold] bot telegramId not found: ${botConfig}`);
        return;
    }

    // acquire lock to schedule
    const now = new Date();
    const todayDateStr = now.toISOString().split('T')[0];
    const lockKey = `lock:${REDIS_KEYS.EARN_GOLD_SCHEDULE(botConfig.telegramId, todayDateStr)}`;
    const acquireLock = await redisHelper.set(lockKey, 'busy', { nx: true, ex: 10 }); // 10s
    if (!acquireLock) {
        return;
    }

    try {
        // If already scheduled in redis, ensure it will be triggered
        const scheduledTimeStr = await redisCommands.get(REDIS_KEYS.EARN_GOLD_SCHEDULE(botConfig.telegramId, todayDateStr));
        if (scheduledTimeStr) {
            // logger.info(`[earn_gold] Already assigned schedule in Redis for bot ${botConfig.telegramId} ...`);
            const scheduleTimestamp = parseInt(scheduledTimeStr);

            // Add to timeout map if not yet
            if (!activeTimeouts.has(botConfig.telegramId)) {
                const scheduledTimeout = scheduleTimestamp - new Date().getTime();
                const timeoutId = setTimeout(() => {
                    executeEarnGold(botConfig);
                }, scheduledTimeout);
                activeTimeouts.set(botConfig.telegramId, timeoutId);
                // logger.info(
                //     `[earn_gold] Scheduling from Redis for bot with telegramId: ${botConfig.telegramId}, ${JSON.stringify(botConfig.behaviors.earnGold)} in ${formatDurationMs(scheduledTimeout)} ...`,
                // );
            }
            return;
        }

        let scheduledTimeout = 0;

        // Check if gold target is done today
        if (botConfig.behaviors.earnGold.speed > 0) {
            scheduledTimeout = Math.round(Math.random() * 10 * 1000); // start in next 10 seconds
        } else if (botConfig.behaviors.earnGold.target > 0) {
            const targetGold = botConfig.behaviors.earnGold.target;
            const earnedGoldStr = (await redisCommands.get(REDIS_KEYS.EARN_GOLD_EXECUTED(botConfig.telegramId, todayDateStr))) || '0';
            const earnedGold = parseInt(earnedGoldStr);
            if (earnedGold >= targetGold) {
                // logger.info(`[earn_gold] Skipping scheduler. Earned enough gold ${earnedGold}/${targetGold} today for bot ${botConfig.telegramId}`);
                return;
            }

            // Schedule
            const todayEnd = getTodayTimeEnd(now);
            const timeUntilTodayEnd = todayEnd.getTime() - new Date().getTime();

            let scheduledTimeout = 0;
            if (timeUntilTodayEnd < EARN_GOLD_RANDOM_TIMEOUT) {
                scheduledTimeout = 0; // trigger now
            } else {
                scheduledTimeout = Math.round(Math.random() * EARN_GOLD_RANDOM_TIMEOUT);
            }
            scheduledTimeout = Math.max(scheduledTimeout, 1000); // to ensure triggered after unlock lock key
        } else {
            return;
        }

        await redisCommands.set(REDIS_KEYS.EARN_GOLD_SCHEDULE(botConfig.telegramId, todayDateStr), new Date().getTime() + scheduledTimeout);

        if (activeTimeouts.has(botConfig.telegramId)) {
            // logger.info(`[earn_gold] Clearing existing timeout for bot with telegramId: ${botConfig.telegramId}!`);
            clearTimeout(activeTimeouts.get(botConfig.telegramId)!);
            activeTimeouts.delete(botConfig.telegramId);
        }
        const timeoutId = setTimeout(() => {
            executeEarnGold(botConfig);
        }, scheduledTimeout);
        activeTimeouts.set(botConfig.telegramId, timeoutId);

        // logger.info(
        //     `[earn_gold] Scheduling by target: bot telegramId: ${botConfig.telegramId}, ${JSON.stringify(botConfig.behaviors.earnGold)} in ${formatDurationMs(scheduledTimeout)} ....`,
        // );
    } catch (error) {
        logger.error(`[earn_gold] Error when scheduling earn gold for bot ${botConfig.telegramId}: `, error);
    } finally {
        // release lock
        await redisHelper.del(lockKey);
    }
};

// Main function to schedule all daily check-ins
export const scheduleAllBotActions = async () => {
    if (isRunning) {
        return;
    }
    isRunning = true;

    try {
        // Fetch all bots that need to check in
        const botConfigs: IBotBehavior[] = await BotConfig.find({ 'behaviors.earnGold.enabled': true });

        logger.info(`[earn_gold] Started scheduleAllBotActions for ${botConfigs.length} bots`);

        // Schedule each bot's check-in independently
        for (const botConfig of botConfigs) {
            await scheduleEarnGold(botConfig);
        }
    } catch (error) {
        logger.error(`[earn_gold] Error in scheduleAllBotActions`, error);
    } finally {
        isRunning = false;
    }
};

export const startEarnGoldScheduler = async () => {
    try {
        await scheduleAllBotActions();
        setInterval(scheduleAllBotActions, 1 * 60 * 1000);
    } catch (error) {
        logger.error(`Error in startEarnGoldScheduler:`, error);
    }
};
