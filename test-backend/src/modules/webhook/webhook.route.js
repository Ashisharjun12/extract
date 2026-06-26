import { Router } from 'express';
import { WebhookController } from './webhook.controller.js';

const router = Router();
const webhookController = new WebhookController();

router.post('/extraction-complete', webhookController.handleExtractionComplete);

export default router;
