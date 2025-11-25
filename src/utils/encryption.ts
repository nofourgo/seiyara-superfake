import CryptoJS from 'crypto-js';

const SECRET_KEY = process.env.SECRET_KEY!;

export function encryptData(data: string): string {
    return CryptoJS.AES.encrypt(data, SECRET_KEY).toString();
}

export function decryptData(encryptedData: string): string {
    const bytes = CryptoJS.AES.decrypt(encryptedData, SECRET_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
}
