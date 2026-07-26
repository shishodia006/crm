import { one, q, run, scalar } from '../db/pool.js';
import { ok, fail } from '../utils/response.js';
import { AUDIENCE_TYPES, resolveAudience, sendBroadcastNow } from '../services/broadcast.service.js';

export async function index(req, res) {
  const broadcasts = await q(
    `SELECT c.*, t.name AS template_name, t.channel AS template_channel
     FROM campaigns c LEFT JOIN templates t ON t.id=c.template_id
     WHERE c.company_id=? AND c.type='broadcast' ORDER BY c.created_at DESC`,
    [req.companyId]
  );

  for (const b of broadcasts) {
    let filter = {};
    try { filter = typeof b.audience_filter === 'string' ? JSON.parse(b.audience_filter) : (b.audience_filter || {}); } catch { filter = {}; }
    const { leads, label } = await resolveAudience(req.companyId, filter);
    b.audience_label = label;
    b.audience_count = leads.length;

    if (Number(b.sent_count) > 0) {
      const [totalSent, totalOpened] = await Promise.all([
        scalar('SELECT COUNT(*) FROM communications cm JOIN lead_enrollments le ON le.id=cm.enrollment_id WHERE le.campaign_id=?', [b.id]),
        scalar("SELECT COUNT(*) FROM communications cm JOIN lead_enrollments le ON le.id=cm.enrollment_id WHERE le.campaign_id=? AND cm.status IN ('opened','clicked','replied')", [b.id])
      ]);
      b.open_rate = Number(totalSent) > 0 ? Math.round((Number(totalOpened) / Number(totalSent)) * 100) : null;
    } else {
      b.open_rate = null;
    }
  }

  ok(res, { broadcasts, audienceTypes: AUDIENCE_TYPES });
}

export async function segmentsList(_req, res) {
  const segments = await q('SELECT id, name, type, count FROM segments ORDER BY name');
  ok(res, { segments });
}

export async function audiencePreview(req, res) {
  const filter = { type: req.query.type, value: req.query.value };
  const { leads, label } = await resolveAudience(req.companyId, filter);
  ok(res, { count: leads.length, label });
}

export async function store(req, res) {
  const name = String(req.body.name || '').trim();
  const templateId = Number(req.body.template_id);
  if (!name) return fail(res, 'Broadcast name is required.', 422);
  if (!templateId) return fail(res, 'A template is required.', 422);
  const template = await one('SELECT id FROM templates WHERE id=? AND company_id=? LIMIT 1', [templateId, req.companyId]);
  if (!template) return fail(res, 'Template not found.', 404);

  const audienceFilter = { type: req.body.audience_type || 'all_contacts', value: req.body.audience_value || null };
  const scheduleAt = req.body.start_at || null;
  const status = scheduleAt ? 'scheduled' : 'draft';

  const result = await run(
    `INSERT INTO campaigns (company_id,name,type,status,template_id,audience_filter,start_at,created_by)
     VALUES (?,?,'broadcast',?,?,?,?,?)`,
    [req.companyId, name, status, templateId, JSON.stringify(audienceFilter), scheduleAt, req.user.id]
  );
  ok(res, { id: result.insertId }, scheduleAt ? 'Broadcast scheduled.' : 'Broadcast saved as draft.');
}

export async function send(req, res) {
  const campaignId = Number(req.params.id);
  const campaign = await one("SELECT id, status FROM campaigns WHERE id=? AND company_id=? AND type='broadcast' LIMIT 1", [campaignId, req.companyId]);
  if (!campaign) return fail(res, 'Broadcast not found.', 404);
  if (campaign.status === 'sending') return fail(res, 'This broadcast is already sending.', 422);

  // A batch of thousands of emails can take minutes — far longer than a
  // request should stay open (browsers/proxies will time it out). Kick off
  // the send in the background and respond immediately; the frontend polls
  // the broadcast list to show live progress until status flips to 'sent'.
  sendBroadcastNow(campaignId, req.companyId).catch((err) => {
    console.error(`[broadcast] send failed for campaign ${campaignId}:`, err);
  });
  ok(res, { status: 'sending' }, 'Broadcast started.');
}

export async function destroy(req, res) {
  const broadcast = await one("SELECT id FROM campaigns WHERE id=? AND company_id=? AND type='broadcast' LIMIT 1", [Number(req.params.id), req.companyId]);
  if (!broadcast) return fail(res, 'Broadcast not found.', 404);
  await run('DELETE FROM campaigns WHERE id=?', [broadcast.id]);
  ok(res, null, 'Broadcast deleted.');
}
