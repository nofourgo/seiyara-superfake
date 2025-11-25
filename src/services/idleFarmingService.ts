import User, { IUser } from '../models/user';
import IdleFarming, { IIdleFarming } from '../models/idleFarming';
import * as inventoryService from './inventoryService';
import { IReward } from '../models/cfgReward';
import UserInventory, { IUserInventory } from '../models/userInventory';
import { ILuckyChest } from '../models/cfgItem';
import { getLuckyChestProp } from '../utils/const';
import { getRandomInRange } from '../utils/common';
import * as redis from '../services/redis';
import * as referralService from '../services/referralService';

import { redisCommands, redisHelper } from '../io/redis';
import { ACTION, recordActivityLog } from './activityLogService';
import { purchase } from '../libs/seichain';
import { decryptData } from '../utils/encryption';
import { balanceService } from './balanceService';

const AD_CLAIMED_DURATION_MINUTE = 60;
const MAX_AD_CLAIM = 3;
const AD_CLAIMED_COUNT_DOWN_MINUTE = 5;
const BONUS_SEI_PRICE = 1;
const BONUS_RATE = 3;
export const VALID_NPC = ['GreenPig', 'Tamporine', 'Vegeta', 'JunglePig', 'Puar', 'Son', 'Ball', 'BabyShark'];

const USER_AD_CLAIM_COUNT_KEY = (userId: string, todayFirstTs: number) => `idle_claim_by_ad:${userId}_${todayFirstTs}`;
const USER_LAST_AD_CLAIM_TIME_KEY = (userId: string) => `idle_claim_by_ad_last_time:${userId}`;

const USER_NPC_AD_CLAIM_COUNT_KEY = (userId: string, npc: string, todayFirstTs: number) => `idle_claim_by_npc:${userId}_${npc}_${todayFirstTs}`;
const USER_NPC_LAST_AD_CLAIM_TIME_KEY = (userId: string, npc: string) => `idle_claim_by_npc_last_time:${userId}_${npc}`;

const incrTodayClaimByAdCount = async (userId: string, byAd: boolean, byNPC: string): Promise<number> => {
    const todayFirstTs = new Date().setHours(0, 0, 0, 0);
    const countKey = byAd ? USER_AD_CLAIM_COUNT_KEY(userId, todayFirstTs) : USER_NPC_AD_CLAIM_COUNT_KEY(userId, byNPC, todayFirstTs);
    const count = await redisCommands.incr(countKey);
    await redisCommands.expire(countKey, 24 * 60 * 60);
    return count;
};

const getLastClaimByAdTime = async (userId: string, byAd: boolean, byNPC: string): Promise<Date | null> => {
    const lastTimeKey = byAd ? USER_LAST_AD_CLAIM_TIME_KEY(userId) : USER_NPC_LAST_AD_CLAIM_TIME_KEY(userId, byNPC);
    const lastTimeStr = await redisCommands.get(lastTimeKey);
    if (!lastTimeStr) {
        return null;
    }
    return new Date(parseInt(lastTimeStr));
};

const setLastClaimByAdTime = async (userId: string, byAd: boolean, byNPC: string) => {
    const lastTimeKey = byAd ? USER_LAST_AD_CLAIM_TIME_KEY(userId) : USER_NPC_LAST_AD_CLAIM_TIME_KEY(userId, byNPC);
    await redisHelper.set(lastTimeKey, new Date().getTime().toString(), { ex: 24 * 60 * 60 });
};

export const getCurrentFarming = async (telegramId: string) => {
    const existedFarm: IIdleFarming | null = await IdleFarming.findOne({ userId: telegramId }).exec();
    if (!existedFarm) {
        throw new Error('No farming found');
    }

    const countValue = await redisCommands.get(USER_AD_CLAIM_COUNT_KEY(telegramId, new Date().setHours(0, 0, 0, 0)));
    const todayClaimByAdCount = countValue && countValue.length > 0 ? parseInt(countValue) : 0;
    const todayLastClaimTime = await getLastClaimByAdTime(telegramId, true, '');

    return {
        ...existedFarm.toObject(),
        todayClaimByAdCount: todayClaimByAdCount,
        lastClaimByAdTime: todayLastClaimTime,
    };
};

export const getCurrentAdStatusByNpc = async (telegramId: string, npc: string) => {
    if (!VALID_NPC.includes(npc)) {
        throw new Error(`NPC ${npc} not found`);
    }

    const countValue = await redisCommands.get(USER_NPC_AD_CLAIM_COUNT_KEY(telegramId, npc, new Date().setHours(0, 0, 0, 0)));
    const todayClaimed = countValue && countValue.length > 0 ? parseInt(countValue) : 0;
    const todayLastClaimTime = await getLastClaimByAdTime(telegramId, false, npc);

    return {
        todayClaimByNpcCount: todayClaimed,
        lastClaimByNpcTime: todayLastClaimTime,
    };
};

