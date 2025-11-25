import mongoose from 'mongoose';
import axios from 'axios';

import Quest, { ICfgQuest } from '../models/cfgQuest';
import UserQuest, { IUserQuest } from '../models/userQuest';
import User, { IUser } from '../models/user';
import * as referralService from './referralService';
import { ACTION, recordActivityLog } from './activityLogService';
import { checkin } from '../libs/seichain';
import { decryptData } from '../utils/encryption';
import { isBeforeToday } from '../utils/common';
import { balanceService } from './balanceService';
import { redisHelper } from '../io/redis';

const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
const TELEGRAM_GROUP_ID = process.env.TELEGRAM_GROUP_ID;
const CHECKIN_SEI_PRICE = 0.0001;

// Get Quests
export const getQuests = async (userId: string): Promise<IUserQuest[]> => {
    const user = await User.findOne({ telegramId: userId }, { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 })
        .lean()
        .exec();

    if (!user) {
        throw new Error('User not found');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const questTypes = ['daily'];

    // Fetch quests that are valid for today or have no start/end dates
    const dailyQuests: ICfgQuest[] = await Quest.find({
        type: { $in: questTypes },
        $and: [
            {
                $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lte: today } }],
            },
            {
                $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: today } }],
            },
        ],
    }).exec();

    let userQuests = await UserQuest.find({ userId, date: today, type: { $in: questTypes } }).exec();

    // if user doesnt have any `daily` quests, add quests for him
    if (userQuests.length === 0) {
        const newDailyQuests = await Promise.all(
            dailyQuests.map(async (quest) => {
                const userQuest = new UserQuest({
                    userId,
                    date: today,
                    questId: quest._id,
                    description: quest.name,
                    type: quest.type,
                    tasks: quest.tasks.map((task) => ({
                        ...task,
                        completed: false,
                        checking: false,
                        _id: new mongoose.Types.ObjectId(),
                    })),
                    imageUrl: quest.imageUrl,
                    completed: false,
                    rewardClaimed: false,
                    reward: quest.reward,
                });
                return await userQuest.save();
            }),
        );

        userQuests = [...userQuests, ...newDailyQuests];
    }

    // get all one time quests
    const oneTimeQuests: ICfgQuest[] = await Quest.find({
        type: 'one_time',
        $and: [
            {
                $or: [{ startDate: { $exists: false } }, { startDate: null }, { startDate: { $lte: today } }],
            },
            {
                $or: [{ endDate: { $exists: false } }, { endDate: null }, { endDate: { $gte: today } }],
            },
        ],
    }).exec();

    // get all one time quests user currently have
    const existingOneTimeUserQuests = await UserQuest.find({ userId, type: 'one_time' }).exec();

    // get new one time quests and add for user
    const newOneTimeUserQuests = await Promise.all(
        oneTimeQuests
            .filter((quest) => !existingOneTimeUserQuests.some((existingQuest) => existingQuest.questId.toString() == quest._id.toString()))
            .map(async (quest) => {
                const userQuest = new UserQuest({
                    userId,
                    date: today,
                    questId: quest._id,
                    description: quest.name,
                    type: quest.type,
                    tasks: quest.tasks.map((task) => ({
                        ...task,
                        completed: false,
                        checking: false,
                        _id: new mongoose.Types.ObjectId(),
                    })),
                    imageUrl: quest.imageUrl,
                    completed: false,
                    rewardClaimed: false,
                    reward: quest.reward,
                });
                return await userQuest.save();
            }),
    );

    return [...userQuests, ...existingOneTimeUserQuests, ...newOneTimeUserQuests];
};

// Get task status
export const getTaskStatus = async (
    userId: string,
    userQuestId: mongoose.Types.ObjectId,
    taskId: mongoose.Types.ObjectId,
): Promise<{ completed: boolean; checking: boolean }> => {
    const userQuest = await UserQuest.findOne({ userId, _id: userQuestId }).exec();

    if (!userQuest) {
        throw new Error('Quest or Task not found');
    }

    const task = userQuest.tasks.find((task) => task._id.equals(taskId));

    if (!task) {
        throw new Error('Task not found');
    }

    const checking = task.checking !== undefined ? task.checking : false;
    return { completed: task.completed, checking };
};

// Complete Tasks
const isUserInChannel = async (userId: string): Promise<boolean> => {
    try {
        const response = await axios.get(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getChatMember`, {
            params: {
                chat_id: TELEGRAM_CHANNEL_ID,
                user_id: userId,
            },
        });
        const status = response.data.result.status;
        return status === 'member' || status === 'administrator' || status === 'creator';
    } catch (error) {
        return false;
    }
};

const isUserInGroup = async (userId: string): Promise<boolean> => {
    try {
        const response = await axios.get(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getChatMember`, {
            params: {
                chat_id: TELEGRAM_GROUP_ID,
                user_id: userId,
            },
        });

        const status = response.data.result.status;
        return status === 'member' || status === 'administrator' || status === 'creator';
    } catch (error) {
        return false;
    }
};

