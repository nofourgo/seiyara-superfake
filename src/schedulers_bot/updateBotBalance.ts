import logger from '../utils/logger';
import { ethers } from 'ethers';
import BotConfig, { IBotBehavior } from '../models/botBehavior';
import { getBalance } from '../libs/seichain';

const RATE_LIMIT_PER_MINUTE = 2000;
const RATE_LIMIT_INTERVAL = (60 * 1000) / RATE_LIMIT_PER_MINUTE; // Throttle delay
let isRunning = false;

const updateBalance = async (bot: IBotBehavior) => {
    try {
        if (bot.lastRefreshed && new Date().getTime() - bot.lastRefreshed.getTime() < 50 * 60 * 1000) {
            return;
        }
        const balanceWei = await getBalance(bot.walletAddress);
        const balanceEth = ethers.utils.formatEther(balanceWei); // Convert to Ether

        bot.balance = balanceEth;
        bot.lastRefreshed = new Date();
        await bot.save();
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_INTERVAL));

        logger.info(`[update_balances] New updated balance bot ${bot.telegramId}: ${bot.balance}`);
    } catch (error) {
        logger.error(`[update_balances] Error fetching balance for ${bot.walletAddress}:`, error);
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_INTERVAL));
    }
};

const updateBotBalances = async () => {
    if (isRunning) {
        return;
    }
    isRunning = true;
    try {
        logger.info(`[update_balances] Start update bot balances`);
        const botConfigs: IBotBehavior[] = await BotConfig.find({}).sort({ lastRefreshed: 1 });

        // Schedule each bot's check-in independently
        for (const botConfig of botConfigs) {
            await updateBalance(botConfig);
        }
        logger.info(`[update_balances] Finished update bot balances`);
    } catch (error) {
        logger.error(`[update_balances] Error in update bot balances:`, error);
    } finally {
        isRunning = false;
    }
};

export const startUpgradeBotBalanceScheduler = async () => {
    try {
        await updateBotBalances();
        setInterval(updateBotBalances, 60 * 60 * 1000);
    } catch (error) {
        logger.error(`[update_balances] Error in startUpgradeBotBalanceScheduler:`, error);
    }
};
