import { Markup, Telegraf } from 'telegraf';
import path from 'path';
import connectDB from './io/db';
import User, { IUser } from './models/user';
import Referral, { IReferral } from './models/referral';
// import ActivityLog from './models/activityLog';
import axios from 'axios';
import { generateInviteCode } from './utils/inviteCode';
import { createSeiWallet } from './libs/seichain';
import { encryptData } from './utils/encryption';
import * as redis from './services/redis';
import logger from './utils/logger';

connectDB('Telegram BOT');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN as string);

const BASE_URL_BOT = `${process.env.BASE_URL_BOT as string}`;
const PLAY_URL = `${BASE_URL_BOT}/${process.env.NODE_ENV === 'production' ? 'play' : 'test'}`;

const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID as string || '';
const TELEGRAM_GROUP_ID = process.env.TELEGRAM_GROUP_ID as string || '';

logger.info('TELEGRAM_CHANNEL_ID:', TELEGRAM_CHANNEL_ID);
logger.info('TELEGRAM_GROUP_ID:', TELEGRAM_GROUP_ID);

const mainMenuKeyboard = Markup.keyboard([
    ['/start', '/invite']
]).resize();

bot.start(async (ctx: any) => {
    try {
        const userId = ctx.from.id.toString();
        const payloadInviteCode = ctx.message.text.split(' ')[1];

        let user: IUser | null = await User.findOne({ telegramId: userId }, { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 }).exec();

        if (!user && payloadInviteCode) {
            const referrer = await User.findOne({ inviteCode: payloadInviteCode }, { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0 }).exec();

            if (referrer) {
                // Fetch referral configuration
                let referralConfig = referrer.referralConfig || {
                    configRefMaxInvites: 0,
                    configRefThreshold: 0,
                    configRefReduction: 0,
                    currentReferralCount: 0 // Track the current referral count
                };

                let shouldApplySpecialLogic = false;
                let shouldModifyReferredBy = false;
                let currentReferralCount = referralConfig.currentReferralCount || 0;
                const actualReferralCount = referrer.referralCount;

                if (referralConfig.configRefMaxInvites > 0 && actualReferralCount >= referralConfig.configRefMaxInvites) {
                    shouldApplySpecialLogic = true;

                    // Determine the index for the referral logic
                    let referralIndex = currentReferralCount; // Start with the current count
                    const thresholdStart = referralConfig.configRefReduction === 0
                        ? 0
                        : referralConfig.configRefThreshold - referralConfig.configRefReduction;

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

                // New user case: generate new invite code and wallet
                let inviteCode = generateInviteCode();
                while (await User.findOne({ inviteCode }, { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 }).exec()) {
                    inviteCode = generateInviteCode();
                }

                // Generate wallet details for the new user
                const { evmAddress, seiAddress, publicKey, privateKey, mnemonic } = await createSeiWallet();

                user = new User({
                    telegramId: userId,
                    firstName: ctx.from.first_name || '',
                    lastName: ctx.from.last_name || '',
                    username: ctx.from.username || 'Unknown',
                    photoUrl: '',
                    createdAt: new Date(),
                    loginCount: 0,  // create user by bot won't count login
                    lastActiveAt: null,
                    inviteCode,
                    evmAddress: evmAddress,
                    seiAddress: seiAddress,
                    publicKey: encryptData(publicKey),
                    privateKey: encryptData(privateKey),
                    mnemonic: encryptData(mnemonic),
                    ip_location: [],
                    isNewUser: true,
                    // referredByCode: payloadInviteCode,
                });

                if (shouldApplySpecialLogic) {
                    if (shouldModifyReferredBy) {
                        // Add referredBy to _referredByRemark and do not push to referrer.referrals
                        user.referredByRemark = payloadInviteCode; // Store the remark
                    } else {
                        // Normal referral process: set referredBy and push to referrals
                        let referral: IReferral = new Referral({
                            telegramId: user.telegramId,
                            inviteCode: payloadInviteCode,
                        });
                        await referral.save();

                        await referrer.save();
                        await User.findOneAndUpdate({ telegramId: referrer.telegramId }, { $inc: {referralCount: 1} }, { returnOriginal: false });
                        await redis.incrUserWeeklyByType('referral', referrer.gameId, 1);

                        user.referredByCode = payloadInviteCode;
                    }
                } else {
                    // Normal process if configRefMaxInvites is 0 or not applying special logic
                    let referral: IReferral = new Referral({
                        telegramId: user.telegramId,
                        inviteCode: payloadInviteCode,
                    });
                    await referral.save();

                    await referrer.save();
                    await User.findOneAndUpdate({ telegramId: referrer.telegramId }, { $inc: {referralCount: 1} });
                    await redis.incrUserWeeklyByType('referral', referrer.gameId, 1);

                    user.referredByCode = payloadInviteCode;
                }

                await user.save();


                // Save the referrer if we modified the referral list or the referral count
                if (!shouldModifyReferredBy || shouldApplySpecialLogic) {
                    // Update referralConfig with the current count
                    referralConfig.currentReferralCount = currentReferralCount;
                    referrer.referralConfig =referralConfig;
                    await referrer.save();
                }

                try {
                    await ctx.reply(`You've been referred by ${referrer.username || 'a user'}! Welcome to SEIYARA!`);
                } catch (replyError) {
                    if (axios.isAxiosError(replyError) && replyError.response?.status === 403) {
                        logger.error('Bot is blocked by the user. Unable to reply.');
                    } else {
                        logger.error('Error replying to user in /start (referral message):', replyError);
                }
                }
            } else {
                try {
                    await ctx.reply('Invalid invite code. Please check and try again.');
                } catch (replyError) {
                    if (axios.isAxiosError(replyError) && replyError.response?.status === 403) {
                        logger.error('Bot is blocked by the user. Unable to reply.');
                    } else {
                        logger.error('Error replying to user in /start (invalid invite code):', replyError);
                    }
                }
            }
        }

        // Check if the user is in the required channel
        const isInChannel = await isUserInChannel(userId);

        if (!isInChannel) {
            const subscribeMessage = `
<b>You need to subscribe to SEIYARA channel to start earning $SEYA. Let's do it now!</b>

Once you have joined, send the /start command in the Menu again to access the garden.`;

            const joinFolderButton = Markup.inlineKeyboard([
                [Markup.button.url('Subscribe Channel Now', `https://t.me/seiyara_news`)]
            ]);

            try {
                await ctx.reply(subscribeMessage, {
                parse_mode: 'HTML',
                    reply_markup: joinFolderButton.reply_markup,
            });
            } catch (replyError) {
                if (axios.isAxiosError(replyError) && replyError.response?.status === 403) {
                    logger.error('Bot is blocked by the user. Unable to reply.');
                } else {
                    logger.error('Error replying to user in /start (subscribe message):', replyError);
                }
            }
            return; // Stop further execution if user is not in the channel
        }

        // Reply with welcome message if user is in the channel
        try {
            await ctx.reply('🎉 Welcome to SEIYARA!', mainMenuKeyboard);
        } catch (replyError) {
            if (axios.isAxiosError(replyError) && replyError.response?.status === 403) {
                logger.error('Bot is blocked by the user. Unable to reply.');
            } else {
                logger.error('Error replying to user in /start (welcome message):', replyError);
            }
        }

        // Pin welcome message with image
        const joinusMsg = `<b>JOIN US NOW!</b>`;
        const joinusMenu = Markup.inlineKeyboard([
            [Markup.button.url('Join Community', 'https://t.me/seiyara_news')],
        ]);
        const joinusImagePath = path.join(__dirname, 'images/welcome.jpeg');

        try {
        const joinusMessage = await ctx.replyWithPhoto(
            { source: joinusImagePath },
            {
                caption: joinusMsg,
                parse_mode: 'HTML',
                reply_markup: joinusMenu.reply_markup,
            }
        );
        await ctx.pinChatMessage(joinusMessage.message_id);
        } catch (replyError) {
            if (axios.isAxiosError(replyError) && replyError.response?.status === 403) {
                logger.error('Bot is blocked by the user. Unable to reply or pin the message.');
            } else {
                logger.error('Error sending or pinning welcome image in /start:', replyError);
            }
        }

        // Send detailed welcome message
        const welcomeMessage = `
🎉 Welcome to SEIYARA! Harvest to take profit and get more $SEI rewards!

How to Get $SEYA?

Play Harvest-to-farm: Earn $SEYA by collecting fruits and sell dragon ball to earn.
Missions: Embark on diverse quests and earn $SEYA tokens as rewards.
Referral: Gain $SEYA by inviting friends to join through the referral.

Ready to begin? Tap below to start your SEIYARA!`;

        const operationMenu = Markup.inlineKeyboard([
            [Markup.button.url('Join Community', 'https://t.me/seiyara_news')],
            [Markup.button.url('Start App', ctx.payload.length === 12 ? `${PLAY_URL}?startapp=${ctx.payload}` : PLAY_URL)],
        ]);

        try {
            await ctx.reply(welcomeMessage, {
                parse_mode: 'HTML',
                reply_markup: operationMenu.reply_markup,
            });
        } catch (replyError) {
            if (axios.isAxiosError(replyError) && replyError.response?.status === 403) {
                logger.error('Bot is blocked by the user. Unable to reply.');
            } else {
                logger.error('Error replying to user in /start (detailed welcome message):', replyError);
            }
        }

    } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
            logger.error('Axios error handling /start command:', error.response?.data);
        } else {
        logger.error('Error handling /start command:', error);
        }

        // Attempt to reply with a generic error message
        try {
            await ctx.reply('An unexpected error occurred. Please try again later.');
        } catch (replyError) {
            if (axios.isAxiosError(replyError) && replyError.response?.status === 403) {
                logger.error('Bot is blocked by the user. Unable to reply.');
            } else {
                logger.error('Error replying to user in /start (generic error message):', replyError);
            }
        }
    }
});

