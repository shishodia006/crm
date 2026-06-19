import { Router } from 'express';
import { asyncRoute } from '../utils/response.js';
import { requireAuth } from '../middleware/auth.js';
import * as auth from '../controllers/auth.controller.js';

const router = Router();

router.get('/me', asyncRoute(auth.me));
router.post('/login', asyncRoute(auth.login));
router.post('/register', asyncRoute(auth.register));
router.post('/logout', requireAuth, asyncRoute(auth.logout));
router.post('/forgot', asyncRoute(auth.forgotPassword));
router.get('/reset/:token', asyncRoute(auth.validateResetToken));
router.post('/reset/:token', asyncRoute(auth.resetPassword));

export default router;
