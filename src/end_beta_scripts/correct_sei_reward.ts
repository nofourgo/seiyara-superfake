import connectDB from '../io/db';
import activityLog from '../models/activityLog';
import { ACTION } from '../services/activityLogService';
import { balanceService } from '../services/balanceService';
import logger from '../utils/logger';

export const correctSeiReward = async () => {
    await connectDB('Correct SEI bonus');

    // Reset
    logger.info(`[user_x3_bonus_idle] Started reduce user idle bonus`);
    const userClaimx3Logs = await activityLog.find({
        action: ACTION.IDLE_FARMING_BONUS,
        status: 'ok',
        sei: { $lt: 0 },
        createdAt: { $lt: new Date('2024-11-04') },
    });
    for (const log of userClaimx3Logs) {
        try {
            const telegramId = log.telegramId;
            const convertedSei = log.sei != null && log.sei != undefined ? -log.sei : 0;
            if (convertedSei <= 0) {
                throw new Error(`Error activity log, claim idle bonus but no sei paid: log id ${log._id}`);
            }

            await balanceService.deductUserBalance(telegramId, { sei: convertedSei });
            logger.info(`deduct ${telegramId} ${convertedSei}`)
        } catch (error) {
            logger.error(`[user_x3_bonus_idle] Error reduce idle bonus sei: `, error);
        }
    }
    logger.info(`[user_x3_bonus_idle] Finished reduce user idle bonus`);
};

correctSeiReward();