import mongoose from 'mongoose';

import * as treeService from '../services/treeService';
import { handleError } from '../utils/common';

export const treeController = {
    getUserTrees: async ({ request }: { request: any }) => {
        const userId = request.user?.telegramId;

        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const trees = await treeService.getUserTrees(userId);
            return new Response(JSON.stringify(trees), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request);
        }
    },

    unlockUserTree: async ({ request, body }: { request: any; body: any }) => {
        const userId = request.user?.telegramId;
        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        const { treeName } = body;

        try {
            const unlockedTree = await treeService.unlockUserTree(userId, treeName);
            return new Response(JSON.stringify(unlockedTree), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request, body);
        }
    },
};
