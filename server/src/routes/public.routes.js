import { Router } from 'express';
import { asyncRoute } from '../utils/response.js';
import { requireRoles } from '../middleware/auth.js';
import * as pub from '../controllers/public.controller.js';
import * as customReports from '../controllers/customReports.controller.js';

const router = Router();
const adminOnly = requireRoles('admin', 'superadmin');

// Lead ingest & webhooks (no auth)
router.post('/ingest/:source', asyncRoute(pub.ingest));
router.all('/webhook/:source', asyncRoute(pub.webhook));
router.all('/webhook/:source/:webhookKey', asyncRoute(pub.webhook));

// Email tracking pixels (no auth)
router.get('/track/open/:uid', asyncRoute(pub.trackOpen));
router.get('/track/click/:uid', asyncRoute(pub.trackClick));

// QR lead capture page (no auth)
router.all('/qr/:source', asyncRoute(pub.qrCapture));

// Custom report share links (no auth)
router.get('/public/reports/:token', asyncRoute(customReports.publicShow));

// OAuth flows (admin only)
router.get('/oauth/:provider', adminOnly, asyncRoute(pub.oauthStart));
router.get('/oauth/:provider/callback', adminOnly, asyncRoute(pub.oauthCallback));
router.post('/oauth/:provider/revoke', adminOnly, asyncRoute(pub.oauthRevoke));

// Cron trigger endpoint
router.post('/cron/run', asyncRoute(pub.runCron));

export default router;
