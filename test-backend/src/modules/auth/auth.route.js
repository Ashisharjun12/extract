import { Router } from 'express';
import { AuthController } from './auth.controller.js';
import { portalAuth } from '../../shared/portal-auth.middleware.js';

const router = Router();
const authController = new AuthController();

router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/me', portalAuth, authController.me);

export default router;
