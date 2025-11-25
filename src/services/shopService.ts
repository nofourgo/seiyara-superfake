import mongoose from 'mongoose';
import CfgShopItem, { ICfgShopItem } from '../models/cfgShopItem';
import User, { IUser } from '../models/user';
import { ACTION, recordActivityLog } from './activityLogService';
import * as inventoryService from './inventoryService';
import * as referralService from './referralService';
import { purchase } from '../libs/seichain';
import { decryptData } from '../utils/encryption';
import { balanceService } from './balanceService';
import ActivityLog from '../models/activityLog';

export const getActiveShopItems = async () => {
    const activeItems: ICfgShopItem[] = await CfgShopItem.find({ active: true }).exec();

    return { shopItems: activeItems };
};

export const purchaseItem = async (userId: string, cfgShopItemId: string) => {
    // Fetch user and validate existence
    const user: IUser | null = await User.findOne(
        { telegramId: userId },
        { mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 },
    ).exec();
    if (!user) {
        throw new Error('User not found');
    }

    // Fetch shop item and validate its status
    const shopItem: ICfgShopItem | null = await CfgShopItem.findOne({ _id: cfgShopItemId, active: true }).exec();
    if (!shopItem) {
        throw new Error('Shop item not found or inactive');
    }

    // Attempt to make the purchase
    let receipt;
    if (process.env.NODE_ENV === 'local') {
        // pass
    } else {
        try {
            receipt = await purchase(decryptData(user.privateKey), shopItem.seiPrice);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
            await recordActivityLog({
                gameId: user.gameId,
                telegramId: user.telegramId,
                action: ACTION.BUY_SHOP_ITEM,
                status: 'failed',
                shopItemName: shopItem.type,
                cfgShopItemId: shopItem._id,
                details: `Purchase error: ${errorMessage}`,
            });
            throw new Error(`Payment is not successful: ${errorMessage}`);
        }

        // Check receipt status
        if (receipt?.status === 1) {
            // Proceed with item processing
        } else {
            const receiptDetails = receipt ? JSON.stringify(receipt) : 'No receipt';
            await recordActivityLog({
                gameId: user.gameId,
                telegramId: user.telegramId,
                action: ACTION.BUY_SHOP_ITEM,
                status: 'failed',
                shopItemName: shopItem.type,
                cfgShopItemId: shopItem._id,
                details: `Transaction failed: ${receiptDetails}`,
            });
            throw new Error(`Payment is not successful: ${receipt?.status || receipt?.code || 'unknown'}`);
        }
    }

    // Process purchase based on shop item type
    const purchased: Array<{ type: string; quantity: number }> = [];
    if (shopItem.type === 'diamond') {
        let diamondAmount = shopItem.quantity;
        await balanceService.addUserBalance(userId, { diamond: diamondAmount });
        purchased.push({ type: 'diamond', quantity: diamondAmount });
    } else if (shopItem.type === 'dragon_chest') {
        let chestAmount = shopItem.quantity;
        await inventoryService.addUserItem(userId, 'dragon_chest', 0, chestAmount);
        purchased.push({ type: 'dragon_chest', quantity: chestAmount });
    } else if (shopItem.type === 'spin_ticket') {
        let spinAmount = shopItem.quantity;
        await User.findOneAndUpdate({ telegramId: userId }, { $inc: { spinnedTicket: spinAmount } });
        purchased.push({ type: 'spin_ticket', quantity: spinAmount });
    }

    // First purchase reward
    const firstPurchaseReward = {
        gold: 0,
        diamond: 0,
        seya: 0,
    };
    const prevPurchase = await ActivityLog.exists({
        telegramId: userId,
        action: ACTION.BUY_SHOP_ITEM,
        cfgShopItem: shopItem._id,
        status: 'ok',
    }).exec();
    if (!prevPurchase) {
        for (const reward of shopItem.firstPurchaseReward) {
            if (reward.type == 'gold') {
                firstPurchaseReward.gold += reward.quantity;
            } else if (reward.type == 'diamond') {
                firstPurchaseReward.diamond += reward.quantity;
            } else if (reward.type == 'seya') {
                firstPurchaseReward.seya += reward.quantity;
            }
        }
    }
    await balanceService.addUserBalance(userId, firstPurchaseReward);

    // Record the referral bonus and transaction log
    await referralService.recordBonusForReferer(userId, user.referredByCode, { type: 'sei', quantity: shopItem.seiPrice });
    await recordActivityLog({
        gameId: user.gameId,
        telegramId: user.telegramId,
        action: ACTION.BUY_SHOP_ITEM,
        sei: -shopItem.seiPrice,
        diamond: shopItem.type === 'diamond' ? shopItem.quantity : 0,
        quantity: shopItem.quantity,
        shopItemName: shopItem.type,
        cfgShopItemId: shopItem._id,
        details: JSON.stringify({ purchased, firstPurchaseReward, receipt }), // Ensure receipt is a string for MongoDB
    });
    await User.findOneAndUpdate({ telegramId: user.telegramId }, { $inc: { spentSei: shopItem.seiPrice } });

    return { purchased, firstPurchasedReward: shopItem.firstPurchaseReward };
};
