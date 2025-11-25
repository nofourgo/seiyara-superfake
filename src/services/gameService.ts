import User, { IUser } from '../models/user';
import * as redis from '../services/redis';

interface RankedUserInfo {
    gameId: number;
    point: number;
}

const TOP_RANKING_LIMIT = 50;

const rankByHQ = async (gameId: number, userHqLevel: number): Promise<{ ranking: Array<RankedUserInfo>; me: number; point: number }> => {
    const users: IUser[] = await User.find({ headquarter: { $exists: true, $ne: null } })
        .select('gameId headquarter.level')
        .sort({ 'headquarter.level': -1, gameId: -1 })
        .limit(TOP_RANKING_LIMIT)
        .exec();

    const meLevel = await User.countDocuments({
        $and: [
            { headquarter: { $exists: true, $ne: null } }, 
            { $or: [
                { 'headquarter.level': { $gt: userHqLevel } }, 
                { 'headquarter.level': userHqLevel, gameId: { $gt: gameId } }
            ] },
        ],
    });

    return {
        ranking: users.map((user) => ({
            gameId: user.gameId,
            point: user.headquarter.level,
        })),
        me: meLevel + 1,
        point: userHqLevel,
    };
};

const rankByTotalGold = async (gameId: number, gold: number): Promise<{ ranking: Array<RankedUserInfo>; me: number; point: number }> => {
    const users: IUser[] = await User.find().select('gameId totalEarnedGold').sort({ totalEarnedGold: -1, gameId: -1 }).limit(TOP_RANKING_LIMIT).exec();

    const meLevel = await User.countDocuments({
        $or: [{ totalEarnedGold: { $gt: gold } }, { totalEarnedGold: gold, gameId: { $gt: gameId } }],
    });

    return {
        ranking: users.map((user) => ({
            gameId: user.gameId,
            point: user.totalEarnedGold,
        })),
        me: meLevel + 1,
        point: gold,
    };
};

const rankByTotalRefer = async (gameId: number, referralCount: number): Promise<{ ranking: Array<RankedUserInfo>; me: number; point: number }> => {
    const users: IUser[] = await User.find().select('gameId referralCount').sort({ referralCount: -1, gameId: -1 }).limit(TOP_RANKING_LIMIT).exec();

    const meLevel = await User.countDocuments({
        $or: [{ referralCount: { $gt: referralCount } }, { referralCount: referralCount, gameId: { $gt: gameId } }],
    });

    return {
        ranking: users.map((user) => ({
            gameId: user.gameId,
            point: user.referralCount,
        })),
        me: meLevel + 1,
        point: referralCount,
    };
};

const rankByWeeklyByType = async (type: 'gold' | 'referral', gameId: number): Promise<{ ranking: Array<RankedUserInfo>; me: number; point: number }> => {
    const users: RankedUserInfo[] = await redis.getTopUsersWeeklyByType(type, TOP_RANKING_LIMIT);
    const { me, point } = await redis.getMeWeeklyRankByType(type, gameId);
    return {
        ranking: users,
        me: me + 1,
        point: point,
    };
};

export const getRankings = async (userId: string) => {
    const user: IUser | null = await User.findOne({ telegramId: userId }, { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 }).exec();
    if (!user) {
        throw new Error('User not found');
    }
    const userHqLevel = user.headquarter.level;
    const gold = user.totalEarnedGold;
    const referralCount = user.referralCount;

    const [hqRankings, goldRankings, goldRankingsWeekly, referRankings, referRankingsWeekly] = await Promise.all([
        rankByHQ(user.gameId, userHqLevel),

        rankByTotalGold(user.gameId, gold),
        rankByWeeklyByType('gold', user.gameId),

        rankByTotalRefer(user.gameId, referralCount),
        rankByWeeklyByType('referral', user.gameId),
    ]);

    // Combine results into an object
    const rankings = {
        hq: {
            total: hqRankings,
        },
        gold: {
            total: goldRankings,
            weekly: goldRankingsWeekly,
        },
        referral: {
            total: referRankings,
            weekly: referRankingsWeekly,
        },
    };

    return { rankings };
};
