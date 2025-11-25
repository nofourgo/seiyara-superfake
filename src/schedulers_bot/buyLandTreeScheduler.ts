import { REDIS_KEYS, redisCommands } from '../io/redis';
import BotConfig, { IBotBehavior } from '../models/botBehavior';
import UserLand, { IUserLand } from '../models/userLand';
import { performBuyLand, performBuyTree } from '../services/botActionHandler';
import { addDefaultUserLands } from '../services/landService';
import { formatDurationMs } from '../utils/common';
import logger from '../utils/logger';

const activeTimeouts: Map<string, Timer> = new Map();

let isRunning = false;
const isProduction = process.env.NODE_ENV === 'production';
const RANDOM_TIMEOUT_BUY_LAND = isProduction ? 3 * 60 * 1000 : 1 * 60 * 1000; // 3 min
const RANDOM_TIMEOUT_BUY_TREE = isProduction ? 3 * 60 * 1000 : 1 * 60 * 1000; // + 3 min after buy land

const executeBuyLand = async (botConfig: IBotBehavior, slot: number) => {
    try {
        // Perform the daily check-in action
        await performBuyLand(botConfig, slot);

        // Remove the bot from active timeouts
        activeTimeouts.delete(`land:${botConfig.telegramId}:${slot}`);
    } catch (error) {
        logger.error(`[buy_land] Error buying land bot with telegramId ${botConfig.telegramId}`, error);
    }
};

const executeBuyTree = async (botConfig: IBotBehavior, slot: number) => {
    try {
        // Perform the daily check-in action
        await performBuyTree(botConfig, slot);

        // Remove the bot from active timeouts
        activeTimeouts.delete(`tree:${botConfig.telegramId}:${slot}`);
    } catch (error) {
        logger.error(`[buy_land] Error buying tree with telegramId ${botConfig.telegramId}`, error);
    }
};

const buyTreeAndLand = async (botConfig: IBotBehavior) => {
    const buyLandConfig = botConfig.behaviors.buyLand;
    if (!buyLandConfig.enabled) {
        return;
    }

    // check current bot lands, add default lands if needed
    const botLands: IUserLand[] = await UserLand.find({ userId: botConfig.telegramId }).sort({ slot: 1 });
    if (botLands.length == 0) {
        // logger.info(`[buy_land] Add default lands 1->3 bot telegamId:${botConfig.telegramId}`);
        await addDefaultUserLands(null, botConfig.telegramId);
    }

    // verify
    const currentLandSlot = botLands.length > 0 ? botLands.length : 3;
    if (currentLandSlot >= buyLandConfig.maxLand) {
        // logger.info(`[buy_land] This bot telegramId:${botConfig.telegramId} has ${currentLandSlot} lands > buy config: ${buyLandConfig.maxLand} lands. Skip.`);
        return;
    }
    // still retry the current slot to buy tree if last time failed
    // logger.info(`[buy_land] Start to buy land/tree from ${currentLandSlot}(current) -> ${buyLandConfig.maxLand} for bot telegamId:${botConfig.telegramId}`);

    let lastLandTimeout = 0;
    for (let slot = currentLandSlot; slot <= buyLandConfig.maxLand; slot++) {
        if (slot <= 3) {
            continue;
        }

        let buyLandRandomTimeout = 0;

        if (slot > currentLandSlot) {
            if (activeTimeouts.get(`land:${botConfig.telegramId}:${slot}`)) {
                // logger.info(`[buy_land] Already scheduled to buy land ${slot} for bot telegramId:${botConfig.telegramId}. Just keep waiting`);
                continue;
            }

            buyLandRandomTimeout = lastLandTimeout + Math.round(Math.random() * RANDOM_TIMEOUT_BUY_LAND);

            // logger.info(`[buy_land] Schedule to buy land ${slot} for bot telegramId:${botConfig.telegramId} in ${formatDurationMs(buyLandRandomTimeout)}`);

            const timeoutID = setTimeout(async () => {
                executeBuyLand(botConfig, slot);
            }, buyLandRandomTimeout);

            activeTimeouts.set(`land:${botConfig.telegramId}:${slot}`, timeoutID);
            redisCommands.set(REDIS_KEYS.BUY_LAND_SCHEDULE(botConfig.telegramId, slot), new Date().getTime() + buyLandRandomTimeout);

            lastLandTimeout = buyLandRandomTimeout;
        }

        if (slot >= 7) {
            if (activeTimeouts.get(`tree:${botConfig.telegramId}:${slot}`)) {
                // logger.info(`[buy_land] Already scheduled to buy tree ${slot} for bot telegramId:${botConfig.telegramId}. Just keep waiting`);
                continue;
            }

            const buyTreeRandomTimeout = buyLandRandomTimeout + Math.round(Math.random() * RANDOM_TIMEOUT_BUY_TREE); // after buy land

            // logger.info(`[buy_land] Schedule to buy tree of land ${slot} for bot telegramId:${botConfig.telegramId} in ${formatDurationMs(buyTreeRandomTimeout)}`);

            const timeoutID = setTimeout(async () => {
                executeBuyTree(botConfig, slot);
            }, buyTreeRandomTimeout);

            activeTimeouts.set(`tree:${botConfig.telegramId}:${slot}`, timeoutID);
            redisCommands.set(REDIS_KEYS.BUY_TREE_SCHEDULE(botConfig.telegramId, slot), new Date().getTime() + buyTreeRandomTimeout);
        }
    }
};

// Main function to schedule all daily check-ins
export const scheduleAllBotActions = async () => {
    if (isRunning) {
        return;
    }
    isRunning = true;

    try {
        logger.info(`[buy_land] Start scheduleAllBotActions`);
        // Fetch all bots that need to check in
        const botConfigs: IBotBehavior[] = await BotConfig.find({ 'behaviors.buyLand.enabled': true });

        // Schedule each bot's check-in independently
        for (const botConfig of botConfigs) {
            await buyTreeAndLand(botConfig);
        }
        logger.info(`[buy_land] Finished scheduleAllBotActions`);
    } catch (error) {
        logger.error(`[buy_land] Error in scheduleAllBotActions`, error);
    } finally {
        isRunning = false;
    }
};

// Start the daily check-in scheduler and re-check periodically

export const startBuyLandTreeScheduler = async () => {
    try {
        await scheduleAllBotActions();
        setInterval(scheduleAllBotActions, 10 * 60 * 1000);
    } catch (error) {
        logger.error(`[buy_land] Error in startBuyLandTreeScheduler:`, error);
    }
};
