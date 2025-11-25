import mongoose from 'mongoose';

import CfgItem, { ICfgItem, IDragonBall, IDragonChest, ILuckyChest } from '../models/cfgItem';
import UserInventory, { IUserInventory } from '../models/userInventory';
import User, { IUser } from '../models/user';
import { IReward } from '../models/cfgReward';
import { getLuckyChestProp, getDragonChestProp, getDragonBallProp, MAX_DRAGON_BALL_LEVEL } from '../utils/const';
import { getRandomInRange } from '../utils/common';
import * as redis from '../services/redis';
import * as referralService from './referralService';
import { upgradeCurrentIdleFarming } from './idleFarmingService';
import { ACTION, recordActivityLog } from './activityLogService';
import { balanceService } from './balanceService';

export const getUserInventory = async (telegramId: string) => {
    const user: IUser | null = await User.findOne(
        { telegramId },
        { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 },
    ).exec();
    if (!user) {
        throw new Error('User not found');
    }

    const userInventory: IUserInventory[] = await UserInventory.find({ userId: telegramId }).populate('item').exec();
    if (!userInventory) {
        return [];
    }

    const result = userInventory.map((userItem) => {
        const itemResult = userItem.toObject(); // because need to change properties of populated field
        if (itemResult.itemType == 'lucky_chest') {
            itemResult.item.properties = getLuckyChestProp(itemResult.itemLevel);
        } else if (itemResult.itemType == 'dragon_chest') {
            itemResult.item.properties = getDragonChestProp(user.headquarter.level);

            // TODO: ???
        } else if (itemResult.itemType == 'dragon_ball') {
            itemResult.item.properties = getDragonBallProp(itemResult.itemLevel);
        }
        return itemResult;
    });

    return result;
};

export const findUserItem = async (telegramId: string, itemType: string, itemLevel: number): Promise<IUserInventory | null> => {
    let cond;
    if (itemType == 'lucky_chest' || itemType == 'dragon_chest') {
        cond = { userId: telegramId, itemType: itemType };
    } else if (itemType == 'dragon_ball') {
        cond = { userId: telegramId, itemType: itemType, itemLevel: itemLevel };
    } else {
        throw new Error(`Invalid itemType ${itemType}`);
    }

    const item: IUserInventory | null = await UserInventory.findOne(cond).populate('item').exec();
    return item;
};

export const addUserItem = async (telegramId: string, itemType: string, itemLevel: number, quantity: number) => {
    const existedItem: IUserInventory | null = await findUserItem(telegramId, itemType, itemLevel);

    if (existedItem) {
        existedItem.quantity += quantity;
        await existedItem.save();
        return existedItem;
    }

    const cond: any = { type: itemType };
    if (itemType == 'dragon_ball') {
        cond.level = itemLevel;
    }

    const cfgItem: ICfgItem | null = await CfgItem.findOne(cond).exec();
    if (!cfgItem) {
        throw new Error('Item not found');
    }

    // At first, lucky chest is level 1
    if (itemType == 'lucky_chest') {
        itemLevel = 1;
    } else if (itemType == 'dragon_chest') {
        itemLevel = 0; // dragon chest dont need level
    }

    const newItem = new UserInventory({
        userId: telegramId,
        itemType: itemType,
        itemLevel: itemLevel,
        item: cfgItem,
        quantity: quantity,
        acquiredAt: new Date(),
    });
    await newItem.save();

    return newItem;
};

