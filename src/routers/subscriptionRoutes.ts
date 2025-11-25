import { Elysia } from 'elysia';
import { subscriptionController } from '../controllers/subscriptionController';
import { validateJwtMiddleware } from '../middleware/authMiddleware';

export const subscriptionRoutes = (app: Elysia) => {
    app.group('/api/subscription', (group) => {
        group.get('/', subscriptionController.getSubscriptions, {
            beforeHandle: validateJwtMiddleware,
        });

        group.get('/me', subscriptionController.getUserSubscriptions, {
            beforeHandle: validateJwtMiddleware,
        });

        group.post('/purchase', subscriptionController.purchase, {
            beforeHandle: validateJwtMiddleware,
        });

        group.post('/claim', subscriptionController.claim, {
            beforeHandle: validateJwtMiddleware,
        });

        group.get('check-free-ad', subscriptionController.checkFreeAd, {
            beforeHandle: validateJwtMiddleware,
        });

        return group;
    });
};
