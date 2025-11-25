import BotBehavior, { IBotBehavior } from '../models/botBehavior';
import BotActionLog from '../models/botActionLog';
import { checkin, purchase } from '../libs/seichain';
import Land, { ICfgLand } from '../models/cfgLand';
import UserLand, { IUserLand } from '../models/userLand';
import Tree, { ICfgTree } from '../models/cfgTree';
import UserTree, { IUserTree } from '../models/userTree';
import { REDIS_KEYS, redisCommands } from '../io/redis';
import { balanceService } from './balanceService';
import { getRandomInRange, getTodayTimeEnd } from '../utils/common';
import idleFarming from '../models/idleFarming';
import { VALID_NPC, harvestIdleFarming, harvestIdleFarmingByAd, startIdleFarming } from './idleFarmingService';
import { addUserItem, consumeUserItem, upgradeUserItem } from './inventoryService';
import cfgSubscription, { ICfgSubscription } from '../models/cfgSubscription';
import userSubcription, { IUserSubscription } from '../models/userSubcription';
import mongoose from 'mongoose';
import { purchaseSubscription } from './subscriptionService';
import { convertIngameSei, upgradeHQ } from './userService';
import logger from '../utils/logger';
import { IUserAchievement } from '../models/userAchievement';
import * as achievementService from '../services/achievementService';
import user, { IUser } from '../models/user';

const isProduction = process.env.NODE_ENV === 'production';
const CHECKIN_SEI_PRICE = 0.0001;

// Daily check-in
export const performDailyCheckin = async (botConfig: IBotBehavior) => {
    try {
        // logger.info(`[daily_checkin] Performing daily check-in for bot with telegramId: ${botConfig.telegramId}`);

        // If in development mode, simulate the check-in action with mock behavior
        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'local') {
            logger.info(`[daily_checkin] Mock environment detected. Simulating daily check-in for bot ${botConfig.telegramId}`);

            // Log the mock action
            await BotActionLog.create({
                telegramId: botConfig.telegramId,
                action: 'dailyCheckin',
                timestamp: new Date(),
                details: {
                    amount: CHECKIN_SEI_PRICE.toString(),
                    recipientAddress: 'MOCK_ADDRESS',
                    status: 'success',
                },
            });

            logger.info(`[daily_checkin] Mock daily check-in completed for bot with telegramId: ${botConfig.telegramId}`);
            return;
        }

        // Check in
        let receipt;
        try {
            receipt = await checkin(botConfig.privateKey as string, CHECKIN_SEI_PRICE);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
            // Log the failed action due to invalid mnemonics or balance error
            await BotActionLog.create({
                telegramId: botConfig.telegramId,
                action: 'dailyCheckin',
                timestamp: new Date(),
                details: {
                    status: 'failed',
                    error: errorMessage,
                },
            });
            logger.error(`[daily_checkin] Error when performing checkin tx for bot ${botConfig.telegramId}:`, error);
            return;
        }

        // Validate transaction receipt
        if (receipt?.status !== 1) {
            const receiptDetails = JSON.stringify(receipt);
            await BotActionLog.create({
                telegramId: botConfig.telegramId,
                action: 'dailyCheckin',
                timestamp: new Date(),
                details: {
                    status: 'failed',
                    error: `Transaction failed: ${receiptDetails}`,
                },
            });
            logger.error(`[daily_checkin] Error when performing checkin tx for bot ${botConfig.telegramId}:`, receiptDetails);
        }

        // Log the successful action
        await BotActionLog.create({
            telegramId: botConfig.telegramId,
            action: 'dailyCheckin',
            timestamp: new Date(),
            details: {
                amount: CHECKIN_SEI_PRICE.toString(),
                status: 'success',
                receipt: JSON.stringify(receipt),
            },
        });

        logger.info(`[daily_checkin] Daily check-in completed for bot with telegramId: ${botConfig.telegramId}`);
    } catch (error) {
        logger.error(`[daily_checkin] Error performing daily check-in for bot with telegramId: ${botConfig.telegramId}: ${error}`);
    }
};

