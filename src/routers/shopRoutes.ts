import { Elysia } from 'elysia';
import { shopController } from '../controllers/shopController';
import { validateJwtMiddleware } from '../middleware/authMiddleware';

export const shopRoutes = (app: Elysia) => {
    app.group('/api/shop', (group) => {
        group.get('/', shopController.getShopItems, {
            beforeHandle: validateJwtMiddleware,
        });

        group.post('/purchase', shopController.purchaseItem, {
            beforeHandle: validateJwtMiddleware,
        });

        return group;
    });
};
