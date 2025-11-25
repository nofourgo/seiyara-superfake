import { verifyTelegramLogin, verifyTelegramLoginWeb } from './telegramAuth';
import { verifyJwt } from '../utils/jwtHelper';
import { Context } from 'elysia';
import crypto from 'crypto';
import { handleError } from '../utils/common';

const CMS_SECRET = process.env.CMS_SECRET!;
const validateHmacSignature = (path: string, hmac: string) => {
    const generatedHmac = crypto.createHmac('sha256', CMS_SECRET).update(path).digest('hex');
    return generatedHmac === hmac;
};

export const validateJwtMiddleware = ({ request }: Context) => {
    try {
        const authHeader = request.headers.get('Authorization');

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new Error('Missing or malformed Authorization header');
        }

        const token = authHeader.split(' ')[1];
        const decoded = verifyJwt(token);

        if (!decoded) {
            throw new Error('Invalid or expired token');
        }

        (request as any).user = decoded;
    } catch (error) {
        return handleError(error, request);
    }
};

export const validateCMSJwtMiddleware = ({ request }: Context) => {
    const hmacHeader = request.headers.get('X-CMS-HMAC');
    const path = '/api/cms/ranking'; // Update this path based on your route

    // Skip JWT if the request has a valid HMAC signature
    if (hmacHeader && validateHmacSignature(path, hmacHeader)) {
        return; // Authorized as CMS request
    }

    // Otherwise, proceed with JWT validation for non-CMS requests
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response('Missing or malformed Authorization header', { status: 401 });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyJwt(token);

    if (!decoded) {
        return new Response('Invalid or expired token', { status: 401 });
    }

    (request as any).user = decoded;
};

export const validateTelegramInitData = ({ request }: { request: any }) => {
    try {
        // Extract the `--webapp-init` header
        const initData = request.headers.get('--webapp-init');

        if (!initData) {
            throw new Error('Missing --webapp-init header');
        }

        // Verify the Telegram login using the initData
        const telegramUser = verifyTelegramLogin(initData);

        if (!telegramUser) {
            throw new Error('Invalid Telegram authentication');
        }

        request.telegramUser = telegramUser;
    } catch (error) {
        return handleError(error, request);
    }
};

export const validateTelegramAuth = async ({ request }: { request: any }) => {
    try {
        // Read and parse the request body
        const rawBody = await request.text(); // Read the stream as text
        const parsedBody = JSON.parse(rawBody); // Parse JSON text into an object

        // Convert parsed body into a Map<string, string>
        const authDataMap = new Map<string, string>(
            Object.entries(parsedBody || {}).map(([key, value]) => [key, String(value)])
        );

        // Verify Telegram login using authDataMap
        const telegramUser = await verifyTelegramLoginWeb(authDataMap);

        if (!telegramUser) {
            throw new Error('Invalid Telegram authentication');
        }

        // Attach the validated user to the request for downstream handlers
        request.telegramUser = telegramUser;
    } catch (error) {
        return handleError(error, request);
    }
};