export const consumeUserItem = async (telegramId: string, itemType: string, itemLevel: number, usedQuantity: number, useAll: boolean) => {
    const user: IUser | null = await User.findOne(
        { telegramId },
        { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 },
    ).exec();
    if (!user) {
        throw new Error('User not found');
    }

    const existedItem: IUserInventory | null = await findUserItem(telegramId, itemType, itemLevel);
    if (!existedItem) {
        throw new Error('Item not found');
    }

    if (useAll) {
        usedQuantity = existedItem.quantity;
    }

    const usedItem: IUserInventory | null = await UserInventory.findOneAndUpdate(
        { _id: existedItem._id, quantity: { $gte: usedQuantity } },
        { $inc: { quantity: -usedQuantity } },
        { new: true },
    );
    if (!usedItem) {
        throw new Error('Not enough quantity to use');
    }

    let goldReward: IReward = { type: 'gold', quantity: 0 };
    let diamondReward: IReward = { type: 'diamond', quantity: 0 };
    let dragonChestReward: IReward = { type: 'dragon_chest', quantity: 0 };
    let dragonBallReward: [IReward, IReward, IReward, IReward, IReward, IReward, IReward] = [
        { type: 'dragon_ball', level: 1, quantity: 0 },
        { type: 'dragon_ball', level: 2, quantity: 0 },
        { type: 'dragon_ball', level: 3, quantity: 0 },
        { type: 'dragon_ball', level: 4, quantity: 0 },
        { type: 'dragon_ball', level: 5, quantity: 0 },
        { type: 'dragon_ball', level: 6, quantity: 0 },
        { type: 'dragon_ball', level: 7, quantity: 0 },
    ];

    for (let i = 0; i < usedQuantity; i++) {
        if (itemType == 'lucky_chest') {
            const gold = getGoldFromLuckyChest(usedItem.itemLevel);
            const chestAmount = getDragonChestFromLuckyChest(usedItem.itemLevel);
            goldReward.quantity += gold;
            dragonChestReward.quantity += chestAmount;
        } else if (itemType == 'dragon_chest') {
            const ballLevel = getDragonBallLevelFromDragonChest(user.headquarter.level);
            dragonBallReward[ballLevel - 1].quantity += 1;
        } else if (itemType == 'dragon_ball') {
            if (itemLevel == MAX_DRAGON_BALL_LEVEL) {
                throw new Error('7-Star Dragon Ball is not for sale');
            }
            const prop: IDragonBall = getDragonBallProp(itemLevel);
            diamondReward.quantity += prop.diamondReward;
        }
    }

    let rewards: IReward[] = [];

    await balanceService.addUserBalance(telegramId, { gold: goldReward.quantity, diamond: diamondReward.quantity });
    if (goldReward.quantity > 0) {
        rewards.push(goldReward);
    }
    if (diamondReward.quantity > 0) {
        rewards.push(diamondReward);
        await referralService.recordBonusForReferer(telegramId, user.referredByCode, { type: 'diamond', quantity: diamondReward.quantity });
        await recordActivityLog({
            gameId: user.gameId,
            telegramId: user.telegramId,
            action: ACTION.OPEN_SELL_ITEM,
            diamond: diamondReward.quantity,
            quantity: usedQuantity,
            itemType,
            itemLevel,
        });
    }

    if (dragonChestReward.quantity > 0) {
        rewards.push(dragonChestReward);
        await addUserItem(telegramId, 'dragon_chest', 0, dragonChestReward.quantity);
    }
    for (let i = 0; i < dragonBallReward.length; i++) {
        if (dragonBallReward[i].quantity > 0) {
            rewards.push(dragonBallReward[i]);
            await addUserItem(telegramId, 'dragon_ball', dragonBallReward[i].level as number, dragonBallReward[i].quantity);
        }
    }

    return { existedItem: usedItem, reward: rewards };
};

export const stakeUserItem = async (telegramId: string, itemType: string, itemLevel: number, usedQuantity: number) => {
    const user: IUser | null = await User.findOne(
        { telegramId },
        { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 },
    ).exec();
    if (!user) {
        throw new Error('User not found');
    }

    const existedItem: IUserInventory | null = await findUserItem(telegramId, itemType, itemLevel);
    if (!existedItem) {
        throw new Error('Item not found');
    }

    const usedItem: IUserInventory | null = await UserInventory.findOneAndUpdate(
        { _id: existedItem._id, quantity: { $gte: usedQuantity } },
        { $inc: { quantity: -usedQuantity } },
        { new: true },
    );
    if (!usedItem) {
        throw new Error('Not enough quantity to use');
    }
    return usedItem;
};

export const upgradeUserItem = async (telegramId: string, itemType: string) => {
    if (itemType !== 'lucky_chest') {
        throw new Error('Can not upgrade this item type: ' + itemType);
    }

    const userItem: IUserInventory | null = await findUserItem(telegramId, itemType, 0);
    if (!userItem) {
        throw new Error(`User doesn't have any ${itemType}`);
    }

    const user: IUser | null = await User.findOne(
        { telegramId },
        { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 },
    ).exec();
    if (!user) {
        throw new Error('User not found');
    }

    if (itemType == 'lucky_chest') {
        const nextLevel = userItem.itemLevel + 1;
        const nextProp: ILuckyChest = getLuckyChestProp(nextLevel);

        if (!nextProp.upgradeFeeGold) {
            throw new Error(`Configured upgrade fee $GOLD not found for ${itemType} level ${nextLevel}`);
        }
        if (user.gold < nextProp.upgradeFeeGold) {
            throw new Error(`You only have ${user.gold}, upgrading requires ${nextProp.upgradeFeeGold} $GOLD`);
        }

        await balanceService.deductUserBalance(telegramId, { gold: nextProp.upgradeFeeGold });

        userItem.itemLevel += 1;
        userItem.item.properties = nextProp;
    }

    await userItem.save();

    await upgradeCurrentIdleFarming(telegramId);

    return { upgradeItem: userItem };
};

// Open lucky chest
const getGoldFromLuckyChest = (level: number): number => {
    const prop: ILuckyChest = getLuckyChestProp(level);
    return Math.round(getRandomInRange(prop.minGold, prop.maxGold));
};

const getDragonChestFromLuckyChest = (level: number): number => {
    const prop: ILuckyChest = getLuckyChestProp(level);
    if (Math.random() * 100 > prop.dragonChestChance) {
        // miss
        return 0;
    }
    return 1;
};

// Open dragon chest
const getDragonBallLevelFromDragonChest = (level: number): number => {
    const prop: IDragonChest = getDragonChestProp(level);
    const rd: number = Math.random() * 100;

    let sum = 0;
    let ballLevel = 0;
    for (let i = 0; i < MAX_DRAGON_BALL_LEVEL; i++) {
        if (i == MAX_DRAGON_BALL_LEVEL - 1) {
            ballLevel = MAX_DRAGON_BALL_LEVEL;
            break;
        }
        sum += prop.dragonBallChances[i];
        if (rd <= sum) {
            ballLevel = i + 1;
            break;
        }
    }
    return ballLevel;
};
