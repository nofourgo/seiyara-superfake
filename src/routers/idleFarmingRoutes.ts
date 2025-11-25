import { Elysia } from 'elysia';
import { idleFarmingController } from '../controllers/idleFarmingController';
import { validateTelegramInitData, validateJwtMiddleware } from '../middleware/authMiddleware';

export const idleFarmingRoutes = (app: Elysia) => {
    app.group('/api/idle-farming', (group) => {
        group.get('/', idleFarmingController.getCurrentFarming, {
            beforeHandle: validateJwtMiddleware,
        });

        group.get('/npc/:npc', idleFarmingController.getCurrentNpcAd, {
            beforeHandle: validateJwtMiddleware,
        });

        // group.post('/start', idleFarmingController.startFarming, {
        //     beforeHandle: validateJwtMiddleware
        // });

        group.post('/harvest', idleFarmingController.harvestFarming, {
            beforeHandle: validateJwtMiddleware,
        });

        return group;
    });
};
