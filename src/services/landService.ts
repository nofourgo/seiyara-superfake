import mongoose from 'mongoose';

import Land, { ICfgLand } from '../models/cfgLand';
import UserLand, { IUserLand } from '../models/userLand';
import UserTree, { IUserTree } from '../models/userTree';
import User, { IUser } from '../models/user';
import * as inventoryService from './inventoryService';
import { IReward } from '../models/cfgReward';
import * as redis from '../services/redis';
import * as referralService from './referralService';
import { ACTION, recordActivityLog } from './activityLogService';
import { purchase } from '../libs/seichain';
import { decryptData } from '../utils/encryption';
import { balanceService } from './balanceService';
import { boostService } from './boostService';

const MAX_SLOT = 9;
const DEFAULT_LAND_SLOTS = [1, 2, 3];

const BOOST_GOLD_RATE = 3;
const BOOST_CHEST_RATE = 2;

export const addDefaultUserLands = async (cfgLands: ICfgLand[] | null, telegramId: string): Promise<IUserLand[]> => {
    if (!cfgLands) {
        cfgLands = await Land.find().exec();
        if (cfgLands.length === 0) {
            throw new Error('No configured lands found');
        }
    }

    const userLands: IUserLand[] = await Promise.all(
        cfgLands
            .filter((land) => DEFAULT_LAND_SLOTS.includes(land.slot))
            .map(async (land) => {
                const userLand = new UserLand({
                    userId: telegramId,
                    land: land,
                    slot: land.slot,
                    crop: null,
                    unlocked: true,
                });
                return await userLand.save();
            }),
    );

    return userLands;
};

// Get user land by slot
export const getUserLands = async (telegramId: string) => {
    const cfgLands: ICfgLand[] = await Land.find().exec();
    if (cfgLands.length === 0) {
        throw new Error('No configured lands found');
    }

    let userLands: IUserLand[] = await UserLand.find({ userId: telegramId }).populate('land').populate('crop.tree').exec();

    if (userLands.length === 0) {
        throw new Error('No user lands found');
    }

    const userLandIds: number[] = userLands.map((userLand) => userLand.slot);

    const lockedLands: IUserLand[] = cfgLands
        .filter((land) => !userLandIds.includes(land.slot))
        .map(
            (land) =>
                new UserLand({
                    userId: telegramId,
                    land: land,
                    slot: land.slot,
                    unlocked: false,
                }),
        );

    return [...userLands, ...lockedLands];
};

export const plantTree = async (telegramId: string, slot: number, treeName: string) => {
    const userLand: IUserLand | null = await UserLand.findOne({ userId: telegramId, slot }).exec();
    if (userLand == null) {
        throw new Error('User land not found or unlocked');
    }
    const userTrees: IUserTree[] | null = await UserTree.find({ userId: telegramId }).populate('tree').exec();
    if (userTrees == null) {
        throw new Error('User tree not found or unlocked');
    }
    const userTree: IUserTree | undefined = userTrees.find((tree) => tree.tree.name == treeName);
    if (!userTree) {
        throw new Error('User tree not found or unlocked');
    }

    // validate land
    if (userLand.crop?.tree != null) {
        throw new Error('This land is already in crop');
    }

    // validate tree
    const canPlantTreeOnLand =
        userTree.tree.landSlots == null || userTree.tree.landSlots.length == 0 || userTree.tree.landSlots.includes(userLand.slot);
    if (!canPlantTreeOnLand) {
        throw new Error(`This tree can only be planted on slots ${userTree.tree.landSlots}`);
    }
    if (userTree.isInCrop) {
        throw new Error('This tree is being in crop on another land');
    }

    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + userTree.tree.harvestTimeInSec * 1000);

    userTree.isInCrop = true;
    userLand.crop = {
        tree: userTree.tree,
        startTime,
        endTime,
        claimed: false,
    };

    await userTree.save();
    await userLand.save();

    return userLand;
};

