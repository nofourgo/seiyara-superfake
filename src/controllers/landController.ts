import mongoose from 'mongoose';

import * as landService from '../services/landService';
import { handleError } from '../utils/common';

export const landController = {
    getUserLands: async ({ request }: { request: any }) => {
        const userId = request.user?.telegramId;

        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const lands = await landService.getUserLands(userId);
            return new Response(JSON.stringify(lands), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request);
        }
    },

    plantTree: async ({ request, body }: { request: any; body: any }) => {
        const userId = request.user?.telegramId;
        const { slot, treeName } = body;

        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const updatedLand = await landService.plantTree(userId, slot, treeName);
            return new Response(JSON.stringify(updatedLand), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request, body);
        }
    },

    harvestTree: async ({ request, body }: { request: any; body: any }) => {
        const userId = request.user?.telegramId;
        const { slot } = body;

        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const updatedLand = await landService.harvestTree(userId, slot);
            return new Response(JSON.stringify(updatedLand), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request, body);
        }
    },

    unlockUserLand: async ({ request, body }: { request: any; body: any }) => {
        const userId = request.user?.telegramId;
        const { slot } = body;

        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const newUnlockedLand = await landService.unlockUserLand(userId, slot);
            return new Response(JSON.stringify(newUnlockedLand), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request, body);
        }
    },
};
