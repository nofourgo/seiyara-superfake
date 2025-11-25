import mongoose from 'mongoose';
import { REDIS_KEYS, redisCommands, redisHelper } from '../io/redis';
import BotConfig, { IBotBehavior } from '../models/botBehavior';
import { performUpgradeHQ } from '../services/botActionHandler';
import { formatDurationMs } from '../utils/common';
import user, { IUser } from '../models/user';
import logger from '../utils/logger';
import { claimUserBadge, getUserBadges } from '../services/badgeService';
import { IUserBadge } from '../models/userBadge';

const BOT_CLAIM_COUNT = 'bot_claim_badge_count';
const BOT_CLAIM_COMPLETED = (telegramId: string) => `bot:${telegramId}:claim_badge_success`;

const activeTimeouts: Map<string, Timer> = new Map();

let isRunning = false;

const executeClaimBadge = async (botConfig: IBotBehavior) => {
    try {
        const userBadges: IUserBadge[] = await getUserBadges(botConfig.telegramId);
        if (userBadges.length == 0) {
            throw new Error('No bot user badges found');
        }
        await claimUserBadge(botConfig.telegramId, userBadges[0]._id);

        logger.info(`[claim_badge] Completed claim badge bot with telegramId ${botConfig.telegramId}`);
        await redisCommands.incr(BOT_CLAIM_COUNT);
        await redisHelper.set(BOT_CLAIM_COMPLETED(botConfig.telegramId), 'done', { ex: 86400, nx: true});
    } catch (error) {
        logger.error(`[claim_badge] Error claim badge bot with telegramId ${botConfig.telegramId}`, error);
    } finally {
        activeTimeouts.delete(`${botConfig.telegramId}`);
    }
};

const scheduleClaimBadge = async (botConfig: IBotBehavior) => {
    try {
        const botUser: IUser | null = await user.findOne({ telegramId: botConfig.telegramId }).exec();
        if (!botUser) {
            throw new Error(`Bot user not found ${botConfig.telegramId}`);
        }

        const isCompleted = await redisHelper.get(BOT_CLAIM_COMPLETED(botConfig.telegramId));
        if (isCompleted) {
            return;
        }

        const scheduleKey = REDIS_KEYS.CLAIM_BADGEE_SCHEDULE(botConfig.telegramId);
        const scheduleTime = await redisCommands.get(scheduleKey);

        if (scheduleTime) {
            if (activeTimeouts.get(`${botConfig.telegramId}`)) {
                logger.info(`[claim_badge] Already scheduled to claim badge for bot telegramId:${botConfig.telegramId}. Just keep waiting`);
                return;
            }

            const scheduledTimeout = Math.max(parseInt(scheduleTime) - new Date().getTime(), 1 * 1000);
            const timeoutID = setTimeout(async () => {
                executeClaimBadge(botConfig);
            }, scheduledTimeout);

            activeTimeouts.set(`${botConfig.telegramId}`, timeoutID);

            logger.info(`[claim_badge] Scheduling from Redis bot telegramId: ${botConfig.telegramId} in ${formatDurationMs(scheduledTimeout)} ....`);
            return;
        }

        // 2024-11-03 23:45:00
        const endTime = new Date(Date.UTC(2024, 10, 3, 23, 45, 0)); // November is month 10 in 0-indexed Date.UTC()

        const scheduledTimeout = Math.round(Math.random() * (endTime.getTime() - new Date().getTime()));
        await redisCommands.set(scheduleKey, new Date().getTime() + scheduledTimeout);

        const timeoutID = setTimeout(async () => {
            executeClaimBadge(botConfig);
        }, scheduledTimeout);

        activeTimeouts.set(`${botConfig.telegramId}`, timeoutID);

        logger.info(`[claim_badge] Scheduling bot telegramId: ${botConfig.telegramId} in ${formatDurationMs(scheduledTimeout)} ....`);
    } catch (error) {
        logger.error(`[claim_badge] Error scheduling claim badge for bot telegramId ${botConfig.telegramId}`, error);
    }
};

// Main function to schedule all daily check-ins
export const scheduleAllBotActions = async () => {
    if (isRunning) {
        return;
    }
    const endTime = new Date(Date.UTC(2024, 10, 3, 23, 45, 0)); // November is month 10 in 0-indexed Date.UTC()
    if (new Date() > endTime) {
        return;
    }

    isRunning = true;

    try {
        // Fetch all bots that need to check in
        const botConfigs: IBotBehavior[] = await BotConfig.find();

        // Schedule each bot's check-in independently
        for (const botConfig of botConfigs) {
            await scheduleClaimBadge(botConfig);
        }
    } catch (error) {
        logger.error(`[claim_badge] Error in scheduleAllBotActions`, error);
    } finally {
        isRunning = false;
    }
};

export const startClaimBadgeScheduler = async () => {
    try {
        await scheduleAllBotActions();
        setInterval(scheduleAllBotActions, 60 * 60 * 1000); // 1h
    } catch (error) {
        logger.error(`[claim_badge] Error in startClaimBadgeScheduler:`, error);
    }
};
