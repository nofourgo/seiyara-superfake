import mongoose from 'mongoose';

import Achievement, { ICfgAchievement } from '../models/cfgAchievement';
import UserAchievement, { IUserAchievement } from '../models/userAchievement';
import User, { IUser } from '../models/user';
import * as referralService from './referralService';
import { ACTION, recordActivityLog } from './activityLogService';
import { balanceService } from './balanceService';
import { redisHelper } from '../io/redis';
import { transferSeiReward } from '../libs/seichain';

export const REWARD_ONCHAIN_SEI = 0.01;

// Get Achievements
const updateUserAchievementProgress = (user: IUser, userAchievement: IUserAchievement) => {
    // NOTE: currently only 1 task, update this later if requirement changes
    const task = userAchievement.tasks[0];
    if (task.type == 'invite') {
        task.progressLevel = user.referralCount;
    } else if (task.type == 'checkin_onchain' || task.type == 'checkin_onchain_10d') {
        task.progressLevel = user.checkinOnchainCount;
    } else if (task.type == 'login' || task.type == 'login_10d') {
        task.progressLevel = user.loginCount;
    } else if (task.type == 'level_hq') {
        task.progressLevel = user.headquarter.level;
    } else if (task.type == 'spend_sei') {
        task.progressLevel = Math.floor(user.spentSei * 10000) / 10000;
    }
    task.completed = task.progressLevel >= task.conditionLevel;

    if (userAchievement.completed || userAchievement.rewardClaimed) {
        // won't touch user achievement has been completed
        return;
    }
    userAchievement.completed = userAchievement.tasks.every((task) => task.completed);
};

export const getAchievements = async (userId: string): Promise<IUserAchievement[]> => {
    const user: IUser | null = await User.findOne(
        { telegramId: userId },
        { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 },
    ).exec();
    if (!user) {
        throw new Error('User not found');
    }

    // Fetch all achievements
    const achievements: ICfgAchievement[] = await Achievement.find().exec();
    if (achievements.length === 0) {
        throw new Error('No achievements found');
    }

    let userAchievements = await UserAchievement.find({ userId }).exec();
    await Promise.all(
        userAchievements.map(async (userAchievement) => {
            updateUserAchievementProgress(user, userAchievement);
            return await userAchievement.save();
        }),
    );

    // get new one time achievements and add for user
    const newUserAchievements = await Promise.all(
        achievements
            .filter((achievement) => !userAchievements.some((existingAchievement) => existingAchievement.achievementId.equals(achievement._id)))
            .map(async (achievement) => {
                const userAchievement = new UserAchievement({
                    userId,
                    achievementId: achievement._id,
                    description: achievement.name,
                    tasks: achievement.tasks.map((task) => ({
                        ...task,
                        completed: false,
                        checking: false,
                        _id: new mongoose.Types.ObjectId(),
                    })),
                    completed: false,
                    rewardClaimed: false,
                    reward: achievement.reward,
                });
                updateUserAchievementProgress(user, userAchievement);
                return await userAchievement.save();
            }),
    );

    return [...userAchievements, ...newUserAchievements].sort((a, b) => {
        if (a.tasks[0].type == 'login_10d') {
            return -1;
        }
        if (a.tasks[0].type == 'checkin_onchain_10d') {
            return -1;
        }
        // Compare by tasks[0].type
        if (a.tasks[0].type > b.tasks[0].type) {
            return 1;
        } else if (a.tasks[0].type < b.tasks[0].type) {
            return -1;
        } else {
            // If types are the same, compare by tasks[0].level
            return a.tasks[0].conditionLevel - b.tasks[0].conditionLevel;
        }
    });
};

