import mongoose from 'mongoose';

import * as shopService from '../services/shopService';
import { handleError } from '../utils/common';

export const shopController = {
    getShopItems: async ({ request }: { request: any }) => {
        try {
            const result = await shopService.getActiveShopItems();
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request);
        }
    },

    purchaseItem: async ({ request, body }: { request: any; body: any }) => {
        const userId = request.user?.telegramId;
        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        const { shopItemId } = body;
        try {
            const result = await shopService.purchaseItem(userId, shopItemId);
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request);
        }
    },
};
