import { pinoHttp } from 'pino-http';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';


export const httpLogger = pinoHttp({
  logger,
  genReqId: () => uuidv4(),
  customLogLevel: (_req, res) => {
    if (res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  redact: ['req.headers.authorization', 'req.body.password'],
});