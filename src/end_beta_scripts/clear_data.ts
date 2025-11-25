import activityLog from '../models/activityLog';
import CfgShopItem, { ICfgShopItem } from '../models/cfgShopItem';
import cfgSubscription, { ICfgSubscription } from '../models/cfgSubscription';
import user, { IUser } from '../models/user';
import userAchievement from '../models/userAchievement';
import userInventory from '../models/userInventory';
import userLand from '../models/userLand';
import userQuest from '../models/userQuest';
import userSubcription, { IUserSubscription } from '../models/userSubcription';
import userTree from '../models/userTree';
import { ACTION } from '../services/activityLogService';
import { balanceService } from '../services/balanceService';
import logger from '../utils/logger';
import * as inventoryService from '../services/inventoryService';
import connectDB from '../io/db';
import { redisCommands } from '../io/redis';
import idleFarming from '../models/idleFarming';
import referral from '../models/referral';

const cheatedUserIds = [
    '6892324837',
    '1010117804',
    '6931567004',
    '6860567488',
    '6671396015',
    '6339685499',
    '7472528816',
    '6831085410',
    '6485907736',

    '6671396015',
    '7472528816',
    '6892324837',
    '6882214392',
    '6485907736',
    '6831085410',
    '6550374931',
    '6860567488',
    '1010117804',
    '6333367656',
    '6339685499'
]

