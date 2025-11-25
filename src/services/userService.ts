import User, { IHeadQuarter, IUser, IUserStats } from '../models/user';
import { MAX_HEAD_QUARTER_LEVEL, getDragonBallProp, getDragonChestProp, getHeadQuarterConfig } from '../utils/const';
import { decryptData } from '../utils/encryption';
import { ACTION, recordActivityLog } from './activityLogService';
import * as referralService from './referralService';
import { getWallet, purchase, transferSeiReward } from '../libs/seichain';
import { formatEther } from 'ethers/lib/utils';
import { balanceService } from './balanceService';
import { redisCommands, redisHelper } from '../io/redis';
import logger from '../utils/logger';

const INSTANT_FINISH_DIAMOND_PER_SEC = 30;
const INSTANT_FINISH_SEI_PER_SEC = 0.1;

// Head quarter
const checkAndFinishHqUpgrade = (hq: IHeadQuarter): IHeadQuarter => {
    if (!hq) {
        throw new Error(`Headquarter info not found`);
    }
    if (!hq.isUpgrading) {
        return hq;
    }

    const now = new Date();
    if (!hq.upgradeEndTime) {
        throw new Error(`Headquarter is upgrading but doesn't have end time`);
    }
    if (hq.upgradeEndTime && now >= hq.upgradeEndTime) {
        hq.isUpgrading = false;
        hq.upgradeStartTime = null;
        hq.upgradeEndTime = null;
        hq.level += 1;

        const nextLevelProp = getHeadQuarterConfig(hq.level);
        hq.nextUpgradeTimeSecond = nextLevelProp.nextUpgradeTimeSecond;
        hq.nextUpgradeFeeDiamond = nextLevelProp.nextUpgradeFeeDiamond;
    }
    return hq;
};

export const getHeadQuarterInfo = async (
    telegramId: string,
): Promise<{
    headquarter: IHeadQuarter;
    instantSeiPerSecond?: number;
    instantDiamondPerSecond?: number;
    dragonBallChance: [number];
    stats: IUserStats;
}> => {
    const user: IUser | null = await User.findOne(
        { telegramId },
        { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 },
    ).exec();
    if (!user) {
        throw new Error(`User not found: ${telegramId}`);
    }

    user.headquarter = checkAndFinishHqUpgrade(user.headquarter);
    await user.save();

    const result: any = { headquarter: user.headquarter };
    if (user.headquarter.isUpgrading) {
        result.instantDiamondPerSecond = INSTANT_FINISH_DIAMOND_PER_SEC;
        result.instantSeiPerSecond = INSTANT_FINISH_SEI_PER_SEC;
    }

    result.dragonBallChance = getDragonChestProp(user.headquarter.level).dragonBallChances;
    result.stats = {
        totalCrop: user.stats?.totalCrop ? user.stats?.totalCrop : 0,
        totalRegrowTime: user.stats?.totalRegrowTime ? user.stats?.totalRegrowTime : 0,
        sellPriceEachCrop: user.stats?.sellPriceEachCrop ? user.stats?.sellPriceEachCrop : 0,
    };
    return result;
};