export const getTaskStatus = async (
    userId: string,
    userAchievementId: mongoose.Types.ObjectId,
    taskId: mongoose.Types.ObjectId,
): Promise<{ completed: boolean; checking: boolean }> => {
    const userAchievement = await UserAchievement.findOne({ userId, _id: userAchievementId }).exec();

    if (!userAchievement) {
        throw new Error('Achievement not found');
    }

    const task = userAchievement.tasks.find((task) => task._id.equals(taskId));

    if (!task) {
        throw new Error('Task not found');
    }

    const checking = task.checking !== undefined ? task.checking : false;
    return { completed: task.completed, checking };
};

// Claim reward
export const claimAchievementReward = async (userId: string, userAchievementId: mongoose.Types.ObjectId) => {
    const getLock = await redisHelper.set(`lock:user_achievement:${userAchievementId.toString()}`, 'busy', { nx: true, ex: 60 });
    if (!getLock) {
        throw new Error('Claiming in progress');
    }

    try {
        // lock reward
        const userAchievement = await UserAchievement.findOne({
            _id: userAchievementId,
            completed: true,
            rewardClaimed: false,
            rewardClaiming: { $ne: true },
        }).exec();

        if (!userAchievement) {
            throw new Error('No achievement found or no reward available to claim or achievement is being claimed');
        }

        const user: IUser | null = await User.findOne(
            { telegramId: userId },
            { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 },
        ).exec();
        if (!user) {
            throw new Error('User not found');
        }

        const reward = userAchievement.reward;
        let achievementReward = {
            gold: 0,
            diamond: 0,
            seya: 0,
            onchainSei: 0,
        };
        for (let i = 0; i < reward.length; i++) {
            if (reward[i].type == 'gold') {
                achievementReward.gold += reward[i].quantity;
            } else if (reward[i].type == 'diamond') {
                achievementReward.diamond += reward[i].quantity;
            } else if (reward[i].type == 'seya') {
                achievementReward.seya += reward[i].quantity;
            } else if (reward[i].type == 'onchain_sei') {
                achievementReward.onchainSei += reward[i].quantity;
            }
        }

        if (achievementReward.onchainSei > 0) {
            if (process.env.NODE_ENV == 'production') {
                if (process.env.QUEST_REWARD_SENDER_PK != undefined && process.env.QUEST_REWARD_SENDER_PK != null) {
                    userAchievement.rewardClaiming = true;
                    await userAchievement.save();
                    try {
                        await transferSeiReward(process.env.QUEST_REWARD_SENDER_PK, user.evmAddress, REWARD_ONCHAIN_SEI);
                    } catch (error) {
                        await recordActivityLog({
                            status: 'failed',
                            gameId: user.gameId,
                            telegramId: user.telegramId,
                            action: ACTION.CLAIM_ACHIEVEMENT,
                            achivementName: userAchievement.description,
                            cfgAchievementId: userAchievement.achievementId,
                            details: JSON.stringify(error),
                        });
                        throw error;
                    } finally {
                        userAchievement.rewardClaiming = false;
                        await userAchievement.save();
                    }
                } else {
                    throw new Error('Unexpected error. Please contact with us!');
                }
            }
        }

        await balanceService.addUserBalance(userId, achievementReward);

        userAchievement.rewardClaimed = true;
        await userAchievement.save();

        if (achievementReward.diamond > 0) {
            await referralService.recordBonusForReferer(userId, user.referredByCode, { type: 'diamond', quantity: achievementReward.diamond });
        }

        await recordActivityLog({
            gameId: user.gameId,
            telegramId: user.telegramId,
            action: ACTION.CLAIM_ACHIEVEMENT,
            diamond: achievementReward.diamond,
            seya: achievementReward.seya,
            onchainSei: achievementReward.onchainSei,
            achivementName: userAchievement.description,
            cfgAchievementId: userAchievement.achievementId,
            details: JSON.stringify(achievementReward),
        });

        return { userAchievement, reward };
    } catch (error) {
        await redisHelper.del(`lock:user_achievement:${userAchievementId.toString()}`);
        throw error;
    }
};
