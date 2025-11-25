import app from './app';
import logger from './utils/logger';

const port = process.env.PORT_BE || 8000;

logger.info(`---------------------API APP--------------------`);
logger.info(`Configured PORT_BE: ${process.env.PORT_BE}`);
app.listen(port, () => {
    logger.info(`🦊 Elysia APP server running on port ${port}`);
});