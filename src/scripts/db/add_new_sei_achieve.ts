import mongoose from 'mongoose';
import logger from '../../utils/logger';
import cfgAchievement from '../../models/cfgAchievement';

await mongoose.connect(process.env.MONGO_URI!);

const seedDB = async () => {
    try {
        const cfgAchievements = [
            // HQ
            {
                name: 'Login 10 days to get 0.01 $SEI',
                tasks: [{ type: 'login_10d', description: 'Login 10 days to get 0.01 $SEI', conditionLevel: 10 }],
                reward: [{ type: 'onchain_sei', quantity: 0.01 }],
            },
            {
                name: 'Checkin onchain 10 days to get 0.01 $SEI',
                tasks: [{ type: 'checkin_onchain_10d', description: 'Checkin on chain 10 days to get 0.01 $SEI', conditionLevel: 10 }],
                reward: [{ type: 'onchain_sei', quantity: 0.01 }],
            },
        ];
        await cfgAchievement.insertMany(cfgAchievements);
        logger.info('cfgAchievement seeded!');
    } catch (err) {
        logger.error('Error seeding database:', err);
    } finally {
        mongoose.connection.close();
    }
};

await seedDB();