// Buy land + tree
const MAX_SLOT = 9;
const validateSlotToUnlock = (userLands: IUserLand[], slot: number) => {
    if (slot <= 0) {
        throw new Error('Invalid slot <= 0');
    }
    if (slot > MAX_SLOT) {
        throw new Error('Invalid slot > 9');
    }

    let maxCurrentSlot = 0;
    for (let i = 0; i < userLands.length; i++) {
        if (maxCurrentSlot < userLands[i].slot) {
            maxCurrentSlot = userLands[i].slot;
        }
    }
    if (slot <= maxCurrentSlot) {
        throw new Error('Slot is already unlocked');
    }
    if (slot > maxCurrentSlot + 1) {
        throw new Error('Slot needs to be unlocked in sequence, the next valid slot is ' + (maxCurrentSlot + 1));
    }
};

export const performBuyLand = async (botConfig: IBotBehavior, slot: number) => {
    try {
        // logger.info(`[buy_land] Start buy land ${slot} for bot with telegramId: ${botConfig.telegramId}`);
        // Fetch the configured land
        const cfgLand: ICfgLand | null = await Land.findOne({ slot }).exec();
        if (!cfgLand) {
            throw new Error('Configured land not found: ' + slot);
        }

        // Fetch user lands and validate the slot
        const userLands: IUserLand[] = await UserLand.find({ userId: botConfig.telegramId }).exec();
        if (userLands.length === 0) {
            throw new Error('User lands not found, this might be due to not being onboarded yet.');
        }
        validateSlotToUnlock(userLands, slot);

        // If in development mode, simulate the check-in action with mock behavior
        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'local') {
            logger.info(`[buy_land] Mock environment detected. Simulating buy land for bot ${botConfig.telegramId}`);

            // Unlock the land for the user
            const newUserLand = new UserLand({
                userId: botConfig.telegramId,
                land: cfgLand,
                slot: cfgLand.slot,
                crop: null,
                unlocked: true,
            });
            await newUserLand.save();

            // Log the mock action
            await BotActionLog.create({
                telegramId: botConfig.telegramId,
                action: 'buyLand',
                timestamp: new Date(),
                details: {
                    amount: cfgLand.seiPrice.toString(),
                    status: 'success',
                    land: slot,
                },
            });

            logger.info(`[buy_land] Mock buy land completed for bot with telegramId: ${botConfig.telegramId}`);
            return;
        }

        // Attempt to make the purchase
        let receipt;
        try {
            receipt = await purchase(botConfig.privateKey as string, cfgLand.seiPrice);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
            throw new Error(`Error when performing buy land for bot ${botConfig.telegramId}: ${errorMessage}`);
        }

        // Check if the receipt indicates a successful transaction
        if (receipt?.status === 1) {
            // Continue processing
        } else {
            const receiptDetails = receipt ? JSON.stringify(receipt) : 'No receipt';
            throw new Error(`Tx failed buy land for bot ${botConfig.telegramId}: ${receiptDetails}`);
        }

        // Unlock the land for the user
        const newUserLand = new UserLand({
            userId: botConfig.telegramId,
            land: cfgLand,
            slot: cfgLand.slot,
            crop: null,
            unlocked: true,
        });
        await newUserLand.save();

        // Log the successful action
        await BotActionLog.create({
            telegramId: botConfig.telegramId,
            action: 'buyLand',
            timestamp: new Date(),
            details: {
                amount: cfgLand.seiPrice.toString(),
                status: 'success',
                receipt: JSON.stringify(receipt),
                land: slot,
            },
        });

        logger.info(`[buy_land] Completed buy land ${slot} for bot with telegramId: ${botConfig.telegramId}`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
        await BotActionLog.create({
            telegramId: botConfig.telegramId,
            action: 'buyLand',
            timestamp: new Date(),
            details: {
                status: 'failed',
                error: errorMessage,
                land: slot,
            },
        });
        logger.error(`[buy_land] Error`, error);
    }
};

