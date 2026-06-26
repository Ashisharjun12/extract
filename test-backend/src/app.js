import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import uploadRouter from './modules/upload/upload.route.js';
import extractionRouter from './modules/extraction/extraction.route.js';
import webhookRouter from './modules/webhook/webhook.route.js';
import authRouter from './modules/auth/auth.route.js';
import adminRouter from './modules/admin/admin.route.js';
import { portalAuth } from './shared/portal-auth.middleware.js';
import { AdminService } from './modules/admin/admin.service.js';
import { errorMiddleware, notFoundMiddleware } from './shared/error.middleware.js';
import { _config } from './config/config.js';
import { getPortalInfo } from './config/version.js';

const app = express();
const adminService = new AdminService();

const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

app.use(
  cors({
    origin: _config.isProduction
      ? (process.env.CORS_ORIGIN?.split(',') ?? false)
      : (origin, cb) => cb(null, !origin || localhostPattern.test(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-api-key'],
    exposedHeaders: ['Set-Cookie'],
  }),
);

app.use(cookieParser());
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.get('/version', (_req, res) => {
  res.json({ ok: true, ...getPortalInfo() });
});

app.get('/health', async (_req, res) => {
  const aimodule = await adminService.checkAimoduleHealth();
  res.json({
    status: 200,
    msg: 'test-backend is running healthy.',
    ok: true,
    ...getPortalInfo(),
    aimodule,
  });
});

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/upload', portalAuth, uploadRouter);
app.use('/api/v1/extractions', portalAuth, extractionRouter);
app.use('/api/webhook', webhookRouter);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
