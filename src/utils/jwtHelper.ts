import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET!;

export const signJwt = (payload: object): string => {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
};

export const verifyJwt = (token: string) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        logger.error('JWT verification failed:', err);
        return null;
    }
};