export const performBuyTree = async (botConfig: IBotBehavior, slot: number) => {
    const treeBySlot: { [key: number]: string } = {
        7: 'Kakuro',
        8: 'Gohberry',
        9: 'Chichiapple',
    };

    try {
        if (slot < 7 || slot > MAX_SLOT) {
            return;
        }
        const treeName = treeBySlot[slot];
        // logger.info(`[buy_tree] Start buy tree ${slot}|${treeName} for bot with telegramId: ${botConfig.telegramId}`);
        const cfgLand: ICfgLand | null = await Land.findOne({ slot }).exec();
        if (!cfgLand) {
            throw new Error(`This user needs to buy slot ${slot} before buy tree ${slot}`);
        }

        const cfgTree: ICfgTree | null = await Tree.findOne({ name: treeName }).exec();
        if (!cfgTree) {
            throw new Error('Configured tree not found: ' + slot);
        }
        const userTree: IUserTree | null = await UserTree.findOne({ userId: botConfig.telegramId, treeName }).exec();
        if (userTree) {
            throw new Error('Bot already have this tree');
        }

        // If in development mode, simulate the check-in action with mock behavior
        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'local') {
            logger.info(`[buy_tree] Mock environment detected. Simulating buy tree ${slot}|${treeName} for bot ${botConfig.telegramId}`);

            // Unlock the new tree for the user
            const newUserTree: IUserTree = new UserTree({
                userId: botConfig.telegramId,
                tree: cfgTree,
                treeName: cfgTree.name,
                unlocked: true,
            });
            await newUserTree.save();

            // Log the mock action
            await BotActionLog.create({
                telegramId: botConfig.telegramId,
                action: 'buyTree',
                timestamp: new Date(),
                details: {
                    amount: cfgTree.seiPrice.toString(),
                    status: 'success',
                    tree: slot,
                },
            });

            logger.info(`[buy_tree] Mock buy tree ${slot}|${treeName} completed for bot with telegramId: ${botConfig.telegramId}`);
            return;
        }

        // Attempt to make the purchase
        let receipt;
        try {
            receipt = await purchase(botConfig.privateKey as string, cfgTree.seiPrice);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
            throw new Error(`Error when performing buy tree ${slot}|${treeName} for bot ${botConfig.telegramId}: ${errorMessage}`);
        }

        // Check if the receipt indicates a successful transaction
        if (receipt?.status === 1) {
            // Continue processing
        } else {
            const receiptDetails = receipt ? JSON.stringify(receipt) : 'No receipt';
            throw new Error(`Tx failed buy tree for bot ${botConfig.telegramId}: ${receiptDetails}`);
        }

        // Unlock the new tree for the user
        const newUserTree: IUserTree = new UserTree({
            userId: botConfig.telegramId,
            tree: cfgTree,
            treeName: cfgTree.name,
            unlocked: true,
        });
        await newUserTree.save();

        // Log the successful action
        await BotActionLog.create({
            telegramId: botConfig.telegramId,
            action: 'buyTree',
            timestamp: new Date(),
            details: {
                amount: cfgTree.seiPrice.toString(),
                status: 'success',
                receipt: JSON.stringify(receipt),
                tree: slot,
            },
        });

        logger.info(`[buy_tree] Completed buy tree ${slot}|${treeName} for bot with telegramId: ${botConfig.telegramId}`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
        await BotActionLog.create({
            telegramId: botConfig.telegramId,
            action: 'buyTree',
            timestamp: new Date(),
            details: {
                status: 'failed',
                error: errorMessage,
                tree: slot,
            },
        });
        logger.error(`[buy_tree] Error`, error);
    }
};

// Earn Gold
export const EARN_GOLD_RANDOM_TIMEOUT = isProduction ? 10 * 60 * 1000 : 1 * 60 * 1000;
export const SPEED_EARN_GOLD_RANDOM_TIMEOUT = isProduction ? 30 * 60 * 1000 : 1 * 60 * 1000;
export const performEarnGold = async (botConfig: IBotBehavior): Promise<{ nextSchedule: number }> => {
    return await performEarnGoldBySpeed(botConfig);
};

