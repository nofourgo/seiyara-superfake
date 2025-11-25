import { Elysia } from 'elysia';
import { landController } from '../controllers/landController';
import { validateJwtMiddleware } from '../middleware/authMiddleware';

export const landRoutes = (app: Elysia) => {
    app.group('/api/lands', (group) => {
        // group.get('/user/slot/:slot', landController.getLandBySlot, {
        //     beforeHandle: validateJwtMiddleware
        // });

        group.get('/user', landController.getUserLands, {
            beforeHandle: validateJwtMiddleware,
        });

        group.post('/plant-tree', landController.plantTree, {
            beforeHandle: validateJwtMiddleware,
        });

        group.post('/harvest-tree', landController.harvestTree, {
            beforeHandle: validateJwtMiddleware,
        });

        group.post('/unlock', landController.unlockUserLand, {
            beforeHandle: validateJwtMiddleware,
        });

        return group;
    });
};
