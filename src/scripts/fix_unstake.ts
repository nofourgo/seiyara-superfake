import connectDB from '../io/db';
import userPool, { IUserPool } from '../models/userPool';
import { unstakePool } from '../services/poolService';
import logger from '../utils/logger';

const fixUnstake = async () => {
    await connectDB('fix unstake');

    const userPools: IUserPool[] = await userPool.find({
        actions: { $not: { $elemMatch: { action: 'unstake' } } },
        userId: { $regex: /^[0-9]/ },
    });

    logger.info(`len=${userPools.length}`);

    for (const userPool of userPools) {
        try {
            await unstakePool(userPool.userId, userPool.poolId.toString(), userPool.stakedItem, userPool.stakedAmount);
        } catch (error) {
            logger.error(`error: ${userPool._id}: `, error);
        }
    }

    logger.info('DONE');
};

await fixUnstake();
