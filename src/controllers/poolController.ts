import { claimPool, getPools, getUserPool, stakePool } from '../services/poolService';
import { handleError } from '../utils/common';

export const poolController = {
    getPools: async ({ request }: { request: any }) => {
        const userId = request.user?.telegramId;
        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const result = await getPools(userId);
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request);
        }
    },

    getUserPool: async ({ request, params }: { request: any; params: any }) => {
        const userId = request.user?.telegramId;
        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }
        const { poolId } = params;

        try {
            const result = await getUserPool(userId, poolId);
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request);
        }
    },

    stakePool: async ({ request, body }: { request: any; body: any }) => {
        const userId = request.user?.telegramId;

        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        const { poolId, stakedItem, stakedAmount } = body;

        try {
            const result = await stakePool(userId, poolId, stakedItem, stakedAmount);
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request);
        }
    },

    claimPool: async ({ request, body }: { request: any; body: any }) => {
        const userId = request.user?.telegramId;

        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        const { poolId } = body;

        try {
            const result = await claimPool(userId, poolId);
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request);
        }
    },
};
