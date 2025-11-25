import CfgShopItem, { ICfgShopItem } from '../../models/cfgShopItem';
import logger from '../../utils/logger';
import connectDB from '../../io/db';

const seedDB = async () => {
    try {
        await connectDB('Add ticket item');

        const cfgShopItems: ICfgShopItem[] = [
            new CfgShopItem({
                type: 'spin_ticket',
                seiPrice: 0.99,
                quantity: 10,
                firstPurchaseReward: [{ type: 'diamond', quantity: 100 }],
                active: false,
            }),
            new CfgShopItem({
                type: 'spin_ticket',
                seiPrice: 2.69,
                quantity: 30,
                firstPurchaseReward: [{ type: 'diamond', quantity: 300 }],
                active: false,
            }),
            new CfgShopItem({
                type: 'spin_ticket',
                seiPrice: 4.69,
                quantity: 50,
                firstPurchaseReward: [{ type: 'diamond', quantity: 500 }],
                active: false,
            }),
            new CfgShopItem({
                type: 'spin_ticket',
                seiPrice: 9.69,
                quantity: 100,
                firstPurchaseReward: [{ type: 'diamond', quantity: 1000 }],
                active: false,
            }),
        ];

        await CfgShopItem.insertMany(cfgShopItems);
        logger.info('DONE!');
    } catch (err) {
        logger.error('Error:', err);
    }
};

await seedDB();
