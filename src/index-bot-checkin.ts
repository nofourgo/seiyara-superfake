import { startDailyCheckinScheduler } from './schedulers_bot/dailyCheckinScheduler';
import connectDB from './io/db';
import { initGameConstants } from './utils/const';
import logger from './utils/logger';

const startSchedulers = async () => {
    try {
        await connectDB('Bot-AI-checkin'); // Connect to the database

        await initGameConstants();

        // Start all schedulers independently
        startDailyCheckinScheduler();

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
