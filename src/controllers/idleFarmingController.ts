import mongoose from 'mongoose';

import * as idleFarmingService from '../services/idleFarmingService';
import { handleError } from '../utils/common';

export const idleFarmingController = {
    getCurrentFarming: async ({ request }: { request: any }) => {
        const userId = request.user?.telegramId;

        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const result = await idleFarmingService.getCurrentFarming(userId);
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request);
        }
    },

    getCurrentNpcAd: async ({ request, params }: { request: any, params: any }) => {
        const userId = request.user?.telegramId;
        const npc = params.npc;

        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const result = await idleFarmingService.getCurrentAdStatusByNpc(userId, npc);
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request);
        }
    },

    // startFarming: async ({ request }: { request: any }) => {
    //     const userId = request.user?.telegramId;

    //     if (!userId) {
    //         return new Response('Unauthorized', { status: 401 });
    //     }

    //     try {
    //         const result = await idleFarmingService.startIdleFarming(userId, null);
    //         return new Response(JSON.stringify(result), {status: 200, headers: { 'Content-Type': 'application/json' }});
    //     } catch (error) {
    //         return handleError(error);
    //     }
    // },

    harvestFarming: async ({ request, body }: { request: any; body: any }) => {
        const userId = request.user?.telegramId;

        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        const { byAd, byNPC, paidBySei } = body;

        try {
            let result: any = null;
            if (byAd || byNPC) {
                result = await idleFarmingService.harvestIdleFarmingByAd(userId, byAd, byNPC);
            } else {
                result = await idleFarmingService.harvestIdleFarming(userId, paidBySei);
            }
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request, body);
        }
    },
};