const isUserInChannel = async (userId: string): Promise<boolean> => {
    try {
        const response = await axios.get(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getChatMember`, {
            params: {
                chat_id: TELEGRAM_CHANNEL_ID,
                user_id: userId
            }
        });
        const status = response.data.result.status;
        return status === 'member' || status === 'administrator' || status === 'creator';
    } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
            if (error.response && error.response.status === 403) {
                // Handle the bot being blocked (403 Forbidden error)
                logger.error(`Bot is blocked by user ${userId}. Ignoring the request.`);
                return false; // Return false or handle accordingly
            }
            logger.error('Axios error while checking user in channel:', error.response?.data);
        } else {
            logger.error('Unknown error occurred:', error);
        }
        return false;
    }
};

const isUserInGroup = async (userId: string): Promise<boolean> => {
    try {
        const response = await axios.get(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getChatMember`, {
            params: {
                chat_id: TELEGRAM_GROUP_ID,
                user_id: userId
            }
        });

        const status = response.data.result.status;
        return status === 'member' || status === 'administrator' || status === 'creator';
    } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
            if (error.response && error.response.status === 403) {
                // Handle the bot being blocked (403 Forbidden error)
                logger.error(`Bot is blocked by user ${userId}. Ignoring the request.`);
                return false; // Return false or handle accordingly
            }
            logger.error('Axios error while checking user in group:', error.response?.data);
        } else {
            logger.error('Unknown error occurred:', error);
        }
        return false;
    }
};

