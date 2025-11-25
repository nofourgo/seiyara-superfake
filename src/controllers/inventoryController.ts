import * as inventoryService from '../services/inventoryService';
import { handleError } from '../utils/common';

export const inventoryController = {
    getUserInventory: async ({ request }: { request: any }) => {
        const userId = request.user?.telegramId;

        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const inventory = await inventoryService.getUserInventory(userId);
            return new Response(JSON.stringify(inventory), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request);
        }
    },

    useItem: async ({ request, body }: { request: any; body: any }) => {
        const userId = request.user?.telegramId;
        const { itemType, itemLevel, quantity } = body;

        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const result = await inventoryService.consumeUserItem(userId, itemType, itemLevel, quantity, false);
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request, body);
        }
    },

    upgradeItem: async ({ request, body }: { request: any; body: any }) => {
        const userId = request.user?.telegramId;
        const { itemType } = body;

        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const item = await inventoryService.upgradeUserItem(userId, itemType);
            return new Response(JSON.stringify(item), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request, body);
        }
    },
};
