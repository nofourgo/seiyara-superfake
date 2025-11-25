import Redis from 'ioredis';

const redisPubSub = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const redisCommands = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Define Redis keys for schedulers
export const REDIS_KEYS = {
    LAST_RESET_CHECKIN: 'bot:daily_checkin:last_reset',
    COMPLETED_CHECKIN_SET: 'bot:daily_checkin:completed',
    SELECTED_CHECKIN_SET: 'bot:daily_checkin:selected',
    CHECKIN_SCHEDULE: (telegramId: string) => `bot:${telegramId}:daily_checkin:scheduled_time`,
    MIN_CHECKIN: `bot:daily_checkin:min`,
    MAX_CHECKIN: `bot:daily_checkin:max`,
    CHECKIN_LIMIT: `bot:daily_checkin:limit`,

    BUY_LAND_SCHEDULE: (telegramId: string, slot: number) => `bot:${telegramId}:${slot}:buy_land:schuduled_time`,
    BUY_TREE_SCHEDULE: (telegramId: string, slot: number) => `bot:${telegramId}:${slot}:buy_tree:schuduled_time`,

    EARN_GOLD_SCHEDULE: (telegramId: string, date: string) => `bot:${telegramId}:${date}:earn_gold:scheduled_time`,
    EARN_GOLD_EXECUTED: (telegramId: string, date: string) => `bot:${telegramId}:${date}:earn_gold:earned`,

    LAST_RESET_BUY_SUB: 'bot:buy_subscription:last_reset',
    COMPLETED_BUY_SUB_SET: 'bot:buy_subscription:completed',
    SELECTED_BUY_SUB_SET: 'bot:buy_subscription:selected',
    BUY_SUB_LIMIT_SETTING: `bot:buy_subscription:limit_setting`,
    BUY_SUB_LIMIT: `bot:buy_subscription:limit`,
    BUY_SUB_SCHEDULE: (telegramId: string) => `bot:${telegramId}:buy_subscription:schuduled_time`,

    CLAIM_SEI_ACHI_INIT: (date: string) => `bot:claim_sei_ach:${date}:init`,
    CLAIM_SEI_ACHI_COMPLETED: (date: string) => `bot:claim_sei_ach:${date}:completed`,
    CLAIM_SEI_ACHI_SELECTED: (date: string) => `bot:claim_sei_ach:${date}:selected`,
    CLAIM_SEI_ACHI_LIMIT_SETTING: `bot:claim_sei_ach:limit_setting`,
    CLAIM_SEI_ACHI_SCHEDULE: (telegramId: string) => `bot:${telegramId}:claim_sei_ach:schuduled_time`,

    UPGRADE_HQ_SCHEDULE: (telegramId: string) => `bot:${telegramId}:upgrade_hq:schuduled_time`,

    CLAIM_BADGEE_SCHEDULE: (telegramId: string) => `bot:${telegramId}:claim_badge:schuduled_time`,

    LAST_RESET_WITHDRAW_SEI: 'bot:withdraw_sei:last_reset',
    COMPLETED_WITHDRAW_SEI_SET: 'bot:withdraw_sei:completed',
    SELECTED_WITHDRAW_SEI_SET: 'bot:withdraw_sei:selected',
    WITHDRAW_SEI_SCHEDULE: (telegramId: string) => `bot:${telegramId}:withdraw_sei:schuduled_time`,

    // AUTO_SELL_SCHEDULED: (telegramId: string) => `bot:${telegramId}:autoSell:scheduled_time`,
    // AUTO_SELL_COMPLETED: (telegramId: string, sellIndex: number) => `bot:${telegramId}:autoSell:completed_${sellIndex}`,
    // LAST_RESET_AUTO_SELL: 'bot:autoSell:lastReset',
    // AUTO_SELL_TARGET_TOKENS: (telegramId: string) => `bot:${telegramId}:autoSell:targetTokens`,
};

// Redis helper methods to wrap basic operations
export const redisHelper = {
    async get(key: string): Promise<string | null> {
        return await redisCommands.get(key);
    },
    async set(key: string, value: string, options?: { nx?: boolean; ex?: number }): Promise<string | null> {
        if (options?.nx && options?.ex) {
            // Cast to 'any' to bypass the typing issue
            return await (redisCommands as any).set(key, value, 'NX', 'EX', options.ex.toString());
        } else if (options?.nx) {
            return await (redisCommands as any).set(key, value, 'NX');
        } else if (options?.ex) {
            return await (redisCommands as any).set(key, value, 'EX', options.ex.toString());
        } else {
            return await redisCommands.set(key, value);
        }
    },
    async del(key: string): Promise<void> {
        await redisCommands.del(key);
    },
    async sadd(key: string, ...members: string[]): Promise<void> {
        await redisCommands.sadd(key, ...members);
    },
    async srem(key: string, member: string): Promise<void> {
        await redisCommands.srem(key, member);
    },
    async sismember(key: string, member: string): Promise<number> {
        return await redisCommands.sismember(key, member);
    },
};

// Export the Redis instances and the helper methods
export { redisPubSub, redisCommands };