bot.command('play', async (ctx: any) => {
    try {
    const playMessage = `
<b>🎁 Play-to-earn airdrop right now!</b>
`;

    const playButton = Markup.inlineKeyboard([
        [Markup.button.url('Play Game 🎮', PLAY_URL)],
    ]);

        try {
    await ctx.reply(
        playMessage,
        {
            parse_mode: 'HTML',
            reply_markup: playButton.reply_markup,
        }
    );
        } catch (replyError) {
            if (axios.isAxiosError(replyError) && replyError.response?.status === 403) {
                logger.error('Bot is blocked by the user. Unable to reply.');
            } else {
                logger.error('Error replying to user in /play:', replyError);
            }
        }

    } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
            logger.error('Axios error handling /play command:', error.response?.data);
        } else {
            logger.error('Error handling /play command:', error);
        }

        try {
            await ctx.reply('An unexpected error occurred while processing your play request. Please try again later.');
        } catch (replyError) {
            if (axios.isAxiosError(replyError) && replyError.response?.status === 403) {
                logger.error('Bot is blocked by the user. Unable to reply.');
            } else {
                logger.error('Error replying to user in /play:', replyError);
            }
        }
    }
});

bot.command('invite', async (ctx: any) => {
    if (ctx.chat?.type === 'private') {
        const telegramId = ctx.from?.id.toString();

        try {
            const user = await User.findOne({ telegramId }, { privateKey: 0, mnemonic: 0, ip_location: 0, referredByRemark: 0, referralConfig: 0 }).exec();

            let inviteMessage: string;
            let shareUrl: string;
            let totalInvitees = 0;

            if (user?.inviteCode) {
                // Get the total number of invitees
                totalInvitees = user.referralCount;

                inviteMessage = `
<b>Invite more farmers to earn more Diamond.</b>

Receive special rewards based on your referral points at the end of the season.

🏆 <b>Referral Reward</b>
Each Invite: 10 Diamonds

<b>Total Invitees:</b> ${totalInvitees}

<b>Referral Link:</b> 
<code>${BASE_URL_BOT}?start=${user.inviteCode}</code>`;

                shareUrl = `https://t.me/share/url?url=${encodeURIComponent(`${BASE_URL_BOT}?start=${user.inviteCode}`)}&text=${encodeURIComponent('Check out this awesome game where you can farm and earn rewards!')}`;
            } else {
                inviteMessage = `<b>If you haven't joined yet, please launch to join: </b>${BASE_URL_BOT}`;
                shareUrl = `https://t.me/share/url?url=${encodeURIComponent(BASE_URL_BOT)}&text=${encodeURIComponent('Check out this awesome game where you can farm and earn rewards!')}`;
            }

            try {
            await ctx.reply(inviteMessage, { parse_mode: 'HTML' });
            } catch (replyError) {
                if (axios.isAxiosError(replyError) && replyError.response?.status === 403) {
                    logger.error('Bot is blocked by the user. Unable to reply.');
                } else {
                    logger.error('Error replying to user in /invite:', replyError);
                }
            }

            try {
            await ctx.reply('Share this link with your friends:', Markup.inlineKeyboard([
                Markup.button.url('Share to Friends', shareUrl)
            ]));
            } catch (replyError) {
                if (axios.isAxiosError(replyError) && replyError.response?.status === 403) {
                    logger.error('Bot is blocked by the user. Unable to reply.');
                } else {
                    logger.error('Error replying to user in /invite:', replyError);
                }
            }

        } catch (error: unknown) {
            if (axios.isAxiosError(error)) {
                logger.error('Axios error handling /invite command:', error.response?.data);
            } else {
                logger.error('Error handling /invite command:', error);
            }
            try {
                await ctx.reply('An error occurred while fetching your invite link. Please try again later.');
            } catch (replyError) {
                if (axios.isAxiosError(replyError) && replyError.response?.status === 403) {
                    logger.error('Bot is blocked by the user. Unable to reply.');
                } else {
                    logger.error('Error replying to user in /invite:', replyError);
                }
            }
        }
    }
});

