import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';

import connectDB from './io/db';
import { initGameConstants } from './utils/const';
import logger from './utils/logger';

import { healthRoutes } from './routers/healthRoutes';
import { userRoutes } from './routers/userRoutes';
import { gameRoutes } from './routers/gameRoutes';
import { questRoutes } from './routers/questRoutes';
import { landRoutes } from './routers/landRoutes';
import { treeRoutes } from './routers/treeRoutes';
import { achievementRoutes } from './routers/achievementRoutes';
import { inventoryRoutes } from './routers/inventoryRoutes';
import { idleFarmingRoutes } from './routers/idleFarmingRoutes';
import { shopRoutes } from './routers/shopRoutes';
import { subscriptionRoutes } from './routers/subscriptionRoutes';
import { minigameRoutes } from './routers/minigameRoutes';
import { boostRoutes } from './routers/boostRoutes';
import { poolRoutes } from './routers/poolRoutes';

const app = new Elysia();

const getAllowedOrigins = () => {
    const corsOrigins = process.env.CORS_ORIGIN?.split(',') || ['*'];
    logger.info(`CORS is enabled for origins: ${corsOrigins.join(', ')}`);
    return (request: Request) => {
        const origin = request.headers.get('origin');
        if (corsOrigins.includes('*')) return true;
        if (!origin) return false;
        return corsOrigins.includes(origin);
    };
};

if (process.env.CORS_ENABLED === 'true') {
    logger.info('CORS is enabled');
    app.use(
        cors({
            origin: getAllowedOrigins(),
            methods: 'GET, POST, PUT, DELETE, OPTIONS',
            allowedHeaders: [
                'Content-Type',
                'Authorization',
                '--webapp-init',
                'X-Forwarded-For', // De-facto standard, usually used by proxies
                'X-Client-IP', // Nginx or similar proxies
                'CF-Connecting-IP', // Cloudflare-specific header for client IP
                'true-client-ip', // Akamai/Cloudflare header for the original client IP
                'cf-pseudo-ipv4', // Cloudflare fallback for IPv4 when dealing with IPv6
            ],
            credentials: true,
            maxAge: 86400,
        }),
    );
} else {
    logger.info('CORS is disabled');
}

// Connect Database
connectDB('API');

// Init constants
initGameConstants();

// Register all route modules
app.get('/api', () => {
    return { message: 'Hello!' };
});

healthRoutes(app);
gameRoutes(app);

userRoutes(app);
questRoutes(app);
achievementRoutes(app);
landRoutes(app);
treeRoutes(app);
inventoryRoutes(app);
idleFarmingRoutes(app);
landRoutes(app);
shopRoutes(app);
subscriptionRoutes(app);
minigameRoutes(app);
boostRoutes(app);
poolRoutes(app);

export default app;
