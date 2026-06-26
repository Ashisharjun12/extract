import DbFactory from "../../shared/database/db.factory";

// bullmq connection using the Singleton Pattern
export const bullmqConnection = DbFactory.getQueueRedis().getClient();
