import { Elysia } from 'elysia';
import { boostController } from '../controllers/boostController';
import { validateJwtMiddleware } from '../middleware/authMiddleware';

export const boostRoutes = (app: Elysia) => {
    app.group('/api/boost', (group) => {
        group.get('/', boostController.getBoost, {
            beforeHandle: validateJwtMiddleware,
        });
        group.post('/purchase', boostController.purchaseBoost, {
            beforeHandle: validateJwtMiddleware,
        });
        group.post('/watch-ad', boostController.getFreeBoostByAd, {
            beforeHandle: validateJwtMiddleware,
        });

        return group;
    });
};
