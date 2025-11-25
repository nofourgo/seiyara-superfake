import { Elysia } from 'elysia';
import { inventoryController } from '../controllers/inventoryController';
import { validateJwtMiddleware } from '../middleware/authMiddleware';

export const inventoryRoutes = (app: Elysia) => {
    app.group('/api/inventory', (group) => {
        group.get('/user', inventoryController.getUserInventory, {
            beforeHandle: validateJwtMiddleware,
        });

        group.post('/upgrade-item', inventoryController.upgradeItem, {
            beforeHandle: validateJwtMiddleware,
        });

        group.post('/use-item', inventoryController.useItem, {
            beforeHandle: validateJwtMiddleware,
        });

        return group;
    });
};
