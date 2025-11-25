import { Elysia } from 'elysia';
import { achievementController } from '../controllers/achievementController';
import { validateJwtMiddleware } from '../middleware/authMiddleware';

export const achievementRoutes = (app: Elysia) => {
    app.group('/api/achievements', (group) => {
        group.get('/', achievementController.getAchievements, {
            beforeHandle: validateJwtMiddleware,
        });
        group.post('/claim-reward', achievementController.claimReward, {
            beforeHandle: validateJwtMiddleware,
        });
        group.get('/:userAchievementId/task-status/:taskId', achievementController.getTaskStatus, {
            beforeHandle: validateJwtMiddleware,
        });

        return group;
    });
};
