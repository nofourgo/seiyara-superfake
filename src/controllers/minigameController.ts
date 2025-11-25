import * as minigameService from '../services/minigameService';
import { handleError } from '../utils/common';

export const minigameController = {
    getSpinCount: async ({ request }: { request: any }) => {
        const userId = request.user?.telegramId;
        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const result = await minigameService.getSpinCount(userId);
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request);
        }
    },

    spin: async ({ request }: { request: any }) => {
        const userId = request.user?.telegramId;
        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const result = await minigameService.spin(userId);
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request);
        }
    },
};