export const completeTask = async (userId: string, userQuestId: mongoose.Types.ObjectId, taskId: mongoose.Types.ObjectId) => {
    // Validate user existence
    const user: IUser | null = await User.findOne(
        { telegramId: userId },
        { mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 },
    ).exec();
    if (!user) {
        throw new Error('User not found');
    }

    // Validate user quest existence
    const userQuest: IUserQuest | null = await UserQuest.findOne({ userId, _id: userQuestId }).exec();
    if (!userQuest) {
        throw new Error('Quest not found');
    }

    // Find task within the user's quest
    const task = userQuest.tasks.find((task) => task._id.equals(taskId));
    if (!task) {
        throw new Error('Task not found');
    }

    // Task-specific actions
    if (task.type === 'join_telegram_channel') {
        const inChannel = await isUserInChannel(userId);
        if (!inChannel) {
            throw new Error('User is not a member of the Telegram channel.');
        }
    } else if (task.type === 'join_telegram_group') {
        const inGroup = await isUserInGroup(userId);
        if (!inGroup) {
            throw new Error('User is not a member of the Telegram group.');
        }
    } else if (task.type === 'confirm_onchain') {
        // Handle on-chain task with receipt verification
        let receipt;
        try {
            receipt = await checkin(decryptData(user.privateKey), CHECKIN_SEI_PRICE);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
            await recordActivityLog({
                gameId: user.gameId,
                telegramId: user.telegramId,
                action: ACTION.CHECKIN_ONCHAIN,
                status: 'failed',
                details: `Checkin error: ${errorMessage}`,
            });
            throw new Error(`Checkin is not successful: ${errorMessage}`);
        }

        // Validate transaction receipt
        if (receipt?.status !== 1) {
            const receiptDetails = JSON.stringify(receipt);
            await recordActivityLog({
                gameId: user.gameId,
                telegramId: user.telegramId,
                action: ACTION.CHECKIN_ONCHAIN,
                status: 'failed',
                details: `Transaction failed: ${receiptDetails}`,
            });
            throw new Error(`Checkin is not successful: ${receipt?.status || 'unknown'}`);
        }

        if (isBeforeToday(user.lastOnchainCheckinAt)) {
            user.checkinOnchainCount += 1;
        }
        user.lastOnchainCheckinAt = new Date();
        await user.save();

        await recordActivityLog({
            gameId: user.gameId,
            telegramId: user.telegramId,
            action: ACTION.CHECKIN_ONCHAIN,
            sei: -CHECKIN_SEI_PRICE,
        });
        await User.findOneAndUpdate({ telegramId: user.telegramId }, { $inc: { spentSei: CHECKIN_SEI_PRICE } });
    } else {
        // Pass
    }
    // Mark the task as completed and update the quest's completion status
    task.completed = true;
    userQuest.completed = userQuest.tasks.every((task) => task.completed);

    // Save changes to the user quest
    await userQuest.save();
    return userQuest;
};

// Claim reward
export const claimQuestReward = async (userId: string, userQuestId: mongoose.Types.ObjectId) => {
    const getLock = await redisHelper.set(`lock:user_quest:${userQuestId.toString()}`, 'busy', { nx: true, ex: 60 });
    if (!getLock) {
        throw new Error('Claiming in progress');
    }

    try {
        // lock claimed field
        const userQuest = await UserQuest.findOne({
            userId,
            _id: userQuestId,
            completed: true,
            rewardClaimed: false,
            rewardClaiming: { $ne: true },
        }).exec();

        if (!userQuest) {
            throw new Error('No quest found or no reward available to claim or reward is already claiming');
        }

        const user: IUser | null = await User.findOne(
            { telegramId: userId },
            { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 },
        ).exec();
        if (!user) {
            throw new Error('User not found');
        }

        const reward = userQuest.reward;
        let questReward = {
            gold: 0,
            diamond: 0,
            seya: 0,
        };
        for (let i = 0; i < reward.length; i++) {
            if (reward[i].type == 'gold') {
                questReward.gold += reward[i].quantity;
            } else if (reward[i].type == 'diamond') {
                questReward.diamond += reward[i].quantity;
            } else if (reward[i].type == 'seya') {
                questReward.seya += reward[i].quantity;
            }
        }

        await balanceService.addUserBalance(userId, questReward);

        if (questReward.diamond > 0) {
            await referralService.recordBonusForReferer(userId, user.referredByCode, { type: 'diamond', quantity: questReward.diamond });
        }

        userQuest.rewardClaimed = true;
        await userQuest.save();

        await recordActivityLog({
            gameId: user.gameId,
            telegramId: user.telegramId,
            action: ACTION.CLAIM_QUEST,
            gold: questReward.gold,
            diamond: questReward.diamond,
            seya: questReward.seya,
            questName: userQuest.description,
            cfgQuestId: userQuest.questId._id,
            details: JSON.stringify(questReward),
        });

        return { userQuest, reward };
    } catch (error) {
        await redisHelper.del(`lock:user_quest:${userQuestId.toString()}`);
        throw error;
    }
};