export const harvestTree = async (telegramId: string, slot: number) => {
    const userLand: IUserLand | null = await UserLand.findOne({ userId: telegramId, slot }).exec();
    if (userLand == null) {
        throw new Error('User land not found or unlocked');
    }

    if (userLand.crop?.tree == null) {
        throw new Error('This land is not in crop to harvest');
    }
    if (new Date() < userLand.crop?.endTime) {
        throw new Error('You need to wait until the harvest time');
    }

    // lock harvest
    const lockedUserLand: IUserLand | null = await UserLand.findOneAndUpdate(
        { userId: telegramId, slot, 'crop.claimed': { $ne: true } },
        { $set: { 'crop.claimed': true } },
        { new: true },
    );
    if (!lockedUserLand) {
        throw new Error('You have harvested this crop');
    }

    const user: IUser | null = await User.findOne(
        { telegramId },
        { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 },
    ).exec();
    if (user == null) {
        throw new Error('User not found');
    }

    const userTree: IUserTree | null = await UserTree.findOne({ userId: telegramId, tree: lockedUserLand.crop?.tree }).populate('tree').exec();
    if (userTree == null) {
        throw new Error('User tree not found or unlocked');
    }

    const reward: IReward[] = userTree.tree.reward;
    if (reward.length == 0) {
        throw new Error('Configured tree reward not found');
    }

    // claim reward
    let goldRate = 1,
        chestRate = 1;
    const userBoost = await boostService.getBoost(telegramId);
    if (userBoost && userBoost.hasBoost && userBoost.endTime && userBoost.endTime > new Date()) {
        goldRate = BOOST_GOLD_RATE;
        chestRate = BOOST_CHEST_RATE;
    }

    const actualGold = reward[0].quantity * goldRate;
    const actualChestRate = userTree.tree.chestChance * chestRate;

    reward[0].quantity = actualGold;
    const goldReward = reward[0];
    await balanceService.addUserBalance(telegramId, { gold: goldReward.quantity });

    if (Math.random() * 100 < actualChestRate) {
        await inventoryService.addUserItem(telegramId, 'lucky_chest', 0, 1);
        reward.push({ type: 'lucky_chest', quantity: 1 });
    }

    // update tree
    userTree.isInCrop = false;
    userTree.producedCrops += 1;
    await userTree.save();

    // update land
    lockedUserLand.crop = undefined;
    await lockedUserLand.save();

    await recordActivityLog({
        gameId: user.gameId,
        telegramId: user.telegramId,
        action: ACTION.HARVEST_CROP,
        gold: actualGold,
        landSlot: lockedUserLand.slot,
        treeName: userTree.treeName,
        details: JSON.stringify({ reward, userLand: lockedUserLand }),
    });

    return { userLand: lockedUserLand, reward };
};

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

export const unlockUserLand = async (telegramId: string, slot: number) => {
    // Fetch the user
    const user: IUser | null = await User.findOne({ telegramId }, { mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 }).exec();
    if (!user) {
        throw new Error('User not found');
    }

    // Fetch the configured land
    const cfgLand: ICfgLand | null = await Land.findOne({ slot }).exec();
    if (!cfgLand) {
        throw new Error('Configured land not found: ' + slot);
    }

    // Fetch user lands and validate the slot
    const userLands: IUserLand[] = await UserLand.find({ userId: telegramId }).exec();
    if (userLands.length === 0) {
        throw new Error('User lands not found, this might be due to not being onboarded yet.');
    }
    validateSlotToUnlock(userLands, slot);

    // Attempt to make the purchase
    let receipt;
    try {
        receipt = await purchase(decryptData(user.privateKey), cfgLand.seiPrice);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
        await recordActivityLog({
            gameId: user.gameId,
            telegramId: user.telegramId,
            action: ACTION.UNLOCK_LAND,
            status: 'failed',
            landSlot: cfgLand.slot,
            cfgLandId: cfgLand._id,
            details: `Purchase error: ${errorMessage}`,
        });
        throw new Error(`Payment is not successful: ${errorMessage}`);
    }

    // Check if the receipt indicates a successful transaction
    if (receipt?.status === 1) {
        // Continue processing
    } else {
        const receiptDetails = receipt ? JSON.stringify(receipt) : 'No receipt';
        await recordActivityLog({
            gameId: user.gameId,
            telegramId: user.telegramId,
            action: ACTION.UNLOCK_LAND,
            status: 'failed',
            landSlot: cfgLand.slot,
            cfgLandId: cfgLand._id,
            details: `Transaction failed: ${receiptDetails}`,
        });
        throw new Error(`Payment is not successful: ${receipt?.status || receipt?.code || 'unknown'}`);
    }

    // Unlock the land for the user
    const newUserLand = new UserLand({
        userId: telegramId,
        land: cfgLand,
        slot: cfgLand.slot,
        crop: null,
        unlocked: true,
    });
    await newUserLand.save();

    // Record the bonus for the referral system and log the successful transaction
    await referralService.recordBonusForReferer(telegramId, user.referredByCode, { type: 'sei', quantity: cfgLand.seiPrice });
    await recordActivityLog({
        gameId: user.gameId,
        telegramId: user.telegramId,
        action: ACTION.UNLOCK_LAND,
        sei: -cfgLand.seiPrice,
        landSlot: cfgLand.slot,
        cfgLandId: cfgLand._id,
    });
    await User.findOneAndUpdate({ telegramId: user.telegramId }, { $inc: { spentSei: cfgLand.seiPrice } });

    return { userLand: newUserLand };
};
