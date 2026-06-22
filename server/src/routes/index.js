import { Router } from 'express';
import authRoutes from './auth.routes.js';
import appRoutes from './app.routes.js';
import publicRoutes from './public.routes.js';

const router = Router();

router.use('/api/auth', authRoutes);
router.use('/api', appRoutes);
router.use('/', publicRoutes);

export default router;
