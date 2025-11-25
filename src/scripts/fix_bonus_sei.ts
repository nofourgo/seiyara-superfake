import connectDB from '../io/db';
import activityLog, { IActivityLog } from '../models/activityLog';
import Referral, { IReferral } from '../models/referral';
import User, { IUser } from '../models/user';
import { ACTION } from '../services/activityLogService';
import logger from '../utils/logger';

const BONUS_DIAMOND_RATE = 0.05;
const BONUS_SEI_RATE = 0.1;

const fixBonusSeiMinigame = async () => {
    await connectDB('fix bonus sei');

    const fixDate = new Date('2024-11-04T06:47:27');

    const userActivityLogs: IActivityLog[] = await activityLog.find({
        action: ACTION.SPIN_MINIGAME,
        diamond: { $gt: 0 },
        createdAt: { $lt: fixDate },
    });

    for (const log of userActivityLogs) {
        const userId = log.telegramId;
        const user: IUser | null = await User.findOne({ telegramId: userId }).exec();
        if (!user) {
            logger.error('User not found', userId);
            continue;
        }
        if (!user.referredByCode) {
            logger.info('No ref');
            continue;
        }
        const referral: IReferral | null = await Referral.findOne({ telegramId: userId }).exec();
        if (!referral) {
            logger.error('Referal not found', userId);
            continue;
        }
        const referrer = await User.findOne({ inviteCode: user.referredByCode }).exec();
        if (!referrer) {
            logger.error('Referer not found', user.referredByCode);
            continue;
        }

        const diamondReward = log.diamond || 0;
        if (!diamondReward) {
            continue;
        }
        const bonusDiamond = Math.round(diamondReward * BONUS_DIAMOND_RATE);
        const bonusSei = diamondReward * BONUS_SEI_RATE;

        const afterRef = await Referral.findOneAndUpdate({ telegramId: userId }, { $inc: { bonusDiamond: bonusDiamond, bonusSei: -bonusSei } }, {new: true});
        const afterRefUser =  await User.findOneAndUpdate(
            { inviteCode: referral.inviteCode },
            { $inc: { 'referralBonus.totalDiamond': bonusDiamond, 'referralBonus.totalSei': -bonusSei } },
            {new: true}
        );
        logger.info(`Done update referee ${user.telegramId}, inviteCode ${referral.inviteCode}, diamond:${diamondReward}: ref: ${JSON.stringify(afterRef)}, user: ${JSON.stringify(afterRefUser?.referralBonus)}`);
    }

    logger.info('DONE');
};


await fixBonusSeiMinigame();