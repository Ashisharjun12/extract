import { Request, Response, NextFunction } from 'express';
import { asyncHandler } from '../../shared/middleware/asyncHandler.middleware.js';
import { AdminService } from './admin.service.js';

const adminService = new AdminService();

function handleServiceError(err: unknown, res: Response): boolean {
  const statusCode = (err as { statusCode?: number }).statusCode;
  if (statusCode) {
    res.status(statusCode).json({ success: false, message: (err as Error).message });
    return true;
  }
  return false;
}

export class AdminController {
  public listDLQJobs = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20));
    const result = await adminService.listDLQJobs(page, limit);
    res.status(200).json({ success: true, ...result });
  });

  public replayDLQJob = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const id = req.params.id as string;
    try {
      const { replayedJobId, targetQueue } = await adminService.replayDLQJob(id);
      res.status(200).json({
        success: true,
        message: `Job ${id} replayed to queue ${targetQueue}.`,
        replayedJobId,
      });
    } catch (err) {
      if (handleServiceError(err, res)) return;
      throw err;
    }
  });

  public discardDLQJob = asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    const id = req.params.id as string;
    try {
      await adminService.discardDLQJob(id);
      res.status(200).json({
        success: true,
        message: `DLQ job ${id} has been permanently discarded.`,
      });
    } catch (err) {
      if (handleServiceError(err, res)) return;
      throw err;
    }
  });

  public getQueueHealth = asyncHandler(async (_req: Request, res: Response, _next: NextFunction) => {
    const health = await adminService.getQueueHealth();
    res.status(200).json({ success: true, ...health });
  });
}
