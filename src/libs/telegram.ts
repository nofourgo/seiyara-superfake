import axios from 'axios';
import logger from '../utils/logger';

export type Button = { text: string; url: string }[][];

interface Message {
    chatId: string;
    messageText: string;
    photo?: string;
    buttons?: Button;
    threadId?: string; // Added threadId for group topics
    onSuccess?: (data: any) => Promise<void>;
    onError?: () => Promise<void>;
}

class TelegramQueue {
    private static instance: TelegramQueue;
    private messageQueue: Message[];
    private activeChatIds: Set<string>;
    private isSending: boolean;
    private botToken: string;

    private constructor(botToken: string) {
        this.botToken = botToken;
        this.messageQueue = [];
        this.activeChatIds = new Set<string>();
        this.isSending = false;
    }

    public static getInstance(botToken: string): TelegramQueue {
        if (!TelegramQueue.instance) {
            TelegramQueue.instance = new TelegramQueue(botToken);
        }
        return TelegramQueue.instance;
    }

    public enqueueMessage(chatId: string, messageText: string, buttons?: Button, photo?: string, threadId?: string, onSuccess?: (data: any) => Promise<void>, onError?: () => Promise<void>): void {
        if (!this.activeChatIds.has(chatId + messageText)) {
            logger.info(`[${chatId}]: Added to queue, skipping...`);
            this.messageQueue.push({ chatId, messageText, buttons, photo, threadId, onSuccess, onError });
            this.activeChatIds.add(chatId + messageText);
            this.checkQueue();
        } else {
            logger.info(`[${chatId}]: Already in queue, skipping...`);
        }
    }

    private async checkQueue(): Promise<void> {
        if (!this.isSending && this.messageQueue.length > 0) {
            this.isSending = true;

            while (this.messageQueue.length > 0) {
                const batch = this.messageQueue.splice(0, 30);

                await Promise.all(batch.map(message => message.photo ? this.sendPhoto(message) : this.sendMessage(message)));

                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            this.isSending = false;

            this.checkQueue();
        }
    }

    private sendMessage(message: Message): void {
        const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

        const options: { [key: string]: any } = {
            chat_id: message.chatId,
            text: message.messageText,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: message.buttons || [],
            },
            ...(message.threadId && { message_thread_id: message.threadId }) // Add threadId for group topics
        };

        axios.post(url, options, { timeout: 10000 })
            .then(async (response) => {
                logger.info(`[${message.chatId}]: (SUCCESS) message sent`);
                message.onSuccess && await message.onSuccess(response.data);
                this.activeChatIds.delete(message.chatId + message.messageText);
            })
            .catch(async error => {
                logger.error(`[${message.chatId}]: (ERROR) message sending failed`, error.message);
                message.onError && await message.onError();
                this.activeChatIds.delete(message.chatId + message.messageText);
            });
    }

    private sendPhoto(message: Message): void {
        const url = `https://api.telegram.org/bot${this.botToken}/sendPhoto`;

        const options: { [key: string]: any } = {
            chat_id: message.chatId,
            caption: message.messageText,
            photo: message.photo,
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: message.buttons || [],
            },
            ...(message.threadId && { message_thread_id: message.threadId }) // Add threadId for group topics
        };

        axios.post(url, options, { timeout: 10000 })
            .then(async (response) => {
                logger.info(`[${message.chatId}]: (SUCCESS) message sent`);
                message.onSuccess && await message.onSuccess(response.data);
                this.activeChatIds.delete(message.chatId + message.messageText);
            })
            .catch(async error => {
                logger.error(`[${message.chatId}]: (ERROR) message sending failed`, error.message);
                message.onError && await message.onError();
                this.activeChatIds.delete(message.chatId + message.messageText);
            });
    }
}

export { TelegramQueue };