export const upgradeHQ = async (telegramId: string, upgradeType: string, concurrency: string) => {
    if (!['init', 'instant_finish'].includes(upgradeType)) {
        throw new Error(`Invalid upgradeType. Allowed values: ['init', 'instant_finish']`);
    }
    if (upgradeType == 'instant_finish' && !['sei', 'diamond'].includes(concurrency)) {
        throw new Error(`Invalid concurrency for instant finish. Allowed values: ['sei', 'diamond']`);
    }

    const user: IUser | null = await User.findOne({ telegramId }, { mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 }).exec();
    if (!user) {
        throw new Error('User not found');
    }

    user.headquarter = checkAndFinishHqUpgrade(user.headquarter);
    await user.save();

    if (upgradeType == 'init') {
        if (user.headquarter.isUpgrading) {
            throw new Error(
                `Your headquarter is being upgraded. If you don't want to wait more, can try to finish it instantly with $DIAMOND or $SEI`,
            );
        }
        if (user.headquarter.level == MAX_HEAD_QUARTER_LEVEL) {
            throw new Error(`Max headquarter reached, can not upgrade more now`);
        }
        if (user.diamond < user.headquarter.nextUpgradeFeeDiamond) {
            throw new Error(
                `Not enough $DIAMOND, you need ${user.headquarter.nextUpgradeFeeDiamond} $DIAMOND to upgrade to level ${user.headquarter.level + 1}`,
            );
        }

        // start upgrade
        const deductedDiamond = user.headquarter.nextUpgradeFeeDiamond;
        user.diamond -= deductedDiamond;
        user.headquarter.isUpgrading = true;

        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + user.headquarter.nextUpgradeTimeSecond * 1000);
        user.headquarter.upgradeStartTime = startTime;
        user.headquarter.upgradeEndTime = endTime;

        await user.save();

        await recordActivityLog({
            gameId: user.gameId,
            telegramId: user.telegramId,
            action: ACTION.UPGRADE_HQ,
            diamond: -deductedDiamond,
            hqLevel: user.headquarter.level,
        });

        return {
            headquarter: user.headquarter,
            deductedDiamond: deductedDiamond,
            instantDiamondPerSecond: INSTANT_FINISH_DIAMOND_PER_SEC,
            instantSeiPerSecond: INSTANT_FINISH_SEI_PER_SEC,
        };
    } else if (upgradeType == 'instant_finish') {
        if (!user.headquarter.isUpgrading) {
            throw new Error(`Your headquarter is not in any upgrading process now`);
        }
        if (!user.headquarter.upgradeEndTime) {
            throw new Error(`Your headquarter is being upgraded but can not find estimated end time`);
        }
        const now = new Date();
        const remainingMinute = (user.headquarter.upgradeEndTime.getTime() - now.getTime()) / 1000 / 60;

        let deductedDiamond: number = 0,
            deductedSei: number = 0;
        if (concurrency == 'diamond') {
            deductedDiamond = Math.ceil(remainingMinute * INSTANT_FINISH_DIAMOND_PER_SEC);
        } else if (concurrency == 'sei') {
            deductedSei = Math.ceil(remainingMinute * INSTANT_FINISH_SEI_PER_SEC);
        } else {
            throw new Error(`Invalid payment concurrency: ${concurrency}`);
        }

        if (deductedDiamond == 0 && deductedSei == 0) {
            // maybe it is finished now
            user.headquarter = checkAndFinishHqUpgrade(user.headquarter);
            await user.save();
            return {
                headquarter: user.headquarter,
                deductedDiamond,
                deductedSei,
            };
        } else {
            if (deductedDiamond > 0) {
                if (user.diamond < deductedDiamond) {
                    throw new Error(
                        `Not enough $DIAMOND, you need ~${deductedDiamond} $DIAMOND to finish the remaining ${remainingMinute.toFixed(2)} minutes`,
                    );
                }
                user.diamond -= deductedDiamond;
            } else if (deductedSei > 0) {
                // Attempt to purchase the tree unlock
                let receipt;
                try {
                    receipt = await purchase(decryptData(user.privateKey), deductedSei);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
                    await recordActivityLog({
                        gameId: user.gameId,
                        telegramId: user.telegramId,
                        action: ACTION.UPGRADE_HQ_INSTANT,
                        status: 'failed',
                        hqLevel: user.headquarter.level,
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
                        action: ACTION.UPGRADE_HQ_INSTANT,
                        status: 'failed',
                        hqLevel: user.headquarter.level,
                        details: `Transaction failed: ${receiptDetails}`,
                    });
                    throw new Error(`Payment is not successful: ${receipt?.status || receipt?.code || 'unknown'}`);
                }
            }

            user.headquarter.upgradeEndTime = now;
            user.headquarter = checkAndFinishHqUpgrade(user.headquarter);
            await user.save();

            if (deductedSei > 0) {
                await referralService.recordBonusForReferer(user.telegramId, user.referredByCode, { type: 'sei', quantity: deductedSei });
                await User.findOneAndUpdate({ telegramId: user.telegramId }, { $inc: { spentSei: deductedSei } });
            }
            await recordActivityLog({
                gameId: user.gameId,
                telegramId: user.telegramId,
                action: ACTION.UPGRADE_HQ_INSTANT,
                sei: -deductedSei,
                diamond: -deductedDiamond,
                hqLevel: user.headquarter.level,
            });

            return {
                headquarter: user.headquarter,
                deductedDiamond,
                deductedSei,
            };
        }
    }
};