export const wipeBetaData = async () => {
    await connectDB('Wipe beta');

    // Reset user data: gold, diamond, hq, level,
    logger.info(`[users] Start reset users`);
    try {
        await user.updateMany(
            {},
            {
                // reset login count
                lastActiveAt: null,
                loginCount: 0,

                // checkinOnchainCount: 0, // keep checkin count as before
                // lastOnchainCheckinAt: null,

                // reset balance gold, diamond
                gold: 0,
                diamond: 0,
                seya: 0,
                // keep user sei, seya, spent sei

                level: 1,
                totalEarnedGold: 0,
                exp: 0,
                expForNextLevel: 15,

                // reset hq
                headquarter: {
                    level: 1,
                    isUpgrading: false,
                    upgradeStartTime: null,
                    upgradeEndTime: null,
                    nextUpgradeTimeSecond: 10,
                    nextUpgradeFeeDiamond: 100,
                },

                // reset referral bonus diamond
                'referralBonus.totalDiamond': 0,
                'referralBonus.claimedDiamond': 0,
            },
        );
    } catch (error) {
        logger.error(`[users] Error reset users:`, error);
    }
    logger.info(`[users] Finished reset users`);

    // Reset referral bonus diamond
    logger.info(`[referral] Started reset user referall bonus diamond`);
    try {
        // reset diamond bonus to 0
        await referral.updateMany({}, { bonusDiamond: 0 });
    } catch (error) {
        logger.error(`[referral] Error reset referral: `, error);
    }
    logger.info(`[referral] Finished reset referral`);

    // Reset user inventories: lucky_chest level =1, otherwise remove all
    logger.info(`[user_inventories] Started reset user inventories`);
    try {
        // reset lucky chest level to 1
        await userInventory.updateMany({ itemType: 'lucky_chest' }, { itemLevel: 1, quantity: 0 });
        // delete dragon chest, dragon ball from 1 -> 7
        await userInventory.deleteMany({ itemType: 'dragon_chest' });
        await userInventory.deleteMany({ itemType: 'dragon_ball', itemLevel: 1 });
        await userInventory.deleteMany({ itemType: 'dragon_ball', itemLevel: 2 });
        await userInventory.deleteMany({ itemType: 'dragon_ball', itemLevel: 3 });
        await userInventory.deleteMany({ itemType: 'dragon_ball', itemLevel: 4 });
        await userInventory.deleteMany({ itemType: 'dragon_ball', itemLevel: 5 });
        await userInventory.deleteMany({ itemType: 'dragon_ball', itemLevel: 6 });

        // delete dragon_ball of cheated users
        await userInventory.deleteMany({ userId: {$in: cheatedUserIds}})
    } catch (error) {
        logger.error(`[user_inventories] Error reset user inventories: `, error);
    }
    logger.info(`[user_inventories] Finished reset user inventories`);

    // Reset quests
    logger.info(`[user_quests] Started reset user quests`);
    try {
        await userQuest.deleteMany({});
    } catch (error) {
        logger.error(`[user_quests] Error reset user quests: `, error);
    }
    logger.info(`[user_quests] Finished reset user quests`);

    // Remove all achievements, user re-claim later
    logger.info(`[user_achievement] Started reset user achievements`);
    try {
        await userAchievement.deleteMany({});
    } catch (error) {
        logger.error(`[user_achievement] Error reset user achievements: `, error);
    }
    logger.info(`[user_achievement] Finished reset user achievements`);

    // Reset user lands: remove crops on land
    logger.info(`[user_land] Started reset user lands`);
    try {
        await userLand.updateMany({}, { crop: null });
    } catch (error) {
        logger.error(`[user_land] Error reset user lands: `, error);
    }
    logger.info(`[user_land] Finished reset user lands`);

    // Reset user trees: remove free tree > level 1, reset crop
    logger.info(`[user_tree] Started reset user trees`);
    try {
        await userTree.deleteMany({ treeName: { $in: ['Bulmango', 'Trunkon', 'Friezo', 'Cellmon', 'Majiboo'] } });
        await userTree.updateMany({}, { isInCrop: false, producedCrops: 0 });
    } catch (error) {
        logger.error(`[user_tree] Error reset user trees: `, error);
    }
    logger.info(`[user_tree] Finished reset user trees`);

    // Reset idle farming:
    const idleStartTime = new Date('2024-11-04');
    logger.info(`[user_idle_farming] Started reset user idle farmings`);
    try {
        await idleFarming.updateMany(
            {},
            {
                startTime: idleStartTime,
                endTime: new Date(idleStartTime.getTime() + 120 * 60 * 1000),
                maxTimeMinute: 120,
                gold: 40000,
                chest: 20,
                claimed: false,
            },
        );
    } catch (error) {
        logger.error(`[user_idle_farming] Error reset user idle farmings: `, error);
    }
    logger.info(`[user_idle_farming] Finished reset user idle farmings`);

    // Reset shop and subs
    logger.info(`[user_subscriptions] Started reset user subscriptions`);
    await userSubcription.deleteMany({});

    const subStartTime = new Date('2024-11-04');
    const userSubActivityLogs = await activityLog.find({ action: ACTION.BUY_SUB, status: 'ok' });
    for (const log of userSubActivityLogs) {
        try {
            const telegramId = log.telegramId;
            const subscriptionId = log.cfgSubscription;

            const cfgSub: ICfgSubscription | null = await cfgSubscription.findOne({ _id: subscriptionId }).exec();
            if (!cfgSub) {
                throw new Error('cfgSubscription not found');
            }
            const previousSameTypeSub: IUserSubscription | null = await userSubcription
                .findOne({ userId: telegramId, type: cfgSub.type })
                .populate('subscription')
                .exec();

            if (previousSameTypeSub) {
                // Extend subscription if user has one before
                previousSameTypeSub.day += cfgSub.subsTimeDay;
                previousSameTypeSub.endTime = new Date(previousSameTypeSub.endTime.getTime() + cfgSub.subsTimeDay * 24 * 60 * 60 * 1000);
                previousSameTypeSub.purchasedAt = subStartTime;

                await previousSameTypeSub.save();
                continue;
            }

            // Start a new subscription
            const endTime = new Date(subStartTime.getTime() + cfgSub.subsTimeDay * 24 * 60 * 60 * 1000);
            const newSubs: IUserSubscription = new userSubcription({
                userId: telegramId,
                subscription: cfgSub,
                type: cfgSub.type,
                name: cfgSub.name,
                day: cfgSub.subsTimeDay,
                startTime: subStartTime,
                endTime: endTime,
                purchasedAt: subStartTime,
            });
            await newSubs.save();

            // add first purchase reward

            const firstPurchaseReward = {
                gold: 0,
                diamond: 0,
                seya: 0,
            };
            if (!previousSameTypeSub) {
                for (const reward of cfgSub.firstPurchaseReward) {
                    if (reward.type == 'gold') {
                        firstPurchaseReward.gold += reward.quantity;
                    } else if (reward.type == 'diamond') {
                        firstPurchaseReward.diamond += reward.quantity;
                    } else if (reward.type == 'seya') {
                        firstPurchaseReward.seya += reward.quantity;
                    }
                }
            }
            await balanceService.addUserBalance(telegramId, firstPurchaseReward);
        } catch (error) {
            logger.error(`[user_subscriptions] Error reset subscription user ${log.telegramId}, sub ${log.cfgSubscription}:`, error);
        }
    }
    logger.info(`[user_subscriptions] Finished reset user subscriptions`);

    logger.info(`[user_shop_items] Started reset user shop items`);
    const userShopLogs = await activityLog.find({ action: ACTION.BUY_SHOP_ITEM, status: 'ok' });
    for (const log of userShopLogs) {
        try {
            const telegramId = log.telegramId;
            const itemId = log.cfgShopItem;

            const shopItem: ICfgShopItem | null = await CfgShopItem.findOne({ _id: itemId }).exec();
            if (!shopItem) {
                throw new Error('cfgShopItem not found');
            }

            if (shopItem.type === 'diamond') {
                let diamondAmount = shopItem.quantity;
                await balanceService.addUserBalance(telegramId, { diamond: diamondAmount });
            } else if (shopItem.type === 'dragon_chest') {
                let chestAmount = shopItem.quantity;
                await inventoryService.addUserItem(telegramId, 'dragon_chest', 0, chestAmount);
            }
        } catch (error) {
            logger.error(`[user_shop_items] Error reset shop item for user ${log.telegramId}, sub ${log.cfgSubscription}:`, error);
        }
    }
    logger.info(`[user_shop_items] Finished reset user shop item`);

    // Reset
    logger.info(`[user_x3_bonus_idle] Started reset user idle bonus`);
    const userClaimx3Logs = await activityLog.find({ action: ACTION.IDLE_FARMING_BONUS, status: 'ok', sei: { $lt: 0 } });
    for (const log of userClaimx3Logs) {
        try {
            const telegramId = log.telegramId;
            const convertedSei = log.sei != null && log.sei != undefined ? -log.sei : 0;
            if (convertedSei <= 0) {
                throw new Error(`Error activity log, claim idle bonus but no sei paid: log id ${log._id}`);
            }

            await balanceService.addUserBalance(telegramId, { sei: convertedSei });
        } catch (error) {
            logger.error(`[user_x3_bonus_idle] Error reset idle bonus sei: `, error);
        }
    }
    logger.info(`[user_x3_bonus_idle] Finished reset user idle bonus`);

    // Flush all redis cache
    logger.info(`[redis] Flushed all redis`);
    redisCommands.flushdb();
    logger.info(`[redis] Finished flushed all redis`);

    logger.info(`DONEEEEE ! Ctrl-C to exit ... `);
    // TODO: Before wipe, bot should be stopped, and start after wipe
};

wipeBetaData();
