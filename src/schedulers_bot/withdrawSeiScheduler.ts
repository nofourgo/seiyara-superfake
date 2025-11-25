import { REDIS_KEYS, redisCommands, redisHelper } from '../io/redis';
import BotConfig, { IBotBehavior } from '../models/botBehavior';
import { performWithdrawSei } from '../services/botActionHandler';
import { formatDurationMs, getRandomInRange } from '../utils/common';
import logger from '../utils/logger';

const activeTimeouts: Map<string, Timer> = new Map();

let isRunning = false;
const MIN_BOT = 400;
const MAX_BOT = 600;

// Function to reset the daily check-in schedule
const resetDailySchedule = async () => {
    try {
        const todayDateStr = new Date().toISOString().split('T')[0];
        const lastReset = await redisHelper.get(REDIS_KEYS.LAST_RESET_WITHDRAW_SEI);

        if (lastReset === todayDateStr) {
            logger.info('[withdraw_sei] Daily schedule already reset today. Skipping reset.');
            return;
        }

        logger.info('[withdraw_sei] Resetting daily schedule for bots.');
        const todayLimit = Math.round(getRandomInRange(MIN_BOT, MAX_BOT));

        const botConfigs = await BotConfig.find({ 'behaviors.buySubscription.enabled': true, withdrewSei: 0 })
            .sort({ withdrewSei: 1 })
            .limit(todayLimit);
        const botIds = botConfigs.map((botConfig) => botConfig.telegramId);

        // Clear previous day's schedule and completed check-ins
        await redisHelper.del(REDIS_KEYS.SELECTED_WITHDRAW_SEI_SET);
        await redisHelper.del(REDIS_KEYS.COMPLETED_WITHDRAW_SEI_SET);
        for (const botId of botIds) {
            await redisHelper.del(REDIS_KEYS.WITHDRAW_SEI_SCHEDULE(botId));
        }

        await redisHelper.set(REDIS_KEYS.LAST_RESET_WITHDRAW_SEI, todayDateStr);

        for (const botConfig of botConfigs) {
            await redisHelper.sadd(REDIS_KEYS.SELECTED_WITHDRAW_SEI_SET, botConfig.telegramId);
        }

        logger.info(`[withdraw_sei] Reset daily schedule completed. Withdraw SEI limit today: ${todayLimit}`);
    } catch (error) {
        logger.error(`[withdraw_sei] Error in resetDailySchedule:`, error);
    }
};

const executeWithdraw = async (botConfig: IBotBehavior) => {
    try {
        logger.info(`[withdraw_sei] Execute withdraw SEI for bot with telegramId ${botConfig.telegramId}`);
        await performWithdrawSei(botConfig);
    } catch (error) {
        logger.error(`[withdraw_sei] Error withdrawing SEI for bot with telegramId ${botConfig.telegramId}`, error);
    } finally {
        activeTimeouts.delete(`${botConfig.telegramId}`);

        const scheduleKey = REDIS_KEYS.WITHDRAW_SEI_SCHEDULE(botConfig.telegramId);
        await redisCommands.del(scheduleKey);

        await redisHelper.sadd(REDIS_KEYS.COMPLETED_WITHDRAW_SEI_SET, botConfig.telegramId);
    }
};

const withdrawSei = async (botConfig: IBotBehavior) => {
    try {
        if (botConfig.withdrewSei > 0) {
            return;
        }

        const isCompleted = await redisHelper.sismember(REDIS_KEYS.COMPLETED_WITHDRAW_SEI_SET, botConfig.telegramId);
        if (isCompleted) {
            return;
        }

        const scheduleKey = REDIS_KEYS.WITHDRAW_SEI_SCHEDULE(botConfig.telegramId);
        const scheduleTime = await redisCommands.get(scheduleKey);

        if (scheduleTime) {
            if (activeTimeouts.get(`${botConfig.telegramId}`)) {
                return;
            }

            const scheduledTimeout = Math.max(parseInt(scheduleTime) - new Date().getTime(), 1 * 1000);
            const timeoutID = setTimeout(async () => {
                executeWithdraw(botConfig);
            }, scheduledTimeout);

            activeTimeouts.set(`${botConfig.telegramId}`, timeoutID);

            // logger.info(
            //     `[withdraw_sei] Scheduling from Redis bot telegramId: ${botConfig.telegramId} in ${formatDurationMs(scheduledTimeout)} ....`,
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
            executeWithdraw(botConfig);
        }, scheduledTimeout);

        activeTimeouts.set(`${botConfig.telegramId}`, timeoutID);

        logger.info(`[withdraw_sei] Scheduling bot telegramId: ${botConfig.telegramId} in ${formatDurationMs(scheduledTimeout)} ....`);
    } catch (error) {
        logger.error(`[withdraw_sei] Error scheduling withdraw SEI for bot telegramId ${botConfig.telegramId}`, error);
    }
};

// Main function to schedule all daily check-ins
export const scheduleAllBotActions = async () => {
    if (isRunning) {
        return;
    }

    logger.info('[withdraw_sei] Started scheduleAllBotActions');
    isRunning = true;

    try {
        // Reset the daily schedule if needed
        await resetDailySchedule();

        const selectedBotIds: string[] = await redisCommands.smembers(REDIS_KEYS.SELECTED_WITHDRAW_SEI_SET);
        const selectedBotConfigs = await BotConfig.find({ telegramId: { $in: selectedBotIds } });

        // Schedule each bot's check-in independently
        for (const botConfig of selectedBotConfigs) {
            await withdrawSei(botConfig);
        }

        logger.info('[withdraw_sei] Finished scheduleAllBotActions');
    } catch (error) {
        logger.error(`[withdraw_sei] Error in scheduleAllBotActions`, error);
    } finally {
        isRunning = false;
    }
};

export const startWithdrawSeiScheduler = async () => {
    try {
        await scheduleAllBotActions();
        setInterval(scheduleAllBotActions, 60 * 60 * 1000); // 1 hours
    } catch (error) {
        logger.error(`[withdraw_sei] Error in startWithdrawSeiScheduler:`, error);
    }
};
