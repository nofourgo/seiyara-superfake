import connectDB from './io/db';
import { redisCommands, redisPubSub } from './io/redis';
import Database from './libs/database';
import User, { IUser } from './models/user';
import { dailySubscriptionNotiBot } from './schedulers_app/daily_sub_noti';
import { idleFarmingNotiBot } from './schedulers_app/idle_farming_noti';
import { distributeRewardForAllPools } from './schedulers_app/distribute_pool_reward';
import { initGameConstants } from './utils/const';
import logger from './utils/logger';

const BASE_URL_BOT = `${process.env.BASE_URL_BOT as string}`;
const PLAY_URL = `${BASE_URL_BOT}/${process.env.NODE_ENV === 'production' ? 'play' : 'test'}`;

await connectDB('Game Event Bot');
const dbInstance = Database.getInstance();
const db = await dbInstance.getDb();
const todoCollection = db.collection('todos');

await initGameConstants();

export const startSchedulers = async () => {
    try {
        logger.info('START game event message bot!');

        idleFarmingNotiBot();
        setInterval(idleFarmingNotiBot, 5 * 60 * 1000); // 5 minutes

        newInvitedNotiBot();
        dailySubscriptionNotiBot();
        setInterval(dailySubscriptionNotiBot, 60 * 1000); // 1 mins

        distributeRewardForAllPools();
        setInterval(distributeRewardForAllPools, 60 * 1000); // 1 mins
    } catch (error) {
        logger.info(error);
    } finally {
    }
};

const newInvitedNotiBot = async () => {
    redisPubSub.subscribe('newOnboardF1');
    redisPubSub.on('message', async (channel, message) => {
        try {
            if (channel === 'newOnboardF1') {
                logger.info(`[new_onboard_F1] Received: ${message}`);
                const parsedMessage = JSON.parse(message);
                const { firstName, lastName, inviteCode } = parsedMessage;
                const fullName = `${firstName} ${lastName}`.trim();

                const referrer: IUser | null = await User.findOne({ inviteCode: inviteCode }).exec();
                if (!referrer) {
                    return;
                }

                if (referrer.referralConfig && referrer.referralConfig.configRefMaxInvites > 0) {
                    return;
                }

                const todo = {
                    todo_type: 'bot:send/tele/message',
                    message_type: 'msgBot:newOnboardF1',
                    admin_address: 'game_event_bot',
                    created_at: new Date(),
                    status: 'pending',
                    target_type: 'user',
                    target_id: referrer.telegramId,
                    message: `<b>${fullName}</b> has just joined SEIYARA through your link and join the game.\n\n<b>Total invitees</b>: ${referrer.referralCount}.`,
                    buttons: [[{ text: `🫂 Check friends now 🙆`, url: PLAY_URL }]],
                };

                const insertResult = await todoCollection.insertOne(todo);
                if (!insertResult.acknowledged) {
                    logger.error(`[new_onboard_F1] Error when inserting todo: ${todo}`);
                }
            }
        } catch (error) {
            logger.info(`[new_onboard_F1] Error:`, error);
        }
    });
};

startSchedulers();
