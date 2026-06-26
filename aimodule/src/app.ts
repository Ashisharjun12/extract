import express, { Application } from 'express';
import { errorHandler } from './shared/errors/errorHandler.js';
import cors from 'cors';import helmet from 'helmet';
import { correlationMiddleware } from './shared/middleware/correlation.middleware.js';
import { httpLogger } from './shared/middleware/logger.middleware.js';
import { extractionRateLimiter } from './shared/middleware/rateLimit.middleware.js';
import documentRoutes from './modules/document/document.route.js';
import adminRoutes from './modules/admin/admin.route.js';

export class App {
  private app: Application;

  constructor() {
    this.app = express();
    this.app.set('trust proxy', 1);
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private setupMiddleware() {
    const corsOption = {
      origin: ['http://localhost:5173'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      credentials: true,
    };


    this.app.use(correlationMiddleware);
    this.app.use(helmet());
    this.app.use(cors(corsOption));
    this.app.use(httpLogger);
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));  }

  private setupRoutes() {
    this.app.get('/health', (_req, res) => {
      res.status(200).json({ message: 'AI Module is Live' });
    });

    const prefix = '/api/v1';

    this.app.use(`${prefix}/documents`, extractionRateLimiter, documentRoutes);
    this.app.use(`${prefix}/admin`, adminRoutes);
  }

  private setupErrorHandling() {
    this.app.use(errorHandler);
  }

  public getApp() {
    return this.app;
  }
}

export default App;
