import { IDragonBall, IDragonChest, ILuckyChest } from '../models/cfgItem';
import { IHeadQuarterConfig } from '../models/user';
import logger from '../utils/logger';

// constants
export const MAX_LUCKY_CHEST_LEVEL = 100;
export const MAX_HEAD_QUARTER_LEVEL = 100;
export const MAX_DRAGON_BALL_LEVEL = 7;

// constants map
export const LUCKY_CHEST_PROPERTIES: { [level: number]: ILuckyChest } = {};
export const HQ_DRAGON_CHEST_PROPERTIES: { [level: number]: IDragonChest } = {};
export const DRAGON_BALL_PROPERTIES: { [level: number]: IDragonBall } = {};
export const HQ_LEVEL_CONFIGS: { [level: number]: IHeadQuarterConfig } = {};

// util functions
export const getLuckyChestProp = (level: number): ILuckyChest => {
    if (level <= 0 || level > MAX_LUCKY_CHEST_LEVEL) {
        throw new Error(`Invalid lucky_chest level: ${level}`);
    }
    return LUCKY_CHEST_PROPERTIES[level];
};
export const getDragonChestProp = (level: number): IDragonChest => {
    if (level <= 0 || level > MAX_HEAD_QUARTER_LEVEL) {
        throw new Error(`Invalid dragon_chest HQ level: ${level}`);
    }
    return HQ_DRAGON_CHEST_PROPERTIES[level];
};
export const getDragonBallProp = (level: number): IDragonBall => {
    if (level < 1 || level > MAX_DRAGON_BALL_LEVEL) {
        throw new Error(`Invalid dragon_ball level: ${level}`);
    }
    return DRAGON_BALL_PROPERTIES[level];
};
export const getHeadQuarterConfig = (level: number): IHeadQuarterConfig => {
    if (level < 1 || level > MAX_HEAD_QUARTER_LEVEL) {
        throw new Error(`Invalid headquarter level: ${level}`);
    }
    if (level == MAX_HEAD_QUARTER_LEVEL) {
        return {
            nextUpgradeFeeDiamond: 999999999999999,
            nextUpgradeTimeSecond: 999999999999999,
        };
    }
    return HQ_LEVEL_CONFIGS[level];
};

// Initialize data, only call once
export const initGameConstants = () => {
    initLuckyChestProperties();

    initDragonChestProperties();

    initDragonBallProperties();

    initHeadQuarterConfigs();
};

const initLuckyChestProperties = () => {
    let minGold = 5000;
    let maxGold = 8000;
    let changeDragon = 1;
    let idleMaxTime = 120;
    let idleMinGold = 30000;
    let idleMaxGold = 50000;
    let idleMinChest = 15;
    let idleMaxChest = 25;
    let costUpgradeGold = 0;

    let previousMinGold = minGold;
    let previousMaxGold = maxGold;
    let previousIdleMaxTime = idleMaxTime;

    LUCKY_CHEST_PROPERTIES[1] = {
        upgradeFeeGold: costUpgradeGold,
        nextUpgradeFeeGold: 0,

        minGold: minGold,
        maxGold: maxGold,
        dragonChestChance: changeDragon,

        idleMaxTimeMinute: idleMaxTime,
        idleMinGold: idleMinGold,
        idleMaxGold: idleMaxGold,
        idleMinChest: idleMinChest,
        idleMaxChest: idleMaxChest,
    };

    for (let i = 2; i <= MAX_LUCKY_CHEST_LEVEL; i++) {
        minGold = minGold * 1.01;
        maxGold = (maxGold / previousMinGold) * minGold;

        if (i <= 10) {
            changeDragon += 1;
        } else {
            changeDragon += 0.1;
        }

        if (i <= 30) {
            idleMaxTime += 10;
        } else {
            idleMaxTime += 5;
        }

        idleMinGold = (idleMinGold / previousMinGold) * minGold;
        idleMaxGold = (idleMaxGold / previousMaxGold) * maxGold;

        idleMinChest = (idleMinChest / previousIdleMaxTime) * idleMaxTime;
        idleMaxChest = (idleMaxChest / previousIdleMaxTime) * idleMaxTime;

        if (i === 2) {
            costUpgradeGold = 10000;
        } else if (i > 2 && i <= 30) {
            costUpgradeGold = costUpgradeGold * 1.1;
        } else if (i > 30 && i <= 50) {
            costUpgradeGold = costUpgradeGold * 1.2;
        } else if (i > 50 && i <= 70) {
            costUpgradeGold = costUpgradeGold * 1.3;
        } else if (i > 70) {
            costUpgradeGold = costUpgradeGold * 1.1;
        }

        previousMinGold = minGold;
        previousMaxGold = maxGold;
        previousIdleMaxTime = idleMaxTime;

        LUCKY_CHEST_PROPERTIES[i] = {
            upgradeFeeGold: Math.round(costUpgradeGold),
            nextUpgradeFeeGold: 0,

            minGold: Math.round(minGold),
            maxGold: Math.round(maxGold),
            dragonChestChance: parseFloat(changeDragon.toFixed(2)),

            idleMaxTimeMinute: idleMaxTime,
            idleMinGold: Math.round(idleMinGold),
            idleMaxGold: Math.round(idleMaxGold),
            idleMinChest: Math.round(idleMinChest),
            idleMaxChest: Math.round(idleMaxChest),
        };

        LUCKY_CHEST_PROPERTIES[i - 1].nextUpgradeFeeGold = LUCKY_CHEST_PROPERTIES[i].upgradeFeeGold;
    }

    logger.info('LUCKY_CHEST_PROPERTIES initialized!');
};

