import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { asyncRoute } from '../utils/response.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { requireCompany, requireCompanyRole, selectCompany } from '../middleware/company.js';
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
import * as companies from '../controllers/companies.controller.js';
import * as aiAgents from '../controllers/ai_agents.controller.js';
import * as conversations from '../controllers/conversations.controller.js';
import * as customReports from '../controllers/customReports.controller.js';
import * as analyst from '../controllers/analyst.controller.js';
import * as broadcasts from '../controllers/broadcasts.controller.js';
import * as segments from '../controllers/segments.controller.js';
import * as companyDirectory from '../controllers/companyDirectory.controller.js';
import * as thirdPartyApps from '../controllers/thirdPartyApps.controller.js';
import * as voice from '../controllers/twilioVoice.controller.js';

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
router.get('/dashboard/master', adminOnly, asyncRoute(dashboard.master));
router.get('/stats/daily', requireAuth, asyncRoute(dashboard.dailyStats));
router.get('/notifications', requireAuth, asyncRoute(notifications.index));
router.post('/notifications/read-all', requireAuth, asyncRoute(notifications.markAllRead));
router.post('/notifications/:id/read', requireAuth, asyncRoute(notifications.markRead));

// Company context and membership
router.get('/companies', requireAuth, asyncRoute(companies.index));
router.post('/companies', adminOnly, asyncRoute(companies.store));
router.post('/companies/select', requireAuth, selectCompany, asyncRoute(companies.select));
router.get('/companies/members', requireAuth, requireCompany, asyncRoute(companies.members));
router.post('/companies/members', adminOnly, requireCompany, asyncRoute(companies.saveMember));
router.delete('/companies/members/:userId', adminOnly, requireCompany, asyncRoute(companies.removeMember));

// Everything below is tenant-scoped. This keeps IDs from another company from
// being readable or writable merely by guessing them in the URL.
router.use(requireAuth, requireCompany);

// Leads
router.get('/leads', requireAuth, asyncRoute(leads.index));
router.post('/leads', requireAuth, requireCompanyRole('agent'), asyncRoute(leads.store));
router.get('/leads/export', requireAuth, asyncRoute(leads.exportCsv));
router.get('/leads/import/sample', requireAuth, asyncRoute(leads.sampleImport));
router.post('/leads/import', requireAuth, upload.single('csv'), asyncRoute(leads.importCsv));
router.get('/leads/check-duplicate', requireAuth, asyncRoute(leads.checkDuplicate));
router.get('/leads/:id', requireAuth, asyncRoute(leads.show));
router.patch('/leads/:id', requireAuth, requireCompanyRole('agent'), asyncRoute(leads.update));
router.delete('/leads/:id', adminOnly, asyncRoute(leads.destroy));
router.post('/leads/:id/enroll', requireAuth, requireCompanyRole('agent'), asyncRoute(leads.enroll));
router.post('/leads/bulk-enroll', requireAuth, requireCompanyRole('agent'), asyncRoute(leads.bulkEnroll));
router.post('/leads/:id/score', requireAuth, asyncRoute(leads.addScore));
router.get('/leads/:id/timeline', requireAuth, asyncRoute(leads.timeline));
router.post('/leads/:id/call', requireAuth, requireCompanyRole('agent'), asyncRoute(leads.call));
router.get('/voice/token', requireAuth, requireCompanyRole('agent'), asyncRoute(voice.voiceToken));
router.get('/leads/:id/enrollments/:eid', requireAuth, asyncRoute(leads.enrollmentDetail));

// Campaigns
router.get('/campaigns', requireAuth, asyncRoute(campaigns.index));
router.post('/campaigns', adminOnly, requireCompanyRole('manager'), asyncRoute(campaigns.store));
router.get('/campaigns/:id', requireAuth, asyncRoute(campaigns.show));
router.patch('/campaigns/:id', adminOnly, requireCompanyRole('manager'), asyncRoute(campaigns.update));
router.post('/campaigns/:id/activate', adminOnly, requireCompanyRole('manager'), asyncRoute(campaigns.activate));
router.post('/campaigns/:id/pause', adminOnly, requireCompanyRole('manager'), asyncRoute(campaigns.pause));
router.delete('/campaigns/:id', adminOnly, requireCompanyRole('manager'), asyncRoute(campaigns.destroy));

