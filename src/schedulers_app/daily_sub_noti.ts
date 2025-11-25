import connectDB from '../io/db';
import { redisCommands, redisPubSub } from '../io/redis';
import Database from '../libs/database';
import User, { IUser } from '../models/user';
import UserSubcription, { IUserSubscription } from '../models/userSubcription';
import { isBeforeToday, isNextDayOfGivenDate } from '../utils/common';
import logger from '../utils/logger';

const BASE_URL_BOT = `${process.env.BASE_URL_BOT as string}`;
const PLAY_URL = `${BASE_URL_BOT}/${process.env.NODE_ENV === 'production' ? 'play' : 'test'}`;

const LAST_DAILY_SUBS_NOTI_TIMESTAMP = 'game_event_bot:last_daily_sub_noti_ts';

await connectDB('Game Event Bot');
const dbInstance = Database.getInstance();
const db = await dbInstance.getDb();
const todoCollection = db.collection('todos');

let isDailySubInProgress = false;

export const dailySubscriptionNotiBot = async () => {
    if (isDailySubInProgress) {
        return;
    }

    isDailySubInProgress = true;
    const now = new Date();
    let lastNotiDate: Date = new Date(); // default today

    try {
        let lastNotiInRedis = await redisCommands.get(LAST_DAILY_SUBS_NOTI_TIMESTAMP);
        if (lastNotiInRedis != null) {
            lastNotiDate = new Date(parseInt(lastNotiInRedis));
        }

        if (!isBeforeToday(lastNotiDate)) {
            return;
        }
        logger.info(`[daily_subscription] Start notify daily subscription reminder for day ${now.getUTCDate()}`);

        // find all active user subscriptions
        let page = 0;
        let batchSize = 50;
        let hasNext = true;
        while (hasNext) {
            const activeSubs = await UserSubcription.aggregate([
                { $match: { endTime: { $gte: now } } }, // Match documents with endtime >= now
                { $group: { _id: '$userId' } }, // Group by userId to get distinct userId values
                { $sort: { _id: 1 } }, // Sort in ascending order of userId
                { $skip: page * batchSize }, // Skip documents for pagination
                { $limit: batchSize }, // Limit the results to the batch size
            ]);

            logger.info(`[daily_subscription] Batch: ${page}, User count: ${activeSubs.length || 0} users to notify`);

            page += 1;

            if (!activeSubs.length) {
                hasNext = false;
                break;
            }

            for (let i = 0; i < activeSubs.length; i++) {
                try {
                    const subscription: IUserSubscription = activeSubs[i];
                    const user: IUser | null = await User.findOne({ telegramId: subscription._id }).exec(); // because group by _id:user_id
                    if (!user) {
                        continue;
                    }

                    const fullName = `${user.firstName} ${user.lastName}`.trim();
                    const todo = {
                        todo_type: 'bot:send/tele/message',
                        message_type: 'msgBot:dailySubscription',
                        admin_address: 'game_event_bot',
                        created_at: now,
                        status: 'pending',
                        target_type: 'user',
                        target_id: user.telegramId,
                        message: `😋 Hey <b>${user.username || fullName}</b>!\n\nIt's time to claim your daily <b>Subscription</b> rewards! Quickly claim now!`,
                        buttons: [[{ text: `Claim now 😍`, url: PLAY_URL }]],
                    };

                    const insertResult = await todoCollection.insertOne(todo);
                    if (!insertResult.acknowledged) {
                        logger.error(`[daily_subscription] Error when inserting todo: ${todo}`);
                    }
                } catch (error) {
                    logger.error(`[daily_subscription] Error`, error);
                }
            }
        }

        logger.info('[daily_subscription] Finished successfully');
    } catch (error) {
        logger.error(`[daily_subscription] Finished failed`, error);
    } finally {
        isDailySubInProgress = false;
        await redisCommands.set(LAST_DAILY_SUBS_NOTI_TIMESTAMP, now.getTime());
        await redisCommands.expire(LAST_DAILY_SUBS_NOTI_TIMESTAMP, 48 * 60 * 60);
    }
};
