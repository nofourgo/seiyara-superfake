import Tree, { ICfgTree } from '../models/cfgTree';
import UserTree, { IUserTree } from '../models/userTree';
import User, { IUser } from '../models/user';
import { ACTION, recordActivityLog } from './activityLogService';
import * as referralService from './referralService';
import { purchase } from '../libs/seichain';
import { decryptData } from '../utils/encryption';

export const addDefaultUserTrees = async (cfgTrees: ICfgTree[] | null, telegramId: string): Promise<IUserTree[]> => {
    if (!cfgTrees) {
        cfgTrees = await Tree.find().exec();
        if (cfgTrees.length === 0) {
            throw new Error('No configured lands found');
        }
    }

    const userTrees = await Promise.all(
        cfgTrees
            .filter((tree) => tree.minUserLevel <= 1 && tree.seiPrice == 0)
            .map(async (tree) => {
                const userTree = new UserTree({
                    userId: telegramId,
                    tree: tree,
                    treeName: tree.name,
                    unlocked: true,
                });
                return await userTree.save();
            }),
    );

    return userTrees;
};

const canUnlockTree = (cfgTree: ICfgTree, level: number): boolean => {
    if (cfgTree.seiPrice > 0) {
        return false;
    }
    return level >= cfgTree.minUserLevel;
};

// Get user tree by slot
export const getUserTrees = async (telegramId: string) => {
    const cfgTrees: ICfgTree[] = await Tree.find().exec();
    if (cfgTrees.length === 0) {
        throw new Error('No trees found');
    }

    let userTrees: IUserTree[] = await UserTree.find({ userId: telegramId }).populate('tree').exec();

    // Add free trees if user has no tree
    if (userTrees.length === 0) {
        throw new Error('No user lands found');
    }

    const userTreeIds = userTrees.map((userTree) => userTree.tree._id);

    const user: IUser | null = await User.findOne({ telegramId }, { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 }).exec();
    if (!user) {
        throw new Error('User not found');
    }

    const otherTrees: IUserTree[] = await Promise.all(
        cfgTrees
            .filter((cfgTree) => !userTreeIds.some((userTree) => userTree._id.equals(cfgTree._id)))
            .map(async (cfgTree) => {
                if (canUnlockTree(cfgTree, user.level)) {
                    const unlockedTree = new UserTree({
                        userId: telegramId,
                        tree: cfgTree,
                        treeName: cfgTree.name,
                        isInCrop: false,
                        unlocked: true,
                    });
                    await unlockedTree.save();
                    return unlockedTree;
                }
                return new UserTree({
                    userId: telegramId,
                    tree: cfgTree,
                    treeName: cfgTree.name,
                    isInCrop: false,
                    unlocked: false,
                });
            }),
    );

    return [...userTrees, ...otherTrees].sort((a: IUserTree, b: IUserTree) => a.tree.reward[0].quantity - b.tree.reward[0].quantity);
};

const validateTreeToUnlock = (userTrees: IUserTree[], tree: ICfgTree) => {
    if (userTrees.find((userTree) => userTree.tree.name == tree.name)) {
        throw new Error('This tree is already unlocked');
    }
    if (tree.seiPrice <= 0) {
        throw new Error('This tree can not be unlocked by $SEI');
    }
};

export const unlockUserTree = async (telegramId: string, treeName: string) => {
    // Find the user and validate existence
    const user: IUser | null = await User.findOne({ telegramId }, { mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 }).exec();
    if (!user) {
        throw new Error('User not found');
    }

    // Find user's existing trees and validate they exist
    const userTrees: IUserTree[] = await UserTree.find({ userId: telegramId }).populate('tree').exec();
    if (userTrees.length === 0) {
        throw new Error('User trees not found, this might be due to not being onboarded yet.');
    }

    // Find and validate the configured tree by name
    const cfgTree: ICfgTree | null = await Tree.findOne({ name: treeName }).exec();
    if (!cfgTree) {
        throw new Error(`Configured tree not found: ${treeName}`);
    }
    
    // Validate the slot to unlock the tree
    validateTreeToUnlock(userTrees, cfgTree);

    // Attempt to purchase the tree unlock
    let receipt;
    try {
        receipt = await purchase(decryptData(user.privateKey), cfgTree.seiPrice);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
        await recordActivityLog({
            gameId: user.gameId,
            telegramId: user.telegramId,
            action: ACTION.UNLOCK_TREE,
            status: 'failed',
            treeName: cfgTree.name,
            cfgTreeId: cfgTree._id,
            details: `Purchase error: ${errorMessage}`,
        });
        throw new Error(`Payment is not successful: ${errorMessage}`);
    }

    // Check receipt status
    if (receipt?.status === 1) {
        // Purchase was successful, proceed with unlock
    } else {
        const receiptDetails = receipt ? JSON.stringify(receipt) : 'No receipt';
        await recordActivityLog({
            gameId: user.gameId,
            telegramId: user.telegramId,
            action: ACTION.UNLOCK_TREE,
            status: 'failed',
            treeName: cfgTree.name,
            cfgTreeId: cfgTree._id,
            details: `Transaction failed: ${receiptDetails}`,
        });
        throw new Error(`Payment is not successful: ${receipt?.status || receipt?.code || 'unknown'}`);
    }

    // Unlock the new tree for the user
    const newUserTree: IUserTree = new UserTree({
        userId: telegramId,
        tree: cfgTree,
        treeName: cfgTree.name,
        unlocked: true,
    });
    await newUserTree.save();

    // Record referral bonus and activity log
    await referralService.recordBonusForReferer(telegramId, user.referredByCode, { type: 'sei', quantity: cfgTree.seiPrice });
    await User.findOneAndUpdate({ telegramId: user.telegramId }, { $inc: {spentSei: cfgTree.seiPrice} });
    await recordActivityLog({
        gameId: user.gameId,
        telegramId: user.telegramId,
        action: ACTION.UNLOCK_TREE,
        sei: -cfgTree.seiPrice,
        treeName: cfgTree.name,
        cfgTreeId: cfgTree._id,
    });

    return { userTree: newUserTree };
};