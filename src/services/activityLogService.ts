import mongoose from 'mongoose';
import ActivityLog, { IActivityLog } from '../models/activityLog';

export const ACTION = {
    UNLOCK_LAND: 'unlockLand',
    UNLOCK_TREE: 'unlockTree',
    HARVEST_CROP: 'harvestCrop',

    BUY_SHOP_ITEM: 'buyShopItem',
    BUY_SUB: 'buySubscription',
    CLAIM_DAILY_SUB: 'claimDailySubscription',

    IDLE_FARMING_BONUS: 'openIdleFarmingBonus',
    CLAIM_IDLE_FARMING: 'claimIdleFarming',
    CLAIM_IDLE_FARMING_BY_AD: 'claimIdleFarmingByAd',

    CHECKIN_ONCHAIN: 'checkinOnchain',

    UPGRADE_HQ: 'upgradeHQ',
    UPGRADE_HQ_INSTANT: 'instantUpgradeHQ',

    CLAIM_ACHIEVEMENT: 'claimAchievement',
    CLAIM_QUEST: 'claimQuest',

    OPEN_SELL_ITEM: 'openOrSellItem',

    CLAIM_REF_BONUS: 'claimRefBonus',
    CONVERT_INGAME_SEI: 'convertIngameSei',

    CLAIM_BADGE: 'claimBadge',

    SPIN_MINIGAME: 'spinMinigame',

    BUY_BOOST: 'buyBoost',
    GET_FREE_BOOST_BY_AD: 'getFreeBoostByAd',

    STAKE_POOL: 'stakePool',
    UNSTAKE_POOL: 'unstakePool',
    CLAIM_POOL: 'claimPool',
};

export const recordActivityLog = async (param: {
    gameId: number;
    telegramId: string;
    action: string;

    status?: string;

    gold?: number;
    sei?: number;
    diamond?: number;
    seya?: number;
    onchainSei?: number;
    quantity?: number;

    landSlot?: number;
    cfgLandId?: mongoose.Types.ObjectId;

    treeName?: string;
    cfgTreeId?: mongoose.Types.ObjectId;

    shopItemName?: string;
    cfgShopItemId?: mongoose.Types.ObjectId;

    subName?: string;
    cfgSubscriptionId?: mongoose.Types.ObjectId;

    questName?: string;
    cfgQuestId?: mongoose.Types.ObjectId;

    achivementName?: string;
    cfgAchievementId?: mongoose.Types.ObjectId;

    hqLevel?: number;

    itemType?: string;
    itemLevel?: number;

    details?: string; // Optional details about the action
    detailsObj?: object; // Optional details about the action

    country?: string; // Country of the user (if available)
    city?: string; // City of the user (if available)
}): Promise<IActivityLog> => {
    const log: IActivityLog = new ActivityLog({
        gameId: param.gameId,
        telegramId: param.telegramId,
        action: param.action,
        status: param.status,

        gold: param.gold,
        sei: param.sei,
        diamond: param.diamond,
        seya: param.seya,
        onchainSei: param.onchainSei,
        quantity: param.quantity,

        landSlot: param.landSlot,
        cfgLand: param.cfgLandId,

        treeName: param.treeName,
        cfgTree: param.cfgTreeId,

        shopItemName: param.shopItemName,
        cfgShopItem: param.cfgShopItemId,

        subName: param.subName,
        cfgSubscription: param.cfgSubscriptionId,

        questName: param.questName,
        cfgQuest: param.cfgQuestId,

        achivementName: param.achivementName,
        cfgAchievement: param.cfgAchievementId,

        hqLevel: param.hqLevel,

        itemType: param.itemType,
        itemLevel: param.itemLevel,

        details: param.details,
        detailsObj: param.detailsObj,

        country: param.country,
        city: param.city,
    });

    await log.save();

    return log;
};
