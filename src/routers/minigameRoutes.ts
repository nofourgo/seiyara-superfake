import { Elysia } from 'elysia';
import { minigameController } from '../controllers/minigameController';
import { validateJwtMiddleware } from '../middleware/authMiddleware';

export const minigameRoutes = (app: Elysia) => {
    app.group('/api/minigame', (group) => {
        group.get('/spin-count', minigameController.getSpinCount, {
            beforeHandle: validateJwtMiddleware,
        });
        group.post('/spin', minigameController.spin, {
            beforeHandle: validateJwtMiddleware,
        });

        return group;
    });
};
