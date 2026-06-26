import { Router } from 'express';
import { ExtractionController } from './extraction.controller.js';

const router = Router();
const extractionController = new ExtractionController();

router.post('/', extractionController.createExtraction);
router.get('/', extractionController.listExtractions);
router
  .route('/:id')
  .get(extractionController.getExtraction)
  .delete(extractionController.deleteExtraction);

export default router;
