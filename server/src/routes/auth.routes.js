import { Router } from 'express';
import { asyncRoute } from '../utils/response.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import * as auth from '../controllers/auth.controller.js';

const router = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, keyFn: (req) => `${req.ip}:${String(req.body?.email || '').toLowerCase()}` });
const forgotLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5 });
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });

router.get('/me', asyncRoute(auth.me));
router.post('/login', loginLimiter, asyncRoute(auth.login));
router.post('/register', registerLimiter, asyncRoute(auth.register));
router.post('/logout', requireAuth, asyncRoute(auth.logout));
router.post('/forgot', forgotLimiter, asyncRoute(auth.forgotPassword));
router.get('/reset/:token', asyncRoute(auth.validateResetToken));
router.post('/reset/:token', asyncRoute(auth.resetPassword));
router.patch('/profile', requireAuth, asyncRoute(auth.updateProfile));
router.post('/change-password', requireAuth, asyncRoute(auth.changePassword));

export default router;
