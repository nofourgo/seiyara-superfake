import { Elysia } from 'elysia';
import { bot, startNotificationInterval } from './bot';
import { initGameConstants } from './utils/const';
import logger from './utils/logger';

const app = new Elysia();

await initGameConstants();

if (process.env.NODE_ENV === 'production') {
    const secretPath = `/telegraf/${bot.secretPathComponent()}`;
    app.post(secretPath, async ({ request }) => {
        await bot.handleUpdate(await request.json());
    });

    const webhookUrl = `${process.env.WEBHOOK_URL}${secretPath}`;
    logger.info(`Configured WEBHOOK_URL: ${process.env.WEBHOOK_URL}`);
    bot.telegram.setWebhook(webhookUrl)
        .then(() => {
            logger.info(`Webhook set to ${webhookUrl}`);
            startNotificationInterval(); // Start the interval for notifying about transactions
        })
        .catch((err: any) => {
            logger.error('Failed to set webhook:', err);
        });
    logger.info(`---------------------BOT WEBHOOK--------------------`);

    const port = process.env.PORT_BOT ? parseInt(process.env.PORT_BOT, 10) : 8080;
    logger.info(`Configured PORT_BOT: ${process.env.PORT_BOT}`);
    logger.info(`Starting BOT server on port: ${port}`);

    app.listen(port, () => {
        logger.info(`🦊 Elysia BOT server is running at localhost:${port}`);
    });
} else if (process.env.NODE_ENV != 'production') {
    bot.launch();
    logger.info(`---------------------BOT DEV--------------------`);
    logger.info('Bot launched in development mode');
    startNotificationInterval(); // Start the interval for notifying about transactions
}