import { Router } from 'express';
import { UploadController } from './upload.controller.js';

const router = Router();
const uploadController = new UploadController();

router.post('/request-url', uploadController.requestUploadUrl);
router.post('/', uploadController.saveFileRecord);
router.get('/', uploadController.listFiles);
router.delete('/:id', uploadController.deleteFile);

export default router;
