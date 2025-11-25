import { startDailyCheckinScheduler } from './schedulers_bot/dailyCheckinScheduler';
import { startBuyLandTreeScheduler } from './schedulers_bot/buyLandTreeScheduler';
import { startEarnGoldScheduler } from './schedulers_bot/earnGoldScheduler';
import { startBuySubscriptionScheduler } from './schedulers_bot/buySubscriptionScheduler';
import { startUpgradeHqScheduler } from './schedulers_bot/upgradeHqScheduler';
import connectDB from './io/db';
import { initGameConstants } from './utils/const';
import logger from './utils/logger';
import { startUpgradeBotBalanceScheduler } from './schedulers_bot/updateBotBalance';
import { startClaimSeiAchieScheduler } from './schedulers_bot/claimSeiAchieScheduler';
import { startStakePoolScheduler } from './schedulers_bot/stakePoolScheduler';
import { startWithdrawSeiScheduler } from './schedulers_bot/withdrawSeiScheduler';

const startSchedulers = async () => {
    try {
        await connectDB('Bot-AI'); // Connect to the database

        await initGameConstants();

        // Start all schedulers independently
        // startDailyCheckinScheduler();

        startBuyLandTreeScheduler();

        startBuySubscriptionScheduler();

        startEarnGoldScheduler();

        startUpgradeHqScheduler();

        startUpgradeBotBalanceScheduler();

        startClaimSeiAchieScheduler();

        startStakePoolScheduler();

        startWithdrawSeiScheduler();

        logger.info('All schedulers started successfully.');
    } catch (error) {
        if (error instanceof Error) {
            logger.error(`Error starting schedulers: ${error.message}`);
        } else {
            logger.error('Unknown error starting schedulers', error);
        }
    }
};

startSchedulers();
