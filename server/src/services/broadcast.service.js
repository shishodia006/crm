import { one, q, run } from '../db/pool.js';
import { sendCommunication, sendAnantyaBroadcast } from './comm.service.js';

// WhatsApp/RCS templates go through Anantya's bulk campaign API (one HTTP call
// for every recipient) — everything else (email/SMS) still sends one at a time,
// since only Anantya has a true bulk endpoint here.
const BULK_CHANNELS = ['whatsapp', 'rcs'];

export const AUDIENCE_TYPES = [
  { key: 'all_contacts', label: 'All contacts' },
  { key: 'active_leads', label: 'All active leads' },
  { key: 'lead_status', label: 'Leads with a specific status' },
  { key: 'lead_source', label: 'Leads from a specific source' },
  { key: 'pipeline_stage', label: 'Deals in a specific pipeline stage' },
  { key: 'segment', label: 'A saved segment' },
];

export async function resolveAudience(companyId, filter) {
  const type = filter?.type || 'all_contacts';
  let where = "l.company_id=? AND l.do_not_contact=0 AND l.status NOT IN ('unsubscribed','invalid')";
  const params = [companyId];
  let label = 'All contacts';

  if (type === 'active_leads') {
    where += " AND l.status NOT IN ('new','lost','unsubscribed','invalid')";
    label = 'All active leads';
  } else if (type === 'lead_status' && filter.value) {
    where += ' AND l.status=?';
    params.push(filter.value);
    label = `${filter.value.charAt(0).toUpperCase()}${filter.value.slice(1)} leads`;
  } else if (type === 'lead_source' && filter.value) {
    where += ' AND l.source_id=?';
    params.push(Number(filter.value));
    const src = await one('SELECT name FROM lead_sources WHERE id=?', [Number(filter.value)]);
    label = src?.name ? `Source: ${src.name}` : 'Source';
  } else if (type === 'pipeline_stage' && filter.value) {
    where += ' AND l.id IN (SELECT lead_id FROM deals WHERE stage_id=? AND company_id=?)';
    params.push(Number(filter.value), companyId);
    const stage = await one('SELECT name FROM pipeline_stages WHERE id=?', [Number(filter.value)]);
    label = stage?.name ? `${stage.name} stage` : 'Pipeline stage';
  } else if (type === 'segment' && filter.value) {
    where += ' AND l.id IN (SELECT lead_id FROM segment_leads WHERE segment_id=?)';
    params.push(Number(filter.value));
    const seg = await one('SELECT name FROM segments WHERE id=?', [Number(filter.value)]);
    label = seg?.name || 'Segment';
  }

  const leads = await q(
    `SELECT l.id, l.name, l.email, l.mobile, l.company, l.city, l.product_interest, l.company_id
     FROM leads l WHERE ${where}`,
    params
  );
  return { leads, label };
}

// Runs the actual send. Marks the campaign 'sending' immediately so the UI can
// show a live "in progress" state, updates sent_count as each message goes out
// (not just once at the very end) so progress is visible while polling, and
// only flips to 'sent' once every recipient has been attempted. Callers that
// need this to happen in the background (the HTTP endpoint — a batch of
// thousands of emails can take minutes, far longer than a request should
// stay open) call this WITHOUT awaiting it; processDueBroadcasts (a cron job,
// already off the request path) awaits it directly.
export async function sendBroadcastNow(campaignId, companyId) {
  const campaign = await one("SELECT * FROM campaigns WHERE id=? AND company_id=? AND type='broadcast' LIMIT 1", [campaignId, companyId]);
  if (!campaign) throw new Error('Broadcast not found.');
  if (!campaign.template_id) throw new Error('This broadcast has no template selected.');
  const template = await one("SELECT * FROM templates WHERE id=? AND status='active' LIMIT 1", [campaign.template_id]);
  if (!template) throw new Error('Template not found or inactive.');

  let filter = {};
  try { filter = typeof campaign.audience_filter === 'string' ? JSON.parse(campaign.audience_filter) : (campaign.audience_filter || {}); } catch { filter = {}; }
  const { leads } = await resolveAudience(companyId, filter);

  // Skip leads already enrolled in this broadcast (re-clicking "Send" shouldn't
  // message the same person twice), for both send paths.
  const newLeads = [];
  for (const lead of leads) {
    const existing = await one('SELECT id FROM lead_enrollments WHERE lead_id=? AND campaign_id=? LIMIT 1', [lead.id, campaignId]);
    if (!existing) newLeads.push(lead);
  }

  await run("UPDATE campaigns SET status='sending', start_at=COALESCE(start_at, NOW()), updated_at=NOW() WHERE id=?", [campaignId]);

  let sent = 0;
  try {
    if (BULK_CHANNELS.includes(template.channel)) {
      // One Anantya API call for every recipient — fast enough that the whole
      // batch counts as a single progress step rather than per-lead updates.
      for (const lead of newLeads) {
        await run(
          "INSERT INTO lead_enrollments (lead_id,campaign_id,status,enrolled_at,completed_at) VALUES (?,?,'completed',NOW(),NOW())",
          [lead.id, campaignId]
        );
      }
      const result = await sendAnantyaBroadcast(template.channel, newLeads, template, template.integration_account_id);
      sent = result.sent;
      await run("UPDATE campaigns SET sent_count=sent_count+? WHERE id=?", [sent, campaignId]);
    } else {
      for (const lead of newLeads) {
        const result = await run(
          "INSERT INTO lead_enrollments (lead_id,campaign_id,status,enrolled_at,completed_at) VALUES (?,?,'completed',NOW(),NOW())",
          [lead.id, campaignId]
        );
        const enrollmentId = Number(result.insertId);
        const commResult = await sendCommunication(template.channel, lead, template, enrollmentId);
        if (commResult.comm_id) {
          sent += 1;
          await run("UPDATE campaigns SET sent_count=sent_count+1 WHERE id=?", [campaignId]);
        }
      }
    }
    await run("UPDATE campaigns SET status='sent', updated_at=NOW() WHERE id=?", [campaignId]);
  } catch (err) {
    // Back to draft (not stuck on 'sending' forever) so it's clear something
    // went wrong and it can be retried — matches how processDueBroadcasts
    // already treats a failed send.
    await run("UPDATE campaigns SET status='draft', updated_at=NOW() WHERE id=?", [campaignId]).catch(() => {});
    throw err;
  }

  return { sent, total: leads.length };
}

export async function processDueBroadcasts() {
  const due = await q("SELECT id, company_id FROM campaigns WHERE type='broadcast' AND status='scheduled' AND start_at <= NOW()");
  let sent = 0, failed = 0;
  for (const broadcast of due) {
    try {
      await sendBroadcastNow(broadcast.id, broadcast.company_id);
      sent += 1;
    } catch (error) {
      console.error(`[broadcast] send failed for campaign ${broadcast.id}:`, error.message);
      await run("UPDATE campaigns SET status='draft' WHERE id=?", [broadcast.id]);
      failed += 1;
    }
  }
  return { sent, failed };
}
