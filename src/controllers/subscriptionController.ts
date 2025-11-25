import user from '../models/user';
import * as subscriptionService from '../services/subscriptionService';
import { handleError } from '../utils/common';

export const subscriptionController = {
    getSubscriptions: async ({ request }: { request: any }) => {
        try {
            const result = await subscriptionService.getActiveSubscriptions();
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request);
        }
    },

    getUserSubscriptions: async ({ request }: { request: any }) => {
        try {
            const userId = request.user?.telegramId;
            if (!userId) {
                return new Response('Unauthorized', { status: 401 });
            }

            const result = await subscriptionService.getUserSubscriptions(userId);
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request);
        }
    },

    purchase: async ({ request, body }: { request: any; body: any }) => {
        const userId = request.user?.telegramId;
        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        const { subscriptionId } = body;

        try {
            const result = await subscriptionService.purchaseSubscription(userId, subscriptionId);
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request, body);
        }
    },

    claim: async ({ request, body }: { request: any; body: any }) => {
        const userId = request.user?.telegramId;
        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        const { subscriptionId } = body;

        try {
            const result = await subscriptionService.claimSubscription(userId, subscriptionId);
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request, body);
        }
    },

    checkFreeAd: async ({ request }: { request: any }) => {
        const userId = request.user?.telegramId;
        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const result = await subscriptionService.checkFreeAd(userId);
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request);
        }
    },
};
