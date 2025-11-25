import connectDB from "../io/db";
import User, { IUser } from "../models/user"
import logger from "../utils/logger";

const migrateSpinnedTicket = async () => {
    await connectDB('migrate spinned ticket count');
    
    const usersHaveRef: IUser[] = await User.find({ referralCount: {$gt: 0}}).exec();

    for (const user of usersHaveRef) {
        user.spinnedTicket = user.referralCount;
        await user.save();
        logger.info(`Save user ${user.telegramId} with spinnedTicket=${user.spinnedTicket}`);
    }
    logger.info('DONE');
}

await migrateSpinnedTicket();