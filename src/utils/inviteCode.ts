import crypto from 'crypto';

const base62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const toBase62 = (num: number): string => {
    let str = '';
    while (num > 0) {
        str = base62[num % 62] + str;
        num = Math.floor(num / 62);
    }
    return str;
};

export const generateInviteCode = (): string => {
    const timestamp = toBase62(Date.now());
    const randomComponent = toBase62(parseInt(crypto.randomBytes(3).toString('hex'), 16));
    return `${timestamp}${randomComponent}`;
};