// Broadcasts
router.get('/broadcasts', requireAuth, asyncRoute(broadcasts.index));
router.get('/broadcasts/segments', requireAuth, asyncRoute(broadcasts.segmentsList));
router.get('/broadcasts/audience-preview', requireAuth, asyncRoute(broadcasts.audiencePreview));
router.post('/broadcasts', adminOnly, requireCompanyRole('manager'), asyncRoute(broadcasts.store));
router.post('/broadcasts/:id/send', adminOnly, requireCompanyRole('manager'), asyncRoute(broadcasts.send));
router.delete('/broadcasts/:id', adminOnly, requireCompanyRole('manager'), asyncRoute(broadcasts.destroy));

// Database: Companies directory + Lists (segments)
router.get('/company-directory', requireAuth, asyncRoute(companyDirectory.index));
router.get('/segments', requireAuth, asyncRoute(segments.index));
router.post('/segments', requireAuth, requireCompanyRole('agent'), asyncRoute(segments.store));
router.get('/segments/:id/members', requireAuth, asyncRoute(segments.members));
router.post('/segments/:id/members', requireAuth, requireCompanyRole('agent'), asyncRoute(segments.addMembers));
router.delete('/segments/:id/members/:leadId', requireAuth, requireCompanyRole('agent'), asyncRoute(segments.removeMember));
router.delete('/segments/:id', requireAuth, requireCompanyRole('agent'), asyncRoute(segments.destroy));
router.get('/campaigns/:id/builder', requireAuth, asyncRoute(campaigns.builder));
router.post('/campaigns/:id/steps', adminOnly, requireCompanyRole('manager'), asyncRoute(campaigns.saveSteps));

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

// Conversations
router.get('/conversations', requireAuth, asyncRoute(conversations.index));
router.post('/conversations', requireAuth, asyncRoute(conversations.store));
router.get('/conversations/:id/messages', requireAuth, asyncRoute(conversations.show));
router.post('/conversations/:id/messages', requireAuth, asyncRoute(conversations.reply));
router.post('/conversations/:id/read', requireAuth, asyncRoute(conversations.read));

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

// Custom Reports
router.get('/custom-reports', requireAuth, asyncRoute(customReports.index));
router.post('/custom-reports', requireAuth, asyncRoute(customReports.store));
router.get('/custom-reports/counts', requireAuth, asyncRoute(customReports.counts));
router.get('/custom-reports/export', requireAuth, asyncRoute(customReports.exportCsv));
router.get('/custom-reports/:id', requireAuth, asyncRoute(customReports.show));
router.get('/custom-reports/:id/data', requireAuth, asyncRoute(customReports.data));
router.patch('/custom-reports/:id', requireAuth, asyncRoute(customReports.update));
router.delete('/custom-reports/:id', requireAuth, asyncRoute(customReports.destroy));
router.post('/custom-reports/:id/schedules', requireAuth, asyncRoute(customReports.scheduleStore));
router.patch('/custom-reports/:id/schedules/:sid', requireAuth, asyncRoute(customReports.scheduleUpdate));
router.delete('/custom-reports/:id/schedules/:sid', requireAuth, asyncRoute(customReports.scheduleDestroy));

// My Analyst
router.get('/analyst/sessions', requireAuth, asyncRoute(analyst.listSessions));
router.post('/analyst/sessions', requireAuth, asyncRoute(analyst.createSession));
router.get('/analyst/sessions/:id/messages', requireAuth, asyncRoute(analyst.listMessages));
router.post('/analyst/sessions/:id/messages', requireAuth, asyncRoute(analyst.postMessage));
router.delete('/analyst/sessions/:id', requireAuth, asyncRoute(analyst.destroySession));

