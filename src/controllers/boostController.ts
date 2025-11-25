import { boostService } from '../services/boostService';
import { handleError } from '../utils/common';

export const boostController = {
    getBoost: async ({ request }: { request: any }) => {
        const userId = request.user?.telegramId;
        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const result = await boostService.getBoost(userId);
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request);
        }
    },

    purchaseBoost: async ({ request }: { request: any }) => {
        const userId = request.user?.telegramId;

        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const result = await boostService.purchaseBoost(userId);
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request);
        }
    },

    getFreeBoostByAd: async ({ request }: { request: any }) => {
        const userId = request.user?.telegramId;

        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const result = await boostService.getFreeBoostByAd(userId);
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request);
        }
    },
};
