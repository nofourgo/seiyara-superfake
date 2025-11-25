import mongoose from 'mongoose';
import { REDIS_KEYS, redisCommands } from '../io/redis';
import BotConfig, { IBotBehavior } from '../models/botBehavior';
import { performUpgradeHQ } from '../services/botActionHandler';
import { formatDurationMs } from '../utils/common';
import user, { IUser } from '../models/user';
import logger from '../utils/logger';

const activeTimeouts: Map<string, Timer> = new Map();

let isRunning = false;
const isProduction = process.env.NODE_ENV === 'production';
const RANDOM_TIMEOUT_UPGRADE_HQ = isProduction ? 60 * 60 * 1000 : 1 * 60 * 1000;

const executeUpgradeHQ = async (botConfig: IBotBehavior) => {
    try {
        await performUpgradeHQ(botConfig);
    } catch (error) {
        logger.error(`[upgrade_hq] Error upgrading HQ bot with telegramId ${botConfig.telegramId}`, error);
    } finally {
        activeTimeouts.delete(`${botConfig.telegramId}`);
    }
};

const upgradeHQ = async (botConfig: IBotBehavior) => {
    try {
        const botUser: IUser | null = await user.findOne({ telegramId: botConfig.telegramId }).exec();
        if (!botUser) {
            throw new Error(`Bot user not found ${botConfig.telegramId}`);
        }

        if (botUser.headquarter.level >= botConfig.behaviors.upgradeHQ.maxLevel) {
            return;
        }

        const scheduleKey = REDIS_KEYS.UPGRADE_HQ_SCHEDULE(botConfig.telegramId);
        const scheduleTime = await redisCommands.get(scheduleKey);

        if (scheduleTime) {
            if (activeTimeouts.get(`${botConfig.telegramId}`)) {
                // logger.info(`[upgrade_hq] Already scheduled to upgrade HQ for bot telegramId:${botConfig.telegramId}. Just keep waiting`);
                return;
            }

            const scheduledTimeout = Math.max(parseInt(scheduleTime) - new Date().getTime(), 1 * 1000);
            const timeoutID = setTimeout(async () => {
                executeUpgradeHQ(botConfig);
            }, scheduledTimeout);

            activeTimeouts.set(`${botConfig.telegramId}`, timeoutID);

            // logger.info(`[upgrade_hq] Scheduling from Redis bot telegramId: ${botConfig.telegramId} in ${formatDurationMs(scheduledTimeout)} ....`);
            return;
        }

        const scheduledTimeout = Math.round(Math.random() * RANDOM_TIMEOUT_UPGRADE_HQ);
        await redisCommands.set(scheduleKey, new Date().getTime() + scheduledTimeout);

        const timeoutID = setTimeout(async () => {
            executeUpgradeHQ(botConfig);
        }, scheduledTimeout);

        activeTimeouts.set(`${botConfig.telegramId}`, timeoutID);

        // logger.info(`[upgrade_hq] Scheduling bot telegramId: ${botConfig.telegramId} in ${formatDurationMs(scheduledTimeout)} ....`);
    } catch (error) {
        logger.error(`[upgrade_hq] Error scheduling upgrade HQ for bot telegramId ${botConfig.telegramId}`, error);
    }
};

// Main function to schedule all daily check-ins
export const scheduleAllBotActions = async () => {
    if (isRunning) {
        return;
    }
    isRunning = true;

    try {
        logger.info(`[upgrade_hq] Start scheduleAllBotActions`);
        // Fetch all bots that need to check in
        const botConfigs: IBotBehavior[] = await BotConfig.find({ 'behaviors.upgradeHQ.enabled': true });

        // Schedule each bot's check-in independently
        for (const botConfig of botConfigs) {
            await upgradeHQ(botConfig);
        }
        logger.info(`[upgrade_hq] Finished scheduleAllBotActions`);
    } catch (error) {
        logger.error(`[upgrade_hq] Error in scheduleAllBotActions`, error);
    } finally {
        isRunning = false;
    }
};

export const startUpgradeHqScheduler = async () => {
    try {
        await scheduleAllBotActions();
        setInterval(scheduleAllBotActions, 10 * 60 * 1000); // 1 hour
    } catch (error) {
        logger.error(`[upgrade_hq] Error in startUpgradeHqScheduler:`, error);
    }
};
