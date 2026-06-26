import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { runWithCorrelationId } from '../context/correlation.context.js';

/**
 * Correlation ID middleware — must be registered FIRST in app.ts.
 *
 * Reads `x-correlation-id` from inbound request headers.
 * If absent, generates a fresh UUID v4.
 * Wraps the entire downstream middleware + handler chain inside the
 * AsyncLocalStorage store so getCorrelationId() works everywhere.
 *
 * Also reflects the correlationId back in the response header so
 * upstream API gateways/callers can correlate request logs.
 */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId = (req.headers['x-correlation-id'] as string) || uuidv4();

  // Echo it back so callers can trace the request end-to-end
  res.setHeader('x-correlation-id', correlationId);

  // Run the rest of the chain inside the AsyncLocalStorage context
  runWithCorrelationId(correlationId, () => next());
}
