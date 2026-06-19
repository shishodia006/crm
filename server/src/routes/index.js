import { Router } from 'express';
import authRoutes from './auth.routes.js';
import appRoutes from './app.routes.js';
import publicRoutes from './public.routes.js';

const router = Router();

// Root redirect to frontend
router.get('/', (_req, res) => res.redirect('http://localhost:5173'));

router.use('/api/auth', authRoutes);
router.use('/api', appRoutes);
router.use('/', publicRoutes);

export default router;
