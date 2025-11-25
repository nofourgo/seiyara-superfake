import { Elysia } from 'elysia';
import { userController } from '../controllers/userController';
import { validateTelegramInitData, validateJwtMiddleware, validateTelegramAuth } from '../middleware/authMiddleware';

export const userRoutes = (app: Elysia) => {
    // Auth
    app.post('/api/auth/telegram', userController.telegramLogin, {
        beforeHandle: validateTelegramInitData,
    });

    app.post('/api/auth/web', userController.telegramLogin, {
        beforeHandle: validateTelegramAuth,
    });

    app.post('/api/onboard', userController.onboard, {
        beforeHandle: validateJwtMiddleware,
    });

    // User
    app.get('/api/me', userController.getMeUser, {
        beforeHandle: validateJwtMiddleware,
    });

    app.get('/api/me/headquarter', userController.getHeadquarter, {
        beforeHandle: validateJwtMiddleware,
    });

    app.post('/api/me/headquarter/upgrade', userController.upgradeHeadquarter, {
        beforeHandle: validateJwtMiddleware,
    });

    app.get('/api/me/referral', userController.getReferralInfo, {
        beforeHandle: validateJwtMiddleware,
    });

    app.post('/api/me/referral/claim', userController.claimReferralBonus, {
        beforeHandle: validateJwtMiddleware,
    });

    app.get('/api/me/wallet/pp', userController.getWalletPP, {
        beforeHandle: validateJwtMiddleware,
    });

    app.get('/api/me/badges', userController.getBadges, {
        beforeHandle: validateJwtMiddleware,
    });

    app.post('/api/me/badges/claim', userController.claimBadge, {
        beforeHandle: validateJwtMiddleware,
    });

    app.post('/api/me/wallet/convert-ingame-sei', userController.convertIngameSei, {
        beforeHandle: validateJwtMiddleware,
    });
};
