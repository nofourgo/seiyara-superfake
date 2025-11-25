import mongoose from 'mongoose';
import cfgItem from '../../models/cfgItem';
import cfgQuest from '../../models/cfgQuest';
import cfgTree from '../../models/cfgTree';
import cfgLand from '../../models/cfgLand';
import cfgAchievement from '../../models/cfgAchievement';
import cfgShopItem from '../../models/cfgShopItem';
import cfgSubscription from '../../models/cfgSubscription';
import logger from '../../utils/logger';

// Configuration flags for enabling or disabling seeding
const config: any = {
    seedCfgTrees: false,
    seedCfgLands: false,
    seedCfgItems: false,
    seedCfgQuests: false,
    seedCfgAchievements: false,
    seedCfgShopItems: false,
    seedCfgSub: false,
};

await mongoose.connect(process.env.MONGO_URI!);

const seedDB = async () => {
    try {
        if (config.seedCfgTrees) {
            await cfgTree.deleteMany({});
            const cfgTrees = [
                {
                    name: 'Vegeta',
                    description: 'Free tree',
                    minUserLevel: 0,
                    seiPrice: 0,
                    reward: [{ type: 'gold', quantity: 20 }],
                    harvestTimeInSec: 5,
                    chestChance: 2,
                    landSlots: [1, 2, 3, 4, 5, 6, 7, 8, 9],
                },
                {
                    name: 'Bulmango',
                    description: 'Unlocked at user level 2',
                    minUserLevel: 2,
                    seiPrice: 0,
                    reward: [{ type: 'gold', quantity: 53 }],
                    harvestTimeInSec: 12,
                    chestChance: 2,
                    landSlots: [1, 2, 3, 4, 5, 6, 7, 8, 9],
                },
                {
                    name: 'Trunkon',
                    description: 'Unlocked at user level 5',
                    minUserLevel: 5,
                    seiPrice: 0,
                    reward: [{ type: 'gold', quantity: 86 }],
                    harvestTimeInSec: 18,
                    chestChance: 3,
                    landSlots: [1, 2, 3, 4, 5, 6, 7, 8, 9],
                },
                {
                    name: 'Friezo',
                    description: 'Unlocked at user level 8+',
                    minUserLevel: 8,
                    seiPrice: 0,
                    reward: [{ type: 'gold', quantity: 114 }],
                    harvestTimeInSec: 22,
                    chestChance: 3,
                    landSlots: [1, 2, 3, 4, 5, 6, 7, 8, 9],
                },
                {
                    name: 'Cellmon',
                    description: 'Unlocked at user level 10+',
                    minUserLevel: 10,
                    seiPrice: 0,
                    reward: [{ type: 'gold', quantity: 336 }],
                    harvestTimeInSec: 60,
                    chestChance: 5,
                    landSlots: [1, 2, 3, 4, 5, 6, 7, 8, 9],
                },
                {
                    name: 'Majiboo',
                    description: 'Unlocked at user level 15+',
                    minUserLevel: 15,
                    seiPrice: 0,
                    reward: [{ type: 'gold', quantity: 576 }],
                    harvestTimeInSec: 96,
                    chestChance: 5,
                    landSlots: [1, 2, 3, 4, 5, 6, 7, 8, 9],
                },
                {
                    name: 'Kakuro',
                    description: 'Purchase at 10 $SEI',
                    minUserLevel: 0,
                    seiPrice: 10,
                    reward: [{ type: 'gold', quantity: 1180 }],
                    harvestTimeInSec: 118,
                    chestChance: 10,
                    landSlots: [7, 8, 9],
                },
                {
                    name: 'Gohberry',
                    description: 'Purchase at 20 $SEI',
                    minUserLevel: 0,
                    seiPrice: 20,
                    reward: [{ type: 'gold', quantity: 1500 }],
                    harvestTimeInSec: 125,
                    chestChance: 10,
                    landSlots: [7, 8, 9],
                },
                {
                    name: 'Chichiapple',
                    description: 'Purchase at 50 $SEI',
                    minUserLevel: 0,
                    seiPrice: 50,
                    reward: [{ type: 'gold', quantity: 2100 }],
                    harvestTimeInSec: 150,
                    chestChance: 10,
                    landSlots: [7, 8, 9],
                },
            ];
            await cfgTree.insertMany(cfgTrees);
            logger.info('cfgTrees seeded!');
        }

        if (config.seedCfgItems) {
            await cfgItem.deleteMany({});
            const cfgItems = [
                { type: 'lucky_chest', level: 0, name: 'Lucky Chest', description: 'Lucky Chest to get $GOLD and Dragon Chest', properties: {} },
                { type: 'dragon_chest', level: 0, name: 'Dragon Ball Chest', description: 'Dragon Ball Chest with premium rewards', properties: {} },
                { type: 'dragon_ball', level: 1, name: '1-Star Dragon Ball', description: '1-Star Dragon Ball', properties: {} },
                { type: 'dragon_ball', level: 2, name: '2-Star Dragon Ball', description: '2-Star Dragon Ball', properties: {} },
                { type: 'dragon_ball', level: 3, name: '3-Star Dragon Ball', description: '3-Star Dragon Ball', properties: {} },
                { type: 'dragon_ball', level: 4, name: '4-Star Dragon Ball', description: '4-Star Dragon Ball', properties: {} },
                { type: 'dragon_ball', level: 5, name: '5-Star Dragon Ball', description: '5-Star Dragon Ball', properties: {} },
                { type: 'dragon_ball', level: 6, name: '6-Star Dragon Ball', description: '6-Star Dragon Ball', properties: {} },
                { type: 'dragon_ball', level: 7, name: '7-Star Dragon Ball', description: '7-Star Dragon Ball', properties: {} },
            ];
            await cfgItem.insertMany(cfgItems);
            logger.info('cfgItems seeded!');
        }

        if (config.seedCfgQuests) {
            await cfgQuest.deleteMany({});
            const cfgQuests = [
                { name: 'Checkin on chain', type: 'daily', tasks: [{ description: 'Checkin on chain', type: 'confirm_onchain' }], reward: [{ type: 'diamond', quantity: 50 }] },
                { name: 'Welcome Gift', type: 'one_time', tasks: [{ description: 'Welcome Gift', type: 'gift_welcome' }], reward: [{ type: 'diamond', quantity: 20 }] },
                { name: 'Join Telegram Channel', type: 'one_time', tasks: [{ description: 'Join Telegram Channel', type: 'join_telegram_channel' }], reward: [{ type: 'diamond', quantity: 20 }] },
                { name: 'Join Telegram Group', type: 'one_time', tasks: [{ description: 'Join Telegram Group', type: 'join_telegram_group' }], reward: [{ type: 'diamond', quantity: 20 }] },
                { name: 'Follow X', type: 'one_time', tasks: [{ description: 'Follow X', type: 'follow_twitter' }], reward: [{ type: 'diamond', quantity: 20 }] },
            ];
            await cfgQuest.insertMany(cfgQuests);
            logger.info('cfgQuests seeded!');
        }

        if (config.seedCfgLands) {
            await cfgLand.deleteMany({});
            const cfgLands = [
                { slot: 1, minUserLevel: 0, seiPrice: 0 },
                { slot: 2, minUserLevel: 0, seiPrice: 0 },
                { slot: 3, minUserLevel: 0, seiPrice: 0 },
                { slot: 4, minUserLevel: 0, seiPrice: 0.1 },
                { slot: 5, minUserLevel: 0, seiPrice: 1 },
                { slot: 6, minUserLevel: 0, seiPrice: 10 },
                { slot: 7, minUserLevel: 0, seiPrice: 20 },
                { slot: 8, minUserLevel: 0, seiPrice: 50 },
                { slot: 9, minUserLevel: 0, seiPrice: 100 },
            ];
            await cfgLand.insertMany(cfgLands);
            logger.info('cfgLands seeded!');
        }

        if (config.seedCfgAchievements) {
            await cfgAchievement.deleteMany({});
            const cfgAchievements = [
                // HQ
                { name: 'Reach HQ Level 5', tasks: [{ type: 'level_hq', description: 'Achieve HQ level 5', conditionLevel: 5 }], reward: [{ type: 'seya', quantity: 50 }] },
                { name: 'Reach HQ Level 10', tasks: [{ type: 'level_hq', description: 'Achieve HQ level 10', conditionLevel: 10 }], reward: [{ type: 'seya', quantity: 100 }] },
                { name: 'Reach HQ Level 15', tasks: [{ type: 'level_hq', description: 'Achieve HQ level 15', conditionLevel: 15 }], reward: [{ type: 'seya', quantity: 150 }] },
                { name: 'Reach HQ Level 20', tasks: [{ type: 'level_hq', description: 'Achieve HQ level 20', conditionLevel: 20 }], reward: [{ type: 'seya', quantity: 200 }] },
                { name: 'Reach HQ Level 25', tasks: [{ type: 'level_hq', description: 'Achieve HQ level 25', conditionLevel: 25 }], reward: [{ type: 'seya', quantity: 250 }] },

                // Login
                { name: 'Daily Login Streak', tasks: [{ type: 'login', description: 'Login 1 day', conditionLevel: 1 }], reward: [{ type: 'gold', quantity: 5000 }] },
                { name: 'Daily Login Streak', tasks: [{ type: 'login', description: 'Login 2 day', conditionLevel: 2 }], reward: [{ type: 'gold', quantity: 15000 }] },
                { name: 'Daily Login Streak', tasks: [{ type: 'login', description: 'Login 3 day', conditionLevel: 3 }], reward: [{ type: 'gold', quantity: 50000 }] },
                { name: 'Daily Login Streak', tasks: [{ type: 'login', description: 'Login 5 day', conditionLevel: 5 }], reward: [{ type: 'gold', quantity: 100000 }] },
                { name: 'Daily Login Streak', tasks: [{ type: 'login', description: 'Login 7 day', conditionLevel: 7 }], reward: [{ type: 'gold', quantity: 150000 }] },
                { name: 'Daily Login Streak', tasks: [{ type: 'login', description: 'Login 10 day', conditionLevel: 10 }], reward: [{ type: 'gold', quantity: 250000 }] },
                { name: 'Daily Login Streak', tasks: [{ type: 'login', description: 'Login 15 day', conditionLevel: 15 }], reward: [{ type: 'gold', quantity: 375000 }] },
                { name: 'Daily Login Streak', tasks: [{ type: 'login', description: 'Login 20 day', conditionLevel: 20 }], reward: [{ type: 'gold', quantity: 500000 }] },
                { name: 'Daily Login Streak', tasks: [{ type: 'login', description: 'Login 25 day', conditionLevel: 25 }], reward: [{ type: 'gold', quantity: 625000 }] },
                { name: 'Daily Login Streak', tasks: [{ type: 'login', description: 'Login 30 day', conditionLevel: 30 }], reward: [{ type: 'gold', quantity: 750000 }] },

                // Checkin on chain
                {
                    name: 'On-chain Checkin Streak',
                    tasks: [{ type: 'checkin_onchain', description: 'On-chain check 1 day', conditionLevel: 1 }],
                    reward: [
                        { type: 'diamond', quantity: 100 },
                        { type: 'seya', quantity: 10 },
                    ],
                },
                {
                    name: 'On-chain Checkin Streak',
                    tasks: [{ type: 'checkin_onchain', description: 'On-chain check 2 day', conditionLevel: 2 }],
                    reward: [
                        { type: 'diamond', quantity: 250 },
                        { type: 'seya', quantity: 25 },
                    ],
                },
                {
                    name: 'On-chain Checkin Streak',
                    tasks: [{ type: 'checkin_onchain', description: 'On-chain check 3 day', conditionLevel: 3 }],
                    reward: [
                        { type: 'diamond', quantity: 350 },
                        { type: 'seya', quantity: 35 },
                    ],
                },
                {
                    name: 'On-chain Checkin Streak',
                    tasks: [{ type: 'checkin_onchain', description: 'On-chain check 5 day', conditionLevel: 5 }],
                    reward: [
                        { type: 'diamond', quantity: 550 },
                        { type: 'seya', quantity: 55 },
                    ],
                },
                {
                    name: 'On-chain Checkin Streak',
                    tasks: [{ type: 'checkin_onchain', description: 'On-chain check 7 day', conditionLevel: 7 }],
                    reward: [
                        { type: 'diamond', quantity: 800 },
                        { type: 'seya', quantity: 80 },
                    ],
                },
                {
                    name: 'On-chain Checkin Streak',
                    tasks: [{ type: 'checkin_onchain', description: 'On-chain check 10 day', conditionLevel: 10 }],
                    reward: [
                        { type: 'diamond', quantity: 1050 },
                        { type: 'seya', quantity: 105 },
                    ],
                },
                {
                    name: 'On-chain Checkin Streak',
                    tasks: [{ type: 'checkin_onchain', description: 'On-chain check 15 day', conditionLevel: 15 }],
                    reward: [
                        { type: 'diamond', quantity: 1600 },
                        { type: 'seya', quantity: 160 },
                    ],
                },
                {
                    name: 'On-chain Checkin Streak',
                    tasks: [{ type: 'checkin_onchain', description: 'On-chain check 20 day', conditionLevel: 20 }],
                    reward: [
                        { type: 'diamond', quantity: 2050 },
                        { type: 'seya', quantity: 205 },
                    ],
                },
                {
                    name: 'On-chain Checkin Streak',
                    tasks: [{ type: 'checkin_onchain', description: 'On-chain check 25 day', conditionLevel: 25 }],
                    reward: [
                        { type: 'diamond', quantity: 2550 },
                        { type: 'seya', quantity: 255 },
                    ],
                },
                {
                    name: 'On-chain Checkin Streak',
                    tasks: [{ type: 'checkin_onchain', description: 'On-chain check 30 day', conditionLevel: 30 }],
                    reward: [
                        { type: 'diamond', quantity: 3300 },
                        { type: 'seya', quantity: 330 },
                    ],
                },

                // Invite
                { name: 'Invite Friends', tasks: [{ type: 'invite', description: 'Invite 5 friends', conditionLevel: 5 }], reward: [{ type: 'seya', quantity: 10 }] },
                { name: 'Invite Friends', tasks: [{ type: 'invite', description: 'Invite 7 friends', conditionLevel: 7 }], reward: [{ type: 'seya', quantity: 14 }] },
                { name: 'Invite Friends', tasks: [{ type: 'invite', description: 'Invite 10 friends', conditionLevel: 10 }], reward: [{ type: 'seya', quantity: 20 }] },
                { name: 'Invite Friends', tasks: [{ type: 'invite', description: 'Invite 15 friends', conditionLevel: 15 }], reward: [{ type: 'seya', quantity: 30 }] },
                { name: 'Invite Friends', tasks: [{ type: 'invite', description: 'Invite 20 friends', conditionLevel: 20 }], reward: [{ type: 'seya', quantity: 40 }] },
                { name: 'Invite Friends', tasks: [{ type: 'invite', description: 'Invite 25 friends', conditionLevel: 25 }], reward: [{ type: 'seya', quantity: 50 }] },
                { name: 'Invite Friends', tasks: [{ type: 'invite', description: 'Invite 30 friends', conditionLevel: 30 }], reward: [{ type: 'seya', quantity: 60 }] },
                { name: 'Invite Friends', tasks: [{ type: 'invite', description: 'Invite 50 friends', conditionLevel: 50 }], reward: [{ type: 'seya', quantity: 100 }] },
                { name: 'Invite Friends', tasks: [{ type: 'invite', description: 'Invite 100 friends', conditionLevel: 100 }], reward: [{ type: 'seya', quantity: 200 }] },

                // Spend sei
                { name: 'Spend $SEI', tasks: [{ type: 'spend_sei', description: 'Spend 1 $SEI', conditionLevel: 1 }], reward: [{ type: 'seya', quantity: 100 }] },
                { name: 'Spend $SEI', tasks: [{ type: 'spend_sei', description: 'Spend 5 $SEI', conditionLevel: 5 }], reward: [{ type: 'seya', quantity: 500 }] },
                { name: 'Spend $SEI', tasks: [{ type: 'spend_sei', description: 'Spend 10 $SEI', conditionLevel: 10 }], reward: [{ type: 'seya', quantity: 1000 }] },
                { name: 'Spend $SEI', tasks: [{ type: 'spend_sei', description: 'Spend 20 $SEI', conditionLevel: 20 }], reward: [{ type: 'seya', quantity: 2000 }] },
                { name: 'Spend $SEI', tasks: [{ type: 'spend_sei', description: 'Spend 50 $SEI', conditionLevel: 50 }], reward: [{ type: 'seya', quantity: 5000 }] },
                { name: 'Spend $SEI', tasks: [{ type: 'spend_sei', description: 'Spend 70 $SEI', conditionLevel: 70 }], reward: [{ type: 'seya', quantity: 7000 }] },
                { name: 'Spend $SEI', tasks: [{ type: 'spend_sei', description: 'Spend 100 $SEI', conditionLevel: 100 }], reward: [{ type: 'seya', quantity: 10000 }] },
                { name: 'Spend $SEI', tasks: [{ type: 'spend_sei', description: 'Spend 200 $SEI', conditionLevel: 200 }], reward: [{ type: 'seya', quantity: 20000 }] },
                { name: 'Spend $SEI', tasks: [{ type: 'spend_sei', description: 'Spend 1000 $SEI', conditionLevel: 1000 }], reward: [{ type: 'seya', quantity: 100000 }] },

            ];
            await cfgAchievement.insertMany(cfgAchievements);
            logger.info('cfgAchievements seeded!');
        }

        if (config.seedCfgShopItems) {
            await cfgShopItem.deleteMany({});
            const cfgShopItems = [
                { type: 'diamond', description: '', seiPrice: 0.99, quantity: 100, promotionRate: 0, active: true },
                { type: 'diamond', description: '', seiPrice: 4.99, quantity: 500, promotionRate: 0, active: true },
                { type: 'diamond', description: '', seiPrice: 13.49, quantity: 1500, promotionRate: 0, active: true },
                { type: 'diamond', description: '', seiPrice: 26.99, quantity: 2700, promotionRate: 0, active: true },
                { type: 'diamond', description: '', seiPrice: 68.99, quantity: 6900, promotionRate: 0, active: true },
                { type: 'diamond', description: '', seiPrice: 129.99, quantity: 13000, promotionRate: 0, active: true },

                { type: 'dragon_chest', description: '', seiPrice: 4.99, quantity: 100, promotionRate: 0, active: true },
                { type: 'dragon_chest', description: '', seiPrice: 39.99, quantity: 500, promotionRate: 0, active: true },
            ];
            await cfgShopItem.insertMany(cfgShopItems);
            logger.info('cfgShopItems seeded!');
        }

        if (config.seedCfgSub) {
            await cfgSubscription.deleteMany({});
            const cfgSubscriptions = [
                {
                    type: 'basic_daily_reward',
                    name: 'Basic Subscription',
                    seiPrice: 9.99,
                    dailyReward: [
                        { type: 'gold', quantity: 100000 },
                        { type: 'diamond', quantity: 100 },
                        { type: 'lucky_chest', quantity: 50 },
                    ],
                    firstPurchaseReward: [{ type: 'diamond', quantity: 500 }],
                    subsTimeDay: 7,
                    active: true,
                },
                {
                    type: 'advanced_daily_reward',
                    name: 'Advanced Subscription',
                    seiPrice: 39.99,
                    dailyReward: [
                        { type: 'gold', quantity: 1000000 },
                        { type: 'diamond', quantity: 200 },
                        { type: 'lucky_chest', quantity: 300 },
                    ],
                    firstPurchaseReward: [{ type: 'diamond', quantity: 1350 }],
                    subsTimeDay: 30,
                    active: true,
                },
                {
                    type: 'no_ads',
                    name: 'No Ads',
                    seiPrice: 3.99,
                    dailyReward: [],
                    firstPurchaseReward: [{ type: 'diamond', quantity: 200 }],
                    subsTimeDay: 7,
                    active: true,
                },
                {
                    type: 'no_ads',
                    name: 'No Ads',
                    seiPrice: 9.99,
                    dailyReward: [],
                    firstPurchaseReward: [{ type: 'diamond', quantity: 500 }],
                    subsTimeDay: 30,
                    active: true,
                },
            ];
            await cfgSubscription.insertMany(cfgSubscriptions);
            logger.info('cfgSubscriptions seeded!');
        }

        logger.info('Database seeding completed!');
    } catch (err) {
        logger.error('Error seeding database:', err);
    } finally {
        mongoose.connection.close();
    }
};

await seedDB();