// Wallet confidential
export const getWalletPassPhrase = async (userId: string) => {
    const user: IUser | null = await User.findOne({ telegramId: userId }).exec();
    if (!user) {
        throw new Error('User not found');
    }

    const decryptedMnemonic = decryptData(user.mnemonic);
    const decryptedPrivateKey = decryptData(user.privateKey);

    const wallet = getWallet(decryptedPrivateKey);
    const balance = await wallet.provider.getBalance(wallet.address);

    return {
        mnemonic: decryptedMnemonic,
        privateKey: decryptedPrivateKey,
        balance: formatEther(balance), // Returns balance in SEI
    };
};

export const convertIngameSei = async (userId: string) => {
    const getLock = await redisHelper.set(`lock:user_convert_sei:${userId}`, 'busy', { nx: true, ex: 60 });
    if (!getLock) {
        throw new Error('Converting SEI in progress');
    }

    const user: IUser | null = await User.findOne({ telegramId: userId }).exec();
    if (!user) {
        throw new Error('User not found');
    }

    if (user.seiConverting) {
        throw new Error('Converting SEI in progress. Please contact admin to check.');
    }

    const toConvertSei = user.sei;
    if (toConvertSei < 0.99) {
        throw new Error('You need to have at least 0.99 in-game $SEI to convert.');
    }

    if (!user.userCheck) {
        const totalConvertedSei = await redisCommands.incrbyfloat('total_converted_sei', toConvertSei);
        const totalConvertedSeiNumeric = parseFloat(totalConvertedSei);
        if (totalConvertedSeiNumeric > 200) {
            throw new Error('Withdraw internal error, please try again later.');
        }
    }

    try {
        if (process.env.NODE_ENV == 'production') {
            if (process.env.QUEST_REWARD_SENDER_PK != undefined && process.env.QUEST_REWARD_SENDER_PK != null) {
                user.seiConverting = true;
                await user.save();
                try {
                    await transferSeiReward(process.env.QUEST_REWARD_SENDER_PK, user.evmAddress, toConvertSei);
                } catch (error) {
                    if (!user.userCheck) {
                        await redisCommands.incrbyfloat('total_converted_sei', -toConvertSei); // rollback cap
                    }
                    throw error;
                } finally {
                    user.seiConverting = false;
                    await user.save();
                }
            } else {
                throw new Error('Unexpected error. Please contact with us!');
            }
        }

        await balanceService.deductUserBalance(userId, { sei: toConvertSei });

        await recordActivityLog({
            gameId: user.gameId,
            telegramId: user.telegramId,
            action: ACTION.CONVERT_INGAME_SEI,
            sei: -toConvertSei,
            onchainSei: toConvertSei,
        });

        return { convertedOnchainSei: toConvertSei };
    } catch (error) {
        await recordActivityLog({
            status: 'failed',
            gameId: user.gameId,
            telegramId: user.telegramId,
            action: ACTION.CONVERT_INGAME_SEI,
            details: JSON.stringify({ sei: toConvertSei, error: `${error}` }),
        });
        throw error;
    } finally {
        await redisHelper.del(`lock:user_convert_sei:${userId}`);
    }
};
