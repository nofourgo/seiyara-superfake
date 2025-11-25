import mongoose from 'mongoose';
import logger from '../utils/logger';

const connectDB = async (source: string) => {
    try {
        await mongoose.connect(process.env.MONGO_URI as string);
        logger.info(`${source} - MongoDB connected`);  
    } catch (error) {
        logger.error(error);
        process.exit(1);
    }
};

export default connectDB;
