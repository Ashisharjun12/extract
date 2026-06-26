import { Router, Request, Response, NextFunction } from 'express';
import { AdminController } from './admin.controller.js';
import { _config } from '../../config/config.js';

const router = Router();
const adminController = new AdminController();

/**
 * Simple API key guard for admin endpoints.
 * Set ADMIN_API_KEY in .env — keep it out of Git (use secrets manager in prod).
 */
function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const provided = req.headers['x-admin-api-key'];
  const expected = _config.ADMIN_API_KEY;

  if (!expected) {
    res.status(503).json({ success: false, message: 'Admin API is disabled — ADMIN_API_KEY is not configured.' });
    return;
  }

  if (!provided || provided !== expected) {
    res.status(401).json({ success: false, message: 'Unauthorized. Invalid or missing x-admin-api-key header.' });
    return;
  }

  next();
}

// All admin routes are protected by the API key guard
router.use(adminAuth);

// DLQ Management
router.get('/dlq/jobs',              adminController.listDLQJobs);
router.post('/dlq/jobs/:id/replay',  adminController.replayDLQJob);
router.delete('/dlq/jobs/:id',       adminController.discardDLQJob);
router.get('/queues/health',         adminController.getQueueHealth);

export default router;