export const performEarnGoldBySpeed = async (botConfig: IBotBehavior): Promise<{ nextSchedule: number }> => {
    try {
        const speed = botConfig.behaviors.earnGold.speed || 1;

        const now = new Date();
        const todayDateStr = now.toISOString().split('T')[0];

        const earnedGold = {
            lucky_chest: 0,
            claim_ad: 0,
            claim_ad_npc: 0,
            idle: 0,
        };

        // Migrate lucky chest
        try {
            // mock 1 lucky chest for harvest tree
            await addUserItem(botConfig.telegramId, 'lucky_chest', 0, 1);
            while (true) {
                await upgradeUserItem(botConfig.telegramId, 'lucky_chest');
            }
        } catch (error) {}

        // Get idle farming
        const idleFarm = await idleFarming.findOne({ userId: botConfig.telegramId }).exec();
        if (!idleFarm) {
            const newIdleFarm = await startIdleFarming(botConfig.telegramId, null);
            if (!newIdleFarm) {
                throw new Error(`Error start idle farming for bot telegramID ${botConfig.telegramId}`);
            }

            const scheduledTimeout = newIdleFarm.endTime.getTime() - now.getTime();
            return { nextSchedule: scheduledTimeout };
        }

        // Claim idle by ad
        try {
            if (Math.random() < speed / 10 / 10) {
                const { reward } = await harvestIdleFarmingByAd(botConfig.telegramId, true, '');
                for (const r of reward) {
                    if (r.type == 'gold') {
                        earnedGold.claim_ad += r.quantity;
                    }
                }
            }
        } catch (error) {}

        // Cliaim idle by npc
        for (const npc of VALID_NPC) {
            try {
                if (Math.random() < speed / 10 / 10) {
                    const { reward } = await harvestIdleFarmingByAd(botConfig.telegramId, false, npc);
                    for (const r of reward) {
                        if (r.type == 'gold') {
                            earnedGold.claim_ad_npc += r.quantity;
                        }
                    }
                }
            } catch (error) {}
        }

        // Claim idle
        try {
            // Claim idle farming ad
            const MAX_DELAY = 8 * 60 * 60 * 1000; // 8 hour
            let delayTimeBySpeed = 0;
            if (speed < 10) {
                delayTimeBySpeed = (1 / speed) * MAX_DELAY;
            }

            if (idleFarm.endTime.getTime() + delayTimeBySpeed < new Date().getTime()) {
                const paidBySei = false;
                const { reward } = await harvestIdleFarming(botConfig.telegramId, paidBySei);
                for (const r of reward) {
                    if (r.type == 'gold') {
                        earnedGold.idle += r.quantity;
                    }
                }
            }
        } catch (error) {
            logger.error(`Error harvest idle farming for bot telegramid ${botConfig.telegramId}`, error);
        }

        // Open lucky chest
        try {
            const { reward } = await consumeUserItem(botConfig.telegramId, 'lucky_chest', 0, 0, true);
            for (const r of reward) {
                if (r.type == 'gold') {
                    earnedGold.lucky_chest += r.quantity;
                }
            }
        } catch (error) {
            logger.error(`Error open lucky chest for bot telegramid ${botConfig.telegramId}`, error);
        }

        const totalGold = earnedGold.claim_ad + earnedGold.claim_ad_npc + earnedGold.idle + earnedGold.lucky_chest;
        const todayEarnedGold = await redisCommands.incrby(REDIS_KEYS.EARN_GOLD_EXECUTED(botConfig.telegramId, todayDateStr), totalGold);

        // logger.info(
        //     `[earn_gold] Earned ${totalGold} gold ${JSON.stringify(earnedGold)} for bot ${botConfig.telegramId}. Current: ${todayEarnedGold} gold for ${todayDateStr}`,
        // );

        // the larger speed, the less waiting time
        const scheduledTimeout = Math.round((SPEED_EARN_GOLD_RANDOM_TIMEOUT / 10) * (11 - speed) * (1 + Math.abs(Math.random() - 1)));
        if (scheduledTimeout) {
            return { nextSchedule: new Date().getTime() + scheduledTimeout };
        } else {
            return { nextSchedule: 0 };
        }
    } catch (error) {
        logger.error(`[earn_gold] Error when performing earn gold by speed bot telegramId ${botConfig.telegramId}`, error);
        return { nextSchedule: 0 };
    }
};