const initDragonChestProperties = () => {
    let dragonBall1 = 100;
    let dragonBall2 = 0;
    let dragonBall3 = 0;
    let dragonBall4 = 0;
    let dragonBall5 = 0;
    let dragonBall6 = 0;
    let dragonBall7 = 0;

    HQ_DRAGON_CHEST_PROPERTIES[1] = {
        dragonBallChances: [dragonBall1, dragonBall2, dragonBall3, dragonBall4, dragonBall5, dragonBall6, dragonBall7],
    };

    for (let i = 2; i <= MAX_HEAD_QUARTER_LEVEL; i++) {
        if (i <= 9) {
            dragonBall1 -= 1;
            dragonBall2 += 1;
        } else if (i === 10) {
            dragonBall2 += 1;
            dragonBall3 = 0.1;
            dragonBall4 = 0.1;
            dragonBall5 = 0.1;
            dragonBall6 = 0.1;
            dragonBall7 = 0.1;
            dragonBall1 = 100 - (dragonBall2 + dragonBall3 + dragonBall4 + dragonBall5 + dragonBall6 + dragonBall7);
        } else if (i > 10 && i <= 60) {
            dragonBall2 += 1;
            dragonBall3 += 0.4;
            dragonBall4 += 0.2;
            dragonBall5 += 0.1;
            dragonBall6 += 0.05;
            dragonBall7 += 0.05;
            dragonBall1 = 100 - (dragonBall2 + dragonBall3 + dragonBall4 + dragonBall5 + dragonBall6 + dragonBall7);
        } else if (i > 60) {
            dragonBall1 = 0.5;
            dragonBall3 += 0.4;
            dragonBall4 += 0.2;
            dragonBall5 += 0.1;
            dragonBall6 += 0.05;
            dragonBall7 += 0.05;
            dragonBall2 = 100 - (dragonBall1 + dragonBall3 + dragonBall4 + dragonBall5 + dragonBall6 + dragonBall7);
        }

        HQ_DRAGON_CHEST_PROPERTIES[i] = {
            dragonBallChances: [
                parseFloat(dragonBall1.toFixed(2)),
                parseFloat(dragonBall2.toFixed(2)),
                parseFloat(dragonBall3.toFixed(2)),
                parseFloat(dragonBall4.toFixed(2)),
                parseFloat(dragonBall5.toFixed(2)),
                parseFloat(dragonBall6.toFixed(2)),
                parseFloat(dragonBall7.toFixed(2)),
            ],
        };
    }

    logger.info('HQ_DRAGON_CHEST_PROPERTIES initialized!');
};

const initDragonBallProperties = () => {
    DRAGON_BALL_PROPERTIES[1] = { diamondReward: 10 };
    DRAGON_BALL_PROPERTIES[2] = { diamondReward: 100 };
    DRAGON_BALL_PROPERTIES[3] = { diamondReward: 200 };
    DRAGON_BALL_PROPERTIES[4] = { diamondReward: 400 };
    DRAGON_BALL_PROPERTIES[5] = { diamondReward: 600 };
    DRAGON_BALL_PROPERTIES[6] = { diamondReward: 1000 };
    DRAGON_BALL_PROPERTIES[7] = { diamondReward: 0 };

    logger.info('DRAGON_BALL_PROPERTIES initialized!');
};

const initHeadQuarterConfigs = () => {
    // NOTE: assign next level config to the current config
    let diamondsRequired = 100;
    let timeRequiredSeconds = 10;

    HQ_LEVEL_CONFIGS[1] = {
        nextUpgradeTimeSecond: timeRequiredSeconds,
        nextUpgradeFeeDiamond: diamondsRequired,
    };

    for (let level = 2; level <= MAX_HEAD_QUARTER_LEVEL - 1; level++) {
        if (level < 20) {
            diamondsRequired = diamondsRequired * 1.3;
        } else if (level < 30) {
            diamondsRequired = diamondsRequired * 1.2;
        } else if (level < 40) {
            diamondsRequired = diamondsRequired * 1.1;
        } else if (level < 50) {
            diamondsRequired = diamondsRequired * 1.05;
        } else {
            diamondsRequired = diamondsRequired * 1.03;
        }

        if (level < 10) {
            timeRequiredSeconds = timeRequiredSeconds * 2;
        } else if (level < 40) {
            timeRequiredSeconds = timeRequiredSeconds * 1.1;
        } else if (level < 50) {
            timeRequiredSeconds = timeRequiredSeconds * 1.05;
        } else {
            timeRequiredSeconds = timeRequiredSeconds * 1.03;
        }

        HQ_LEVEL_CONFIGS[level] = {
            nextUpgradeTimeSecond: Math.round(timeRequiredSeconds),
            nextUpgradeFeeDiamond: Math.round(diamondsRequired),
        };
    }

    logger.info('HQ_LEVEL_CONFIGS initialized!');
};
