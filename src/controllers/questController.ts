import mongoose from 'mongoose';

import * as questService from '../services/questService';
import { handleError } from '../utils/common';

export const questController = {
    getQuests: async ({ request }: { request: any }) => {
        const userId = request.user?.telegramId;
        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const quests = await questService.getQuests(userId);
            return new Response(JSON.stringify(quests), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request);
        }
    },

    completeTask: async ({ request, body }: { request: any; body: any }) => {
        const userId = request.user?.telegramId;
        const { userQuestId, taskId } = body;

        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const updatedQuest = await questService.completeTask(userId, new mongoose.Types.ObjectId(userQuestId as string), new mongoose.Types.ObjectId(taskId as string));
            return new Response(JSON.stringify(updatedQuest), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request, body);
        }
    },

    claimReward: async ({ request, body }: { request: any; body: any }) => {
        const userId = request.user?.telegramId;
        const { userQuestId } = body;

        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const result = await questService.claimQuestReward(userId, new mongoose.Types.ObjectId(userQuestId as string));
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request, body);
        }
    },

    getTaskStatus: async ({ request, params }: { request: any; params: any }) => {
        const userId = request.user?.telegramId;
        const { userQuestId, taskId } = params;

        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const taskStatus = await questService.getTaskStatus(userId, new mongoose.Types.ObjectId(userQuestId as string), new mongoose.Types.ObjectId(taskId as string));
            return new Response(JSON.stringify(taskStatus), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request);
        }
    },
};
