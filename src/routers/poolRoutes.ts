import { Elysia } from 'elysia';
import { poolController } from '../controllers/poolController';
import { validateJwtMiddleware } from '../middleware/authMiddleware';

export const poolRoutes = (app: Elysia) => {
    app.group('/api/pools', (group) => {
        group.get('/', poolController.getPools, {
            beforeHandle: validateJwtMiddleware,
        });
        group.get('/:poolId', poolController.getUserPool, {
            beforeHandle: validateJwtMiddleware,
        });
        group.post('/stake', poolController.stakePool, {
            beforeHandle: validateJwtMiddleware,
        });
        group.post('/claim', poolController.claimPool, {
            beforeHandle: validateJwtMiddleware,
        });

        return group;
    });
};
