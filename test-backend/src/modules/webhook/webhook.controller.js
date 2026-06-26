import { asyncHandler } from '../../shared/asyncHandler.js';
import { ApiError } from '../../shared/apiError.js';
import { WebhookService } from './webhook.service.js';

const webhookService = new WebhookService();

export class WebhookController {
  handleExtractionComplete = asyncHandler(async (req, res) => {
    const receivedSig = req.headers['x-webhook-signature'] ?? '';
    const correlationId = req.headers['x-correlation-id'] ?? '';

    if (!webhookService.verifySignature(req.rawBody, receivedSig)) {
      throw ApiError.unauthorized('Invalid webhook signature');
    }

    const payload = req.body;
    await webhookService.handleExtractionComplete(payload);

    res.status(200).json({ ok: true, received: payload.correlationId ?? correlationId });
  });
}
