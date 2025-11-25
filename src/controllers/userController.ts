import { createSeiWallet } from '../libs/seichain';
import geoip from 'geoip-lite';

import { redisPubSub } from '../io/redis';

import { signJwt } from '../utils/jwtHelper';
import { generateInviteCode } from '../utils/inviteCode';
import { getSessionToken, deleteSessionToken } from '../services/sessionStore';
import { encryptData } from '../utils/encryption';
import { handleError, isBeforeToday } from '../utils/common';

import User, { IHeadQuarterConfig, IUser } from '../models/user';
import Referral, { IReferral } from '../models/referral';
import * as landService from '../services/landService';
import * as treeService from '../services/treeService';
import * as idleFarmingService from '../services/idleFarmingService';
import * as userService from '../services/userService';
import * as referralService from '../services/referralService';
import { getHeadQuarterConfig } from '../utils/const';
import * as redis from '../services/redis';
import * as badgeService from '../services/badgeService';
import mongoose from 'mongoose';
import { addUserItem } from '../services/inventoryService';

export const userController = {
    telegramLogin: async ({ request }: any) => {
        try {
            const telegramUser = request.telegramUser;

            if (!telegramUser) {
                return new Response('Unauthorized', { status: 401 });
            }

            const { id: telegramId, first_name, last_name, username, photo_url, start_param } = telegramUser;

            // Extract IP address and perform geo lookup
            let ip =
                request.headers.get('CF-Connecting-IP') ||
                request.headers.get('X-Forwarded-For') ||
                request.headers.get('X-Client-IP') ||
                request.headers.get('true-client-ip') ||
                request.headers.get('cf-pseudo-ipv4');

            if (ip && Array.isArray(ip)) ip = ip[0];
            if (ip && ip.includes(',')) ip = ip.split(',')[0].trim();

            const geo = ip ? geoip.lookup(ip) : null;

            let user: IUser | null = await User.findOne({ telegramId }).exec();

            if (!user) {
                // New user case: generate new invite code and wallet
                let inviteCode = generateInviteCode();
                while (await User.findOne({ inviteCode }).exec()) {
                    inviteCode = generateInviteCode();
                }

                // Generate wallet details for the new user
                const { evmAddress, seiAddress, publicKey, privateKey, mnemonic } = await createSeiWallet();

                user = new User({
                    telegramId,
                    firstName: first_name,
                    lastName: last_name || '',
                    username,
                    photoUrl: photo_url,
                    createdAt: new Date(),
                    inviteCode,
                    loginCount: 1,
                    lastActiveAt: new Date(),
                    evmAddress: evmAddress,
                    seiAddress: seiAddress,
                    publicKey: encryptData(publicKey),
                    privateKey: encryptData(privateKey),
                    mnemonic: encryptData(mnemonic),
                    ip_location: [
                        {
                            ip_address: ip || 'unknown',
                            country: geo?.country || 'unknown',
                            city: geo?.city || 'unknown',
                            latitude: geo?.ll ? geo.ll[0] : 0,
                            longitude: geo?.ll ? geo.ll[1] : 0,
                            last_active_at: new Date(),
                        },
                    ],
                    isNewUser: true,
                });

                // If this user is being refered, increase referral count for the referer
                if (start_param) {
                    const referrer = await User.findOne({ inviteCode: start_param }).exec();
                    if (referrer) {
                        // Fetch referral configuration
                        let referralConfig = referrer.referralConfig || {
                            configRefMaxInvites: 0,
                            configRefThreshold: 0,
                            configRefReduction: 0,
                            currentReferralCount: 0, // Track the current referral count
                        };

                        let shouldApplySpecialLogic = false;
                        let shouldModifyReferredBy = false;
                        let currentReferralCount = referralConfig.currentReferralCount || 0;
                        const actualReferralCount = referrer.referralCount;

                        if (referralConfig.configRefMaxInvites > 0 && actualReferralCount >= referralConfig.configRefMaxInvites) {
                            shouldApplySpecialLogic = true;

                            // Determine the index for the referral logic
                            let referralIndex = currentReferralCount; // Start with the current count
                            const thresholdStart =
                                referralConfig.configRefReduction === 0 ? 0 : referralConfig.configRefThreshold - referralConfig.configRefReduction;

                            if (referralIndex < thresholdStart) {
                                // (1) If index is less than thresholdStart (meaning normal adding zone)
                                shouldModifyReferredBy = false; // Add referral as normal
                            } else if (referralIndex >= thresholdStart && referralIndex < referralConfig.configRefThreshold) {
                                // (2) If index is within the threshold range
                                shouldModifyReferredBy = true; // Modify referredBy
                            }

                            // Increment referral count or reset if it hits the threshold
                            referralIndex++;
                            if (referralIndex >= referralConfig.configRefThreshold) {
                                referralIndex = 0; // Reset the count
                            }

                            // Update currentReferralCount with the new index
                            currentReferralCount = referralIndex;
                        }

                        if (shouldApplySpecialLogic) {
                            if (shouldModifyReferredBy) {
                                // Add referredBy to _referredByRemark and do not push to referrer.referrals
                                user.referredByRemark = start_param; // Store the remark
                            } else {
                                // Normal referral process: set referredBy and push to referrals
                                let referral: IReferral = new Referral({
                                    telegramId: user.telegramId,
                                    inviteCode: start_param,
                                });
                                await referral.save();

                                await referrer.save();
                                await User.findOneAndUpdate({ telegramId: referrer.telegramId }, { $inc: { referralCount: 1 } });
                                await redis.incrUserWeeklyByType('referral', referrer.gameId, 1);

                                user.referredByCode = start_param;
                            }
                        } else {
                            // Normal process if configRefMaxInvites is 0 or not applying special logic
                            let referral: IReferral = new Referral({
                                telegramId: user.telegramId,
                                inviteCode: start_param,
                            });
                            await referral.save();

                            await referrer.save();
                            await User.findOneAndUpdate(
                                { telegramId: referrer.telegramId },
                                { $inc: { referralCount: 1 } },
                                { returnOriginal: false },
                            );
                            await redis.incrUserWeeklyByType('referral', referrer.gameId, 1);

                            user.referredByCode = start_param;
                        }

                        // Save the referrer if we modified the referral list or the referral count
                        if (!shouldModifyReferredBy || shouldApplySpecialLogic) {
                            // Update referralConfig with the current count
                            referralConfig.currentReferralCount = currentReferralCount;
                            referrer.referralConfig = referralConfig;
                            await referrer.save();
                        }
                    }
                }

                await user.save();
            } else {
                // Existing user case: check if wallet information is missing and regenerate if needed
                if (!user.evmAddress || !user.seiAddress || !user.publicKey || !user.privateKey || !user.mnemonic) {
                    const { evmAddress, seiAddress, publicKey, privateKey, mnemonic } = await createSeiWallet();

                    // Update existing user with encrypted wallet details
                    user.evmAddress = evmAddress;
                    user.seiAddress = seiAddress;
                    user.publicKey = encryptData(publicKey);
                    user.privateKey = encryptData(privateKey);
                    user.mnemonic = encryptData(mnemonic);
                }

                if (isBeforeToday(user.lastActiveAt)) {
                    user.loginCount += 1;
                }

                const existingIp = user.ip_location?.find((loc) => loc.ip_address === ip);
                if (!existingIp) {
                    user.ip_location.push({
                        ip_address: ip || 'unknown',
                        country: geo?.country || 'unknown',
                        city: geo?.city || 'unknown',
                        latitude: geo?.ll ? geo.ll[0] : 0,
                        longitude: geo?.ll ? geo.ll[1] : 0,
                        lastActiveAt: new Date(),
                    });
                    if (user.ip_location.length > 10) {
                        user.ip_location = user.ip_location.slice(-10);
                    }
                }

                user.lastActiveAt = new Date();
                await user.save();
            }

            // Check for existing session and invalidate it
            const existingToken = await getSessionToken(user.telegramId);
            if (existingToken) {
                await deleteSessionToken(user.telegramId);
                const message = JSON.stringify({
                    event: 'sessionInvalidated',
                    userId: telegramId,
                });
                await redisPubSub.publish('sessionEvents', message);
            }

            // Generate a JWT token using the verified Telegram user data
            const token = signJwt({
                telegramId: telegramUser.id.toString(),
            });

            // Init some redis data
            if (!user.isNewUser) {
                await redis.incrUserWeeklyByType('gold', user.gameId, 0);
                await redis.incrUserWeeklyByType('referral', user.gameId, 0);
            }

            // Return the token in the response
            return new Response(JSON.stringify({ token, userId: telegramUser.id.toString(), isNewUser: user.isNewUser }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (error) {
            return handleError(error, request);
        }
    },

    getMeUser: async ({ request }: any) => {
        try {
            const user = request.user;

            if (!user) {
                return new Response('Unauthorized', { status: 401 });
            }

            const userData: IUser | null = await User.findOne(
                { telegramId: user.telegramId },
                { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 },
            ).exec();

            if (!userData) {
                throw new Error('User not found');
            }

            return new Response(JSON.stringify(userData), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (error) {
            return handleError(error, request);
        }
    },

    onboard: async ({ request }: any) => {
        try {
            const userId = request.user?.telegramId;

            if (!userId) {
                return new Response('Unauthorized', { status: 401 });
            }

            const user: IUser | null = await User.findOne(
                { telegramId: userId },
                { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 },
            ).exec();

            if (!user) {
                throw new Error('User not found');
            }

            if (!user.isNewUser) {
                throw new Error('User is already onboarded');
            }

            // init land
            await landService.addDefaultUserLands(null, userId);

            // init tree
            await treeService.addDefaultUserTrees(null, userId);

            // init level
            user.isNewUser = false;
            user.level = 1;
            user.expForNextLevel = 15;

            // init HQ level
            const hqProp: IHeadQuarterConfig = getHeadQuarterConfig(1);
            user.headquarter = {
                level: 1,
                isUpgrading: false,
                upgradeStartTime: null,
                upgradeEndTime: null,
                nextUpgradeTimeSecond: hqProp.nextUpgradeTimeSecond,
                nextUpgradeFeeDiamond: hqProp.nextUpgradeFeeDiamond,
            };

            await user.save();

            // init lucky chest
            await addUserItem(userId, 'lucky_chest', 1, 0);

            // init idle farming
            await idleFarmingService.startIdleFarming(userId, null);

            // init some redis data
            await redis.incrUserWeeklyByType('gold', user.gameId, 0);
            await redis.incrUserWeeklyByType('referral', user.gameId, 0);

            if (user.referredByCode) {
                const pubMsg = JSON.stringify({
                    firstName: user.firstName,
                    lastName: user.lastName,
                    inviteCode: user.referredByCode,
                });
                await redisPubSub.publish('newOnboardF1', pubMsg);
            }

            if (user.referredByCode) {
                await User.findOneAndUpdate({ inviteCode: user.referredByCode }, { $inc: { spinnedTicket: 1 } }).exec();
            }

            return new Response(JSON.stringify({ user }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (error) {
            return handleError(error, request);
        }
    },

    getHeadquarter: async ({ request }: any) => {
        try {
            const userId = request.user?.telegramId;
            if (!userId) {
                return new Response('Unauthorized', { status: 401 });
            }

            const hq = await userService.getHeadQuarterInfo(userId);
            return new Response(JSON.stringify(hq), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (error) {
            return handleError(error, request);
        }
    },

    upgradeHeadquarter: async ({ request, body }: { request: any; body: any }) => {
        try {
            const userId = request.user?.telegramId;
            if (!userId) {
                return new Response('Unauthorized', { status: 401 });
            }
            const { upgradeType, concurrency } = body;

            const result = await userService.upgradeHQ(userId, upgradeType, concurrency);

            return new Response(JSON.stringify(result), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (error) {
            return handleError(error, request, body);
        }
    },

    getReferralInfo: async ({ request }: { request: any }) => {
        try {
            const userId = request.user?.telegramId;
            if (!userId) {
                return new Response('Unauthorized', { status: 401 });
            }
            const result = await referralService.getUserReferrals(userId);

            return new Response(JSON.stringify(result), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (error) {
            return handleError(error, request);
        }
    },

    claimReferralBonus: async ({ request, body }: { request: any; body: any }) => {
        try {
            const userId = request.user?.telegramId;
            if (!userId) {
                return new Response('Unauthorized', { status: 401 });
            }

            const result = await referralService.claimBonus(userId);

            return new Response(JSON.stringify(result), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (error) {
            return handleError(error, request, body);
        }
    },

    getWalletPP: async ({ request }: { request: any }) => {
        try {
            const userId = request.user?.telegramId;
            if (!userId) {
                return new Response('Unauthorized', { status: 401 });
            }

            const result = await userService.getWalletPassPhrase(userId);

            return new Response(JSON.stringify(result), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (error) {
            return handleError(error, request);
        }
    },

    getBadges: async ({ request }: { request: any }) => {
        try {
            const userId = request.user?.telegramId;
            if (!userId) {
                return new Response('Unauthorized', { status: 401 });
            }
            const result = await badgeService.getUserBadges(userId);

            return new Response(JSON.stringify(result), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (error) {
            return handleError(error, request);
        }
    },

    claimBadge: async ({ request, body }: { request: any; body: any }) => {
        try {
            const userId = request.user?.telegramId;
            if (!userId) {
                return new Response('Unauthorized', { status: 401 });
            }
            const { userBadgeId } = body;
            const result = await badgeService.claimUserBadge(userId, new mongoose.Types.ObjectId(userBadgeId as string));

            console.log(result);

            return new Response(JSON.stringify(result), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (error) {
            return handleError(error, request, body);
        }
    },

    convertIngameSei: async ({ request, body }: { request: any; body: any }) => {
        try {
            const userId = request.user?.telegramId;
            if (!userId) {
                return new Response('Unauthorized', { status: 401 });
            }

            const result = await userService.convertIngameSei(userId);

            return new Response(JSON.stringify(result), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (error) {
            return handleError(error, request, body);
        }
    },
};
