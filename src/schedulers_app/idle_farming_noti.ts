import { redisCommands, redisPubSub } from '../io/redis';
import IdleFarming, { IIdleFarming } from '../models/idleFarming';
import User, { IUser } from '../models/user';
import logger from '../utils/logger';
import Database from '../libs/database';

const BASE_URL_BOT = `${process.env.BASE_URL_BOT as string}`;
const PLAY_URL = `${BASE_URL_BOT}/${process.env.NODE_ENV === 'production' ? 'play' : 'test'}`;

const LAST_IDLE_NOTI_TIMESTAMP = 'game_event_bot:last_idle_noti_ts';

let isIdleFarmingInProgress = false;

const dbInstance = Database.getInstance();
const db = await dbInstance.getDb();
const todoCollection = db.collection('todos');

export const idleFarmingNotiBot = async () => {
    if (isIdleFarmingInProgress) {
        return;
    }

    isIdleFarmingInProgress = true;
    const now = new Date();
    let lastNotiDate: Date = new Date(now.getTime() - 1 * 60 * 1000); // default 1 minute ago

    try {
        let lastNotiInRedis = await redisCommands.get(LAST_IDLE_NOTI_TIMESTAMP);
        if (lastNotiInRedis != null) {
            lastNotiDate = new Date(parseInt(lastNotiInRedis));
        }

        // find all idle farming from last -> now
        logger.info(`[idle_farming] Start notify idle farming finished from ${lastNotiDate} to ${now}`);

        let page = 0;
        let batchSize = 50;
        let hasNext = true;

        while (hasNext) {
            const recentFinishedIdleFarming: IIdleFarming[] = await IdleFarming.find({ endTime: { $gt: lastNotiDate, $lte: now } })
                .skip(page * batchSize)
                .limit(batchSize);

            logger.info(`[idle_farming] Batch: ${page}, User count:${recentFinishedIdleFarming.length} users to notify`);

            page += 1;
            if (!recentFinishedIdleFarming.length) {
                hasNext = false;
                break;
            }

            for (let i = 0; i < recentFinishedIdleFarming.length; i++) {
                try {
                    const idle: IIdleFarming = recentFinishedIdleFarming[i];
                    const user: IUser | null = await User.findOne({ telegramId: idle.userId }).exec();
                    if (!user) {
                        continue;
                    }
                    if (user.userCheck) {
                        continue;
                    }

                    const fullName = `${user.firstName} ${user.lastName}`.trim();
                    const todo = {
                        todo_type: 'bot:send/tele/message',
                        message_type: 'msgBot:idleFarming',
                        admin_address: 'game_event_bot',
                        created_at: now,
                        status: 'pending',
                        target_type: 'user',
                        target_id: user.telegramId,
                        message: `😋 Hey <b>${user.username || fullName}</b>!\n\nIt's time to claim your <b>Idle farming</b> rewards! Quickly claim and open <b>Lucky chest</b> now!`,
                        buttons: [[{ text: `Claim now 😍`, url: PLAY_URL }]],
                    };

                    const insertResult = await todoCollection.insertOne(todo);
                    if (!insertResult.acknowledged) {
                        logger.error(`[idle_farming] Error when inserting todo: ${todo}`);
                    }
                } catch (error) {
                    logger.error(`[idle_farming] Error when processing ${recentFinishedIdleFarming[i]}:`, error);
                }
            }
        }

        logger.info('[idle_farming] Finished successfully');
    } catch (error) {
        logger.error(`[idle_farming] Finished failed`, error);
    } finally {
        isIdleFarmingInProgress = false;
        await redisCommands.set(LAST_IDLE_NOTI_TIMESTAMP, now.getTime());
        await redisCommands.expire(LAST_IDLE_NOTI_TIMESTAMP, 24 * 60 * 60);
    }
};
