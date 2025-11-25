import { Elysia } from 'elysia';
import { questController } from '../controllers/questController';
import { validateJwtMiddleware } from '../middleware/authMiddleware';

export const questRoutes = (app: Elysia) => {
    app.group('/api/quests', (group) => {
        group.get('/', questController.getQuests, {
            beforeHandle: validateJwtMiddleware,
        });

        group.post('/complete-task', questController.completeTask, {
            beforeHandle: validateJwtMiddleware,
        });

        group.post('/claim-reward', questController.claimReward, {
            beforeHandle: validateJwtMiddleware,
        });

        group.get('/:userQuestId/task-status/:taskId', questController.getTaskStatus, {
            beforeHandle: validateJwtMiddleware,
        });

        return group;
    });
};
