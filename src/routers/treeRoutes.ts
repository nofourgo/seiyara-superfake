import { Elysia } from 'elysia';
import { treeController } from '../controllers/treeController';
import { validateJwtMiddleware } from '../middleware/authMiddleware';

export const treeRoutes = (app: Elysia) => {
    app.group('/api/trees', (group) => {
        group.get('/user', treeController.getUserTrees, {
            beforeHandle: validateJwtMiddleware,
        });

        group.post('/unlock', treeController.unlockUserTree, {
            beforeHandle: validateJwtMiddleware,
        });

        return group;
    });
};
