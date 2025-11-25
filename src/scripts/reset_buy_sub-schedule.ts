import { redisCommands } from "../io/redis";
import logger from "../utils/logger";

const reset = async () => {
    const keys = await redisCommands.keys('bot:*:buy_subscription:schuduled_time');
    for (const key of keys) {
        logger.info(`DEL ${key}`);
        await redisCommands.del(key);
    }
    logger.info(`DONE`);
}

reset();