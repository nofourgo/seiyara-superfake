import fs from 'fs';
import connectDB from '../io/db';
import User from '../models/user';
import logger from '../utils/logger';

// Path to the .txt file
const txtFilePath = './src/end_beta_scripts/reward_seya.txt';

// Function to update user SEYA values from the .txt file
const updateUserSeyaFromTxt = async () => {
    await connectDB('reward seya update');

    const updates: { telegramId: string; seya: number }[] = [];

    logger.info(`Reading data from ${txtFilePath}`);
    const lines = fs.readFileSync(txtFilePath, 'utf-8').split('\n');

    lines.slice(1).forEach(line => {
        const columns = line.split(',');
        if (columns.length >= 5) {
            const telegramId = columns[1].trim();
            const seya = parseInt(columns[4].trim(), 10);
            updates.push({ telegramId, seya });
        }
    });

    logger.info(`TXT file successfully processed. Preparing updates for ${updates.length} users.`);
    
    for (const update of updates) {
        try {
            const userDoc = await User.findOne({ telegramId: update.telegramId });
            if (userDoc) {
                const currentSeya = userDoc.seya || 0;
                const newSeya = currentSeya + update.seya;

                await User.updateOne(
                    { telegramId: update.telegramId },
                    { $set: { seya: newSeya } }
                );
                
                logger.info(`Updated user ${userDoc.telegramId}: current seya = ${currentSeya}, new seya = ${newSeya}`);
            } else {
                logger.warn(`User with telegramId ${update.telegramId} not found.`);
            }
        } catch (error) {
            logger.error(`Error updating user with telegramId ${update.telegramId}:`, error);
        }
    }

    logger.info(`Finished updating seya values for users.`);
};

// Check for "go" argument
if (process.argv.includes('go')) {
    await updateUserSeyaFromTxt();
} else {
    logger.warn('Script requires "go" argument to run. Usage: bun run src/scripts/reward_seya.ts go');
}