export const startIdleFarming = async (telegramId: string, existedFarm: IIdleFarming | null): Promise<IIdleFarming> => {
    if (!existedFarm) {
        // only for onboard case
        const existedFarm: IIdleFarming | null = await IdleFarming.findOne({ userId: telegramId }).exec();

        if (existedFarm && existedFarm.endTime > new Date()) {
            throw new Error('Idle farming is already in progress ...');
        }
    }

    // get lucky chest properties to setup new idle farming
    let luckyChestLevel = 1;
    const luckyChest: IUserInventory | null = await inventoryService.findUserItem(telegramId, 'lucky_chest', 0);
    if (luckyChest) {
        luckyChestLevel = luckyChest.itemLevel;
    }

    const prop: ILuckyChest = getLuckyChestProp(luckyChestLevel);

    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + prop.idleMaxTimeMinute * 1000 * 60);

    const gold: number = Math.round(getRandomInRange(prop.idleMinGold, prop.idleMaxGold));
    const chestAmount: number = Math.round(getRandomInRange(prop.idleMinChest, prop.idleMaxChest));

    // create new idle farming if not existed
    if (!existedFarm) {
        const idleFarm = new IdleFarming({
            userId: telegramId,
            startTime,
            endTime,
            maxTimeMinute: prop.idleMaxTimeMinute,
            gold: gold,
            chest: chestAmount,
        });
        await idleFarm.save();
        return idleFarm;
    }

    // restart the current one
    existedFarm.startTime = startTime;
    existedFarm.endTime = endTime;
    existedFarm.maxTimeMinute = prop.idleMaxTimeMinute;
    existedFarm.gold = gold;
    existedFarm.chest = chestAmount;
    existedFarm.claimed = false;
    await existedFarm.save();
    return existedFarm;
};

export const harvestIdleFarming = async (telegramId: string, paidBySei: boolean | null | undefined) => {
    const user: IUser | null = await User.findOne({ telegramId }, { mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 }).exec();
    if (!user) {
        throw new Error('User not found');
    }

    const existedFarm: IIdleFarming | null = await IdleFarming.findOneAndUpdate(
        { userId: telegramId, claimed: { $ne: true }, startTime: { $lt: new Date(new Date().getTime() - 30 * 60 * 1000) } },
        { $set: { claimed: true } },
        { new: true },
    );
    if (!existedFarm) {
        throw new Error('Your idle farming is already harvested or needs to be farmed at least 30 minutes before harvesting');
    }

    let claimSuccess = false;
    try {
        const now = new Date();
        const farmedMinute = Math.ceil((now.getTime() - existedFarm.startTime.getTime()) / 1000 / 60);

        let bonusBySeiRate = 1;
        if (paidBySei) {
            let receipt;
            try {
                receipt = await purchase(decryptData(user.privateKey), BONUS_SEI_PRICE);
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                await recordActivityLog({
                    gameId: user.gameId,
                    telegramId: user.telegramId,
                    action: ACTION.IDLE_FARMING_BONUS,
                    status: 'failed',
                    details: `Error during purchase: ${errorMessage}`,
                });
                throw new Error(`Payment is not successful: ${errorMessage}`);
            }

            if (receipt?.status === 1) {
                // Successful transaction
            } else {
                await recordActivityLog({
                    gameId: user.gameId,
                    telegramId: user.telegramId,
                    action: ACTION.IDLE_FARMING_BONUS,
                    status: 'failed',
                    details: JSON.stringify(receipt), // Store the entire receipt as a JSON string
                });
                throw new Error(`Payment is not successful: ${receipt?.status || receipt?.code || 'unknown'}`);
            }

            bonusBySeiRate = BONUS_RATE;

            await referralService.recordBonusForReferer(telegramId, user.referredByCode, { type: 'sei', quantity: BONUS_SEI_PRICE });
            await recordActivityLog({
                gameId: user.gameId,
                telegramId: user.telegramId,
                action: ACTION.IDLE_FARMING_BONUS,
                sei: -BONUS_SEI_PRICE,
            });
            await User.findOneAndUpdate({ telegramId: user.telegramId }, { $inc: { spentSei: BONUS_SEI_PRICE } });
        }

        // claim reward
        let reward: IReward[] = [];
        const byTimeProgressRate = Math.min(1, farmedMinute / existedFarm.maxTimeMinute);

        // claim gold reward
        const claimedGold = Math.ceil(existedFarm.gold * byTimeProgressRate * bonusBySeiRate);
        await balanceService.addUserBalance(telegramId, { gold: claimedGold });
        reward.push({ type: 'gold', quantity: claimedGold });

        // claim chest
        const claimedChest = Math.ceil(existedFarm.chest * byTimeProgressRate * bonusBySeiRate);
        await inventoryService.addUserItem(telegramId, 'lucky_chest', 0, claimedChest);
        reward.push({ type: 'lucky_chest', quantity: claimedChest });

        claimSuccess = true;

        await recordActivityLog({
            gameId: user.gameId,
            telegramId: user.telegramId,
            action: ACTION.CLAIM_IDLE_FARMING,
            gold: claimedGold,
            itemType: 'lucky_chest',
            quantity: claimedChest,
            details: `byTimeProgressRate=${byTimeProgressRate.toFixed(2)}, bonusBySeiRate=${bonusBySeiRate.toFixed(2)}, reward=${JSON.stringify(reward)}`,
        });

        // start new farm
        const newFarm: IIdleFarming = await startIdleFarming(telegramId, existedFarm);

        // update user after claim gold
        const updatedUser: IUser | null = await User.findOne(
            { telegramId },
            { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 },
        ).exec();

        return { newFarm, user: updatedUser, reward };
    } catch (error) {
        if (!claimSuccess) {
            await await IdleFarming.findOneAndUpdate({ userId: telegramId, claimed: true }, { $set: { claimed: false } }, { new: true });
        }
        throw error;
    }
};