// Buy subscription
export const performBuySubscription = async (botConfig: IBotBehavior) => {
    try {
        const cfgSubscriptions: ICfgSubscription[] = await cfgSubscription.find({ subsTimeDay: 7, active: true });
        if (cfgSubscription.length == 0) {
            throw new Error('No cfg subcription found');
        }

        for (const cfgSubscription of cfgSubscriptions) {
            let matchConfig = false;

            if (cfgSubscription.type == 'no_ads' && cfgSubscription.subsTimeDay == 7 && botConfig.behaviors.buySubscription.noAds7d) {
                matchConfig = true;
            } else if (cfgSubscription.type == 'basic_daily_reward' && botConfig.behaviors.buySubscription.basic7d) {
                matchConfig = true;
            }
            if (!matchConfig) {
                continue;
            }

            try {
                await purchaseSubscription(botConfig.telegramId, cfgSubscription._id.toString());

                logger.info(`[buy_subscription] Completed buy subscription ${cfgSubscription.type} for bot with telegramId: ${botConfig.telegramId}`);
            } catch (error) {
                logger.error(
                    `[buy_subscription] Error performing buy subscription ${cfgSubscription.type} for bot telegramId ${botConfig.telegramId}`,
                    error,
                );
            }
        }
    } catch (error) {
        logger.error(`[buy_subscription] Error performing buy subscription for bot telegramId ${botConfig.telegramId}`, error);
    }
};

// Upgrade HQ
export const performUpgradeHQ = async (botConfig: IBotBehavior) => {
    try {
        // Open lucky chest
        try {
            await consumeUserItem(botConfig.telegramId, 'lucky_chest', 0, 0, true);
        } catch (error) {}
        // Open dragon chest
        try {
            await consumeUserItem(botConfig.telegramId, 'dragon_chest', 0, 0, true);
        } catch (error) {}
        // Open dragon ball
        for (let lvl = 1; lvl <= 6; lvl++) {
            try {
                await consumeUserItem(botConfig.telegramId, 'dragon_ball', lvl, 0, true);
            } catch (error) {}
        }

        try {
            const botUser: IUser | null = await user.findOne({ telegramId: botConfig.telegramId }).exec();
            if (!botUser) {
                return;
            }
            if (botUser.diamond < botUser.headquarter.nextUpgradeFeeDiamond) {
                return;
            }
            await upgradeHQ(botConfig.telegramId, 'init', 'diamond');

            // logger.info(`[upgrade_hq] Completed start upgrade HQ for bot with telegramId: ${botConfig.telegramId}`);
        } catch (error) {
            logger.error(`[upgrade_hq] Error performing upgrade HQ for bot telegramId ${botConfig.telegramId}`, error);
        }
    } catch (error) {
        logger.error(`[upgrade_hq] Error performing upgrade HQ for bot telegramId ${botConfig.telegramId}`, error);
    }
};

// Claim achieve
export const performClaimSeiAchieve = async (botConfig: IBotBehavior) => {
    const botUser: IUser | null = await user.findOne({ telegramId: botConfig.telegramId }).exec();
    if (!botUser) {
        return;
    }

    botUser.loginCount = 10;
    botUser.checkinOnchainCount = 10;
    await botUser.save();

    const botAchievements: IUserAchievement[] = await achievementService.getAchievements(botConfig.telegramId);
    for (const achieve of botAchievements) {
        if (achieve.tasks[0].type == 'checkin_onchain_10d' || achieve.tasks[0].type == 'login_10d') {
            if (!achieve.rewardClaimed) {
                await achievementService.claimAchievementReward(botConfig.telegramId, achieve._id);
            }
        }
    }
};

// withdraw sei
export const performWithdrawSei = async (botConfig: IBotBehavior) => {
    const botUser: IUser | null = await user.findOne({ telegramId: botConfig.telegramId }).exec();
    if (!botUser) {
        return;
    }

    botUser.sei = getRandomInRange(1, 15).toFixed(1);
    await botUser.save();

    await convertIngameSei(botUser.telegramId);

    botConfig.withdrewSei = botUser.sei;
    await botConfig.save();

    logger.info(`[withdraw_sei] Withdrawing SEI successfully for bot with telegramId ${botConfig.telegramId}: ${botUser.sei} $SEI`);
};
