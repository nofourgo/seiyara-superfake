import { Elysia } from 'elysia';
import { gameController } from '../controllers/gameController';
import { validateCMSJwtMiddleware, validateJwtMiddleware } from '../middleware/authMiddleware';

export const gameRoutes = (app: Elysia) => {
    app.get('/api/game/ranking', gameController.getRanking, {
        beforeHandle: validateJwtMiddleware,
    });

    app.get('/api/cms/ranking', gameController.getRankingForCMS, {
        beforeHandle: validateCMSJwtMiddleware,
    });

    app.post('/api/game/status', gameController.getGameStatus, {
        beforeHandle: validateJwtMiddleware,
    });
};
