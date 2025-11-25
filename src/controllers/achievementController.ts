import mongoose from 'mongoose';

import * as achievementService from '../services/achievementService';
import { handleError } from '../utils/common';

export const achievementController = {
    getAchievements: async ({ request }: { request: any }) => {
        const userId = request.user?.telegramId;
        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const achievements = await achievementService.getAchievements(userId);
            return new Response(JSON.stringify(achievements), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request);
        }
    },

    claimReward: async ({ request, body }: { request: any; body: any }) => {
        const userId = request.user?.telegramId;
        const { userAchievementId } = body;

        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const result = await achievementService.claimAchievementReward(userId, new mongoose.Types.ObjectId(userAchievementId as string));
            return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request, body);
        }
    },

    getTaskStatus: async ({ request, params }: { request: any; params: any }) => {
        const userId = request.user?.telegramId;
        const { userAchievementId, taskId } = params;

        if (!userId) {
            return new Response('Unauthorized', { status: 401 });
        }

        try {
            const taskStatus = await achievementService.getTaskStatus(userId, new mongoose.Types.ObjectId(userAchievementId as string), new mongoose.Types.ObjectId(taskId as string));
            return new Response(JSON.stringify(taskStatus), { status: 200, headers: { 'Content-Type': 'application/json' } });
        } catch (error) {
            return handleError(error, request);
        }
    },
};