export const harvestIdleFarmingByAd = async (telegramId: string, byAd: boolean, byNPC: string) => {
    if (!byAd) {
        if (!VALID_NPC.includes(byNPC)) {
            throw new Error(`NPC ${byNPC} not found`);
        }
    } else {
        if (byNPC) {
            throw new Error(`Invalid params: byAd=${byAd} and byNPC=${byNPC}`);
        }
    }

    const user: IUser | null = await User.findOne({ telegramId }, { mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 }).exec();
    if (!user) {
        throw new Error('User not found');
    }

    // TODO: setnx
    const todayLastClaimTime = await getLastClaimByAdTime(telegramId, byAd, byNPC);
    if (todayLastClaimTime && new Date().getTime() - todayLastClaimTime.getTime() <= AD_CLAIMED_COUNT_DOWN_MINUTE * 60 * 1000) {
        // 5 minute count down
        throw new Error(`You need to wait at least ${AD_CLAIMED_COUNT_DOWN_MINUTE} minutes before the next ad watching claim`);
    }

    try {
        const claimCount = await incrTodayClaimByAdCount(telegramId, byAd, byNPC);

        if (claimCount > MAX_AD_CLAIM) {
            throw new Error(`You have already claimed enough ${MAX_AD_CLAIM} times today`);
        }

        const existedFarm: IIdleFarming | null = await IdleFarming.findOne({ userId: telegramId }).exec();

        if (!existedFarm) {
            throw new Error('Idle farming not found');
        }

        let reward: IReward[] = [];
        const rate = AD_CLAIMED_DURATION_MINUTE / existedFarm.maxTimeMinute;

        // claim gold reward
        const claimedGold = Math.ceil(existedFarm.gold * rate);
        await balanceService.addUserBalance(telegramId, { gold: claimedGold });
        reward.push({ type: 'gold', quantity: claimedGold });

        // claim chest
        const claimedChest = Math.ceil(existedFarm.chest * rate);
        await inventoryService.addUserItem(telegramId, 'lucky_chest', 0, claimedChest);
        reward.push({ type: 'lucky_chest', quantity: claimedChest });

        // save last time
        await setLastClaimByAdTime(telegramId, byAd, byNPC);

        const user: IUser | null = await User.findOne(
            { telegramId },
            { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 },
        ).exec();
        if (!user) {
            throw new Error('User not found');
        }
        
        await recordActivityLog({
            gameId: user.gameId,
            telegramId: user.telegramId,
            action: ACTION.CLAIM_IDLE_FARMING_BY_AD,
            gold: claimedGold,
            itemType: 'lucky_chest',
            quantity: claimedChest,
            details: `byAd=${byAd} byNPC=${byNPC} reward=${JSON.stringify(reward)}`,
        });

        return { user, reward };
    } catch (error) {
        throw error;
    }
};

export const upgradeCurrentIdleFarming = async (telegramId: string) => {
    const existedFarm: IIdleFarming | null = await IdleFarming.findOne({ userId: telegramId }).exec();
    if (!existedFarm) {
        return;
    }

    // get new props
    let luckyChestLevel = 1;
    const luckyChest: IUserInventory | null = await inventoryService.findUserItem(telegramId, 'lucky_chest', 0);
    if (luckyChest) {
        luckyChestLevel = luckyChest.itemLevel;
    }

    const prop: ILuckyChest = getLuckyChestProp(luckyChestLevel);

    const newEndTime = new Date(existedFarm.startTime.getTime() + prop.idleMaxTimeMinute * 1000 * 60);
    const gold: number = Math.round(getRandomInRange(prop.idleMinGold, prop.idleMaxGold));
    const chestAmount: number = Math.round(getRandomInRange(prop.idleMinChest, prop.idleMaxChest));

    // upgrade new props for idle farming
    existedFarm.endTime = newEndTime;
    existedFarm.maxTimeMinute = prop.idleMaxTimeMinute;
    existedFarm.gold = gold;
    existedFarm.chest = chestAmount;
    await existedFarm.save();
};
