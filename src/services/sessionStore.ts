import { redisCommands } from '../io/redis';

const setSessionToken = async (userId: string, token: string) => {
    await redisCommands.set(`session:${userId}`, token, 'EX', 60 * 60 * 24); // Set with 24-hour expiration
};

const getSessionToken = async (userId: string): Promise<string | null> => {
    return await redisCommands.get(`session:${userId}`);
};

const deleteSessionToken = async (userId: string) => {
    await redisCommands.del(`session:${userId}`);
};

export { setSessionToken, getSessionToken, deleteSessionToken };
