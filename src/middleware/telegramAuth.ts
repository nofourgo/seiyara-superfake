import CryptoJS from 'crypto-js';
import logger from '../utils/logger';

export interface TelegramUser {
    id: string;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    start_param?: string;
}

export const verifyTelegramLogin = (initData: string): TelegramUser | false => {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
        throw new Error('TELEGRAM_BOT_TOKEN is not defined in the environment variables');
    }

    const params = new URLSearchParams(decodeURIComponent(initData));
    const start_param = params.get('start_param');

    const hash = params.get('hash');
    params.delete('hash');

    const dataCheckString = Array.from(params.entries())
        .sort()
        .map((e) => `${e[0]}=${e[1]}`)
        .join('\n');

    const secretKey = CryptoJS.HmacSHA256(token, 'WebAppData');
    const computedHash = CryptoJS.HmacSHA256(dataCheckString, secretKey).toString(CryptoJS.enc.Hex);

    // Bypass authentication check if not in production
    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction && computedHash !== hash) {
        logger.error('Data is NOT from Telegram');
        return false;
    }

    const authDate = parseInt(params.get('auth_date') as string, 10);
    if (isProduction && Date.now() / 1000 - authDate > 86400) {
        logger.error('Data is outdated');
        return false;
    }

    const userString = params.get('user');
    if (!userString) {
        logger.error('User data not found in params');
        return false;
    }

    const user = JSON.parse(userString);

    return {
        id: user.id.toString(),
        first_name: user.first_name,
        last_name: user.last_name || '',
        username: user.username || '',
        photo_url: user.photo_url || undefined,
        start_param: start_param || undefined,
    };
};

import { AuthDataValidator } from '@telegram-auth/server';

// Initialize the validator with the bot token
const validator = new AuthDataValidator({
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
});

export const verifyTelegramLoginWeb = async (authDataMap: Map<string, string>): Promise<TelegramUser | false> => {
    try {
        // Validate Telegram authentication data using @telegram-auth/server
        const user = await validator.validate(authDataMap);

        if (!user) {
            console.log('Validation failed: No user data returned');
            return false;
        }

        console.log('Validated Telegram User:', user);

        // Return the validated user data
        return {
            id: user.id.toString(),
            first_name: user.first_name,
            last_name: user.last_name || '',
            username: user.username || '',
            photo_url: user.photo_url || undefined,
            start_param: authDataMap.get('start_param') || undefined,
        };
    } catch (error) {
        console.log('Error verifying Telegram OAuth data:', error);
        return false;
    }
};