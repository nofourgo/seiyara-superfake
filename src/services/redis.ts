import { redisCommands } from '../io/redis';
import { getWeekIndex } from '../utils/common';

// Set User ranking
const getWeekRankingRedisKey = (type: string): string => {
    const weekIndex = getWeekIndex(new Date());
    return `${type}_rank:week_${weekIndex}`; // e.g., gold_rank:week_20240101
}

const getUserSlug = (gameId: number): string => {
    return gameId.toString().padStart(9, '0');
}

export const incrUserWeeklyByType = async (type: 'gold' | 'referral', gameId: number, point: number) => {
    const key = getWeekRankingRedisKey(type);
    const userSlug = getUserSlug(gameId);

    await redisCommands.zincrby(key, point, userSlug); // Increment user's score
    await redisCommands.expire(key, 7 * 24 * 60 * 60); // Expire in 7 days
};

export const getTopUsersWeeklyByType = async (type: 'gold' | 'referral', limit: number): Promise<Array<{ gameId: number; point: number }>> => {
    const key = getWeekRankingRedisKey(type);
    const membersWithScores = await redisCommands.zrevrange(key, 0, limit - 1, 'WITHSCORES');

    const users = [];
    for (let i = 0; i < membersWithScores.length; i += 2) {
        const gameId = parseInt(membersWithScores[i]);
        users.push({
            gameId,
            point: parseInt(membersWithScores[i + 1]),
        });
    }
    return users;
};

export const getMeWeeklyRankByType =  async (type: 'gold' | 'referral', gameId: number): Promise<{me: number, point: number}> => {
    const key = getWeekRankingRedisKey(type);
    const meRank = await redisCommands.zrevrank(key, getUserSlug(gameId));
    const mePoint = await redisCommands.zscore(key, getUserSlug(gameId));
    if (meRank == null || mePoint == null) {
        throw new Error('gameId not found');
    }
    return { me: meRank, point: parseInt(mePoint) } ;
}

export const getMeWeeklyPoint =  async (type: 'gold' | 'referral', gameId: number): Promise<{point: number}> => {
    const key = getWeekRankingRedisKey(type);
    const mePoint = await redisCommands.zscore(key, getUserSlug(gameId));
    if (mePoint == null) {
        throw new Error('gameId not found');
    }
    return { point: parseInt(mePoint) } ;
}