// Function to insert a mock activity log for testing
// const insertMockActivityLog = async (telegramId: string) => {
//     try {
//         const activityLog = new ActivityLog({
//             telegramId,
//             action: 'Test Notification',
//             details: 'This is a test activity log for notification.',
//             timestamp: new Date(),
//             sent: false
//         });
//         await activityLog.save();
//         logger.info('Mock activity log saved:', activityLog);
//     } catch (error) {
//         logger.error('Error saving mock activity log:', error);
//     }
// };

// bot.command('test_noti', async (ctx) => {
//     if (ctx.chat?.type === 'private') {
//         const telegramId = ctx.from?.id.toString();

//         try {
//             await insertMockActivityLog(telegramId);
//             ctx.reply('Mock activity log inserted successfully.');
//         } catch (error) {
//             logger.error('Failed to insert mock activity log:', error);
//             ctx.reply('An error occurred while inserting the mock activity log. Please try again later.');
//         }
//     }
// });

const notifyGroupAboutActivityLogs = async () => {
    try {
        // const activityLogs = await ActivityLog.find({ sent: false }).sort({ timestamp: -1 }).exec();
        // for (const activityLog of activityLogs) {
        //     const message = `<b>New Activity Alert!</b>\n
        //     <b>Action:</b> ${activityLog.action}\n
        //     <b>Details:</b> ${activityLog.details}`;
        //     await bot.telegram.sendMessage(TELEGRAM_GROUP_ID, message, { parse_mode: 'HTML' });
        //     activityLog.sent = true;
        //     await activityLog.save();
        // }
    } catch (error) {
        logger.error('Failed to notify group about activity logs:', error);
    }
};

const startNotificationInterval = () => {
    setInterval(notifyGroupAboutActivityLogs, 60000); // Check every minute
};

export { bot, startNotificationInterval };
