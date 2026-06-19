import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { asyncRoute } from '../utils/response.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { config } from '../config/index.js';
import * as leads from '../controllers/leads.controller.js';
import * as campaigns from '../controllers/campaigns.controller.js';
import * as pipeline from '../controllers/pipeline.controller.js';
import * as tasks from '../controllers/tasks.controller.js';
import * as templates from '../controllers/templates.controller.js';
import * as reports from '../controllers/reports.controller.js';
import * as settings from '../controllers/settings.controller.js';
import * as dashboard from '../controllers/dashboard.controller.js';
import * as notifications from '../controllers/notifications.controller.js';

const router = Router();
const upload = multer({
  dest: path.join(config.uploadPath, 'tmp'),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const adminOnly = requireRoles('admin', 'superadmin');
const managerUp = requireRoles('admin', 'superadmin', 'manager');

// Meta & Dashboard
router.get('/meta', requireAuth, asyncRoute(leads.meta));
router.get('/dashboard', requireAuth, asyncRoute(dashboard.index));
router.get('/stats/daily', requireAuth, asyncRoute(dashboard.dailyStats));
router.get('/notifications', requireAuth, asyncRoute(notifications.index));

// Leads
router.get('/leads', requireAuth, asyncRoute(leads.index));
router.post('/leads', requireAuth, asyncRoute(leads.store));
router.get('/leads/export', requireAuth, asyncRoute(leads.exportCsv));
router.post('/leads/import', requireAuth, upload.single('csv'), asyncRoute(leads.importCsv));
router.get('/leads/:id', requireAuth, asyncRoute(leads.show));
router.patch('/leads/:id', requireAuth, asyncRoute(leads.update));
router.delete('/leads/:id', adminOnly, asyncRoute(leads.destroy));
router.post('/leads/:id/enroll', requireAuth, asyncRoute(leads.enroll));
router.post('/leads/:id/score', requireAuth, asyncRoute(leads.addScore));
router.get('/leads/:id/timeline', requireAuth, asyncRoute(leads.timeline));

// Campaigns
router.get('/campaigns', requireAuth, asyncRoute(campaigns.index));
router.post('/campaigns', adminOnly, asyncRoute(campaigns.store));
router.get('/campaigns/:id', requireAuth, asyncRoute(campaigns.show));
router.patch('/campaigns/:id', adminOnly, asyncRoute(campaigns.update));
router.post('/campaigns/:id/activate', adminOnly, asyncRoute(campaigns.activate));
router.post('/campaigns/:id/pause', adminOnly, asyncRoute(campaigns.pause));
router.get('/campaigns/:id/builder', adminOnly, asyncRoute(campaigns.builder));
router.post('/campaigns/:id/steps', adminOnly, asyncRoute(campaigns.saveSteps));

// Pipeline
router.get('/pipeline', requireAuth, asyncRoute(pipeline.pipelineBoard));
router.get('/deals', requireAuth, asyncRoute(pipeline.dealsIndex));
router.post('/deals', requireAuth, asyncRoute(pipeline.dealsStore));
router.get('/deals/:id', requireAuth, asyncRoute(pipeline.dealsShow));
router.patch('/deals/:id', requireAuth, asyncRoute(pipeline.dealsUpdate));
router.post('/deals/:id/stage', requireAuth, asyncRoute(pipeline.moveStage));
router.post('/deals/:id/note', requireAuth, asyncRoute(pipeline.addNote));
router.post('/deals/:id/task', requireAuth, asyncRoute(pipeline.addTask));
router.post('/deals/:id/meeting', requireAuth, asyncRoute(pipeline.addMeeting));
router.post('/deals/:id/file', requireAuth, upload.single('file'), asyncRoute(pipeline.uploadFile));
router.post('/deals/:id/won', requireAuth, asyncRoute(pipeline.markWon));
router.post('/deals/:id/lost', requireAuth, asyncRoute(pipeline.markLost));

// Tasks
router.get('/tasks', requireAuth, asyncRoute(tasks.index));
router.post('/tasks', requireAuth, asyncRoute(tasks.store));
router.post('/tasks/:id/done', requireAuth, asyncRoute(tasks.markDone));
router.delete('/tasks/:id', requireAuth, asyncRoute(tasks.destroy));

// Templates
router.get('/templates', requireAuth, asyncRoute(templates.index));
router.post('/templates', managerUp, asyncRoute(templates.store));
router.get('/templates/wa-sync', requireAuth, asyncRoute(templates.syncWhatsApp));
router.get('/templates/:id', requireAuth, asyncRoute(templates.show));
router.patch('/templates/:id', managerUp, asyncRoute(templates.update));
router.delete('/templates/:id', adminOnly, asyncRoute(templates.destroy));

// Reports
router.get('/reports/:type?', requireAuth, asyncRoute(reports.report));

// Settings
router.get('/settings', adminOnly, asyncRoute(settings.getSettings));
router.post('/settings', adminOnly, asyncRoute(settings.saveSettings));
router.get('/settings/users', adminOnly, asyncRoute(settings.getUsers));
router.post('/settings/users', adminOnly, asyncRoute(settings.createUser));
router.patch('/settings/users/:id', adminOnly, asyncRoute(settings.updateUser));
router.get('/settings/integrations', adminOnly, asyncRoute(settings.getIntegrations));
router.post('/settings/integrations', adminOnly, asyncRoute(settings.saveIntegrations));
router.get('/settings/sources', adminOnly, asyncRoute(settings.getSources));
router.get('/settings/pipeline', adminOnly, asyncRoute(settings.getPipelineStages));
router.post('/settings/pipeline', adminOnly, asyncRoute(settings.savePipelineStages));

export default router;
