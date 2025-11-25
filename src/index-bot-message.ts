import Database from "./libs/database";
import { TelegramQueue } from "./libs/telegram";
import { initGameConstants } from "./utils/const";
import logger from './utils/logger';

const telegram = TelegramQueue.getInstance(process.env.TELEGRAM_BOT_TOKEN!);

await initGameConstants();

const message = async () => {
    const dbInstance = Database.getInstance();
    const db = await dbInstance.getDb();
    const todoCollection = db.collection('todos');

    const sendPendingMessages = async () => {
        // Find pending messages and include the necessary fields
        const messages = await todoCollection.find({
            todo_type: 'bot:send/tele/message',
            status: 'pending'
        }).project({
            _id: 1,
            target_id: 1,
            message: 1,
            buttons: 1,
            photo: 1,
            target_type: 1,   // Added to handle target type
            thread_id: 1      // Added to handle group topics
        }).toArray();

        for (let i = 0; i < messages.length; ++i) {
            const { _id, target_id, message, buttons, photo, target_type, thread_id } = messages[i];

            // Handle different target types
            if (target_type === 'group' && thread_id) {
                // If it's a group message with a thread (topic)
                telegram.enqueueMessage(target_id, message, buttons, photo, thread_id, async (data) => {
                    data.result && await todoCollection.updateOne({ _id }, { $set: { message_data: data, status: 'completed', completed_at: new Date() } });
                }, async () => {
                    await todoCollection.updateOne({ _id }, { $set: { status: 'failed', failed_at: new Date() } });
                });
            } else {
                // For user and channel, or group without thread_id
                telegram.enqueueMessage(target_id, message, buttons, photo, undefined, async (data) => {
                    data.result && await todoCollection.updateOne({ _id }, { $set: { message_data: data, status: 'completed', completed_at: new Date() } });
                }, async () => {
                    await todoCollection.updateOne({ _id }, { $set: { status: 'failed', failed_at: new Date() } });
                });
            }
        };
    };

    sendPendingMessages();

    const interval_id = setInterval(sendPendingMessages, 60 * 1000);

    const changeStream = todoCollection.watch();

    changeStream.on('change', async (event) => {
        if (event.operationType === 'insert' && event.fullDocument.todo_type === 'bot:send/tele/message') {
            const { _id, target_id, message, buttons, photo, target_type, thread_id } = event.fullDocument;

            // Handle different target types
            if (target_type === 'group' && thread_id) {
                telegram.enqueueMessage(target_id, message, buttons, photo, thread_id, async (data) => {
                    data.result && await todoCollection.updateOne({ _id }, { $set: { message_data: data, status: 'completed', completed_at: new Date() } });
                }, async () => {
                    await todoCollection.updateOne({ _id }, { $set: { status: 'failed', failed_at: new Date() } });
                });
            } else {
                telegram.enqueueMessage(target_id, message, buttons, photo, undefined, async (data) => {
                    data.result && await todoCollection.updateOne({ _id }, { $set: { message_data: data, status: 'completed', completed_at: new Date() } });
                }, async () => {
                    await todoCollection.updateOne({ _id }, { $set: { status: 'failed', failed_at: new Date() } });
                });
            }
        }
    });

    changeStream.on('error', (error) => {
        logger.error('Change stream error:', error);

        clearInterval(interval_id);

        setTimeout(() => {
            logger.info('Retrying to start the stream...');
            message();
        }, 4000);
    });

    changeStream.on('end', () => {
        logger.info('Change stream ended. Retrying...');

        clearInterval(interval_id);

        setTimeout(() => {
            message();
        }, 4000);
    });
};

message();
