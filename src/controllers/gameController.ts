import * as gameService from '../services/gameService';
import { handleError } from '../utils/common';

export const gameController = {
    getGameStatus: async ({ request }: { request: any }) => {
        try {
            const user = request.user;

            return new Response(`User ${user.id}'s game status`, {
                status: 200,
            });
        } catch (error) {
            return handleError(error, request);
        }
    },

    getRanking: async ({ request }: { request: any }) => {
        try {
            const user = request.user;
            if (!user) {
                return new Response('Unauthorized', { status: 401 });
            }

            const rankings = await gameService.getRankings(user.telegramId);

            return new Response(JSON.stringify(rankings), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (error) {
            return handleError(error, request);
        }
    },

    getRankingForCMS: async ({ request }: { request: any }) => {
        try {
            const rankings = await gameService.getRankings('1583042828');

            return new Response(JSON.stringify(rankings), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (error) {
            return handleError(error);
        }
    },
};
