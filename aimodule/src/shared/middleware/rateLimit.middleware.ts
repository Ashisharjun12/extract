import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { RedisReply } from 'rate-limit-redis';
import { ApiError } from '../errors/apiError.js';
import DbFactory from '../database/db.factory.js';
import { Request } from 'express';

function keyGenerator(req: Request, res: any): string {
  const userId = (req as any).user?.id;
  if (userId) return `user:${userId}`;
  return req.ip ? req.ip.replace(/:\d+[^:]*$/, '') : 'unknown_ip';
}

// send command to redis for rate limiting
function sendCommand(...args: [string, ...string[]]): Promise<RedisReply> {
  return DbFactory.getRateLimitRedis().getClient().call(...args) as Promise<RedisReply>;
}

// rate limiter middleware for extraction
export const extractionRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 min window time
  max: 60, // 1 min max 60 requests
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  validate: false,
  store: new RedisStore({ sendCommand }),
  handler: (req, res, next) => {
    next(ApiError.tooManyRequests('Too many requests, please try again later.'));
  },
});