// Settings
router.get('/settings', adminOnly, asyncRoute(settings.getSettings));
router.post('/settings', adminOnly, asyncRoute(settings.saveSettings));
router.get('/settings/api-key', adminOnly, asyncRoute(settings.getApiKey));
router.post('/settings/api-key/regenerate', adminOnly, asyncRoute(settings.regenerateApiKey));
router.delete('/settings/api-key', adminOnly, asyncRoute(settings.deleteApiKey));
router.get('/settings/users', adminOnly, asyncRoute(settings.getUsers));
router.post('/settings/users', adminOnly, asyncRoute(settings.createUser));
router.post('/settings/users/invite', adminOnly, asyncRoute(settings.inviteUser));
router.patch('/settings/users/:id', adminOnly, asyncRoute(settings.updateUser));
router.get('/settings/integrations', adminOnly, asyncRoute(settings.getIntegrations));
router.post('/settings/integrations', adminOnly, asyncRoute(settings.saveIntegrations));
router.post('/settings/sources/:slug/sync', adminOnly, asyncRoute(settings.syncLeadSource));
router.get('/settings/channel-metrics', adminOnly, asyncRoute(settings.channelMetrics));
router.post('/settings/test-sms', adminOnly, asyncRoute(settings.testSms));
router.get('/settings/integration-accounts', adminOnly, asyncRoute(settings.integrationAccounts));
router.post('/settings/integration-accounts', adminOnly, asyncRoute(settings.saveIntegrationAccount));
router.delete('/settings/integration-accounts/:id', adminOnly, asyncRoute(settings.deleteIntegrationAccount));
router.get('/settings/ai-agents', adminOnly, asyncRoute(aiAgents.index));
router.post('/settings/ai-agents', adminOnly, asyncRoute(aiAgents.store));
router.patch('/settings/ai-agents/:id', adminOnly, asyncRoute(aiAgents.update));
router.get('/settings/ai-agents/:id/knowledge', adminOnly, asyncRoute(aiAgents.knowledge));
router.post('/settings/ai-agents/:id/knowledge', adminOnly, asyncRoute(aiAgents.saveKnowledge));
router.post('/settings/ai-agents/:id/preview', adminOnly, asyncRoute(aiAgents.preview));
router.get('/settings/sources', adminOnly, asyncRoute(settings.getSources));
router.post('/settings/sources/:id/config', adminOnly, asyncRoute(settings.saveSourceConfig));
router.post('/settings/sources/:id/test', adminOnly, asyncRoute(settings.testSourceConnection));
router.get('/settings/apps', adminOnly, asyncRoute(thirdPartyApps.index));
router.post('/settings/apps/:slug/connect', adminOnly, asyncRoute(thirdPartyApps.connect));
router.post('/settings/apps/:slug/disconnect', adminOnly, asyncRoute(thirdPartyApps.disconnect));
router.post('/settings/apps/:slug/sync', adminOnly, asyncRoute(thirdPartyApps.sync));
router.get('/settings/apps/google-sheets/connections', adminOnly, asyncRoute(thirdPartyApps.listGoogleSheets));
router.post('/settings/apps/google-sheets/connections', adminOnly, asyncRoute(thirdPartyApps.createGoogleSheet));
router.put('/settings/apps/google-sheets/connections/:id', adminOnly, asyncRoute(thirdPartyApps.updateGoogleSheet));
router.delete('/settings/apps/google-sheets/connections/:id', adminOnly, asyncRoute(thirdPartyApps.deleteGoogleSheet));
router.post('/settings/apps/google-sheets/connections/:id/sync', adminOnly, asyncRoute(thirdPartyApps.syncGoogleSheet));
router.get('/settings/pipeline', adminOnly, asyncRoute(settings.getPipelineStages));
router.post('/settings/pipeline', adminOnly, asyncRoute(settings.savePipelineStages));
router.delete('/settings/pipeline/:id', adminOnly, asyncRoute(settings.deletePipelineStage));

export default router;
