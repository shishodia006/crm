import { one, q, run, scalar, updateById } from '../db/pool.js';
import { config } from '../config/index.js';
import { cleanString, ipAddress, titleCase } from '../utils/helpers.js';
import { addScoreEvent } from './score.service.js';

export function validateLead(data, req) {
  const errors = {};
  const clean = {};
  const name = String(data.name || '').trim();
  if (!name) errors.name = 'Name is required.';
  else clean.name = titleCase(name).slice(0, 150);

  const email = String(data.email || '').trim().toLowerCase();
  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Invalid email address.';
      clean.email_valid = 0;
    } else {
      clean.email = email;
      clean.email_valid = 1;
    }
  } else {
    clean.email = null;
    clean.email_valid = null;
  }

  let mobile = String(data.mobile || data.phone || data.phone_number || '').trim().replace(/[^\d+]/g, '');
  if (mobile) {
    if (/^\d{10}$/.test(mobile)) mobile = `+91${mobile}`;
    if (!/^\+[1-9]\d{7,14}$/.test(mobile)) {
      errors.mobile = 'Invalid mobile number.';
      clean.mobile_valid = 0;
    } else {
      clean.mobile = mobile;
      clean.mobile_valid = 1;
    }
  } else {
    clean.mobile = null;
    clean.mobile_valid = null;
  }

  if (!clean.email && !clean.mobile) errors.contact = 'Email or mobile is required.';

  clean.company = cleanString(data.company ?? data.company_name, 200);
  clean.designation = cleanString(data.designation ?? data.job_title ?? data.title, 150);
  clean.industry = cleanString(data.industry, 100);
  clean.city = cleanString(data.city, 100);
  clean.state = cleanString(data.state, 100);
  clean.country = cleanString(data.country || 'India', 80) || 'India';
  clean.pincode = cleanString(data.pincode, 10);
  clean.website = cleanString(data.website, 255);
  clean.product_interest = cleanString(data.product_interest ?? data.product ?? data.subject, 255);
  clean.campaign_ref = cleanString(data.campaign_ref ?? data.campaign ?? data.utm_campaign, 255);
  clean.source_ref = cleanString(data.source_ref ?? data.lead_id, 255);
  clean.ip_address = ipAddress(req);

  if (data.custom_fields && typeof data.custom_fields === 'object') {
    clean.custom_fields = JSON.stringify(data.custom_fields);
  }

  return { clean, errors, valid: Object.keys(errors).length === 0 };
}

export async function findLeadByEmailOrMobile(email = '', mobile = '', companyId = null, conn = undefined) {
  const { pool } = await import('../db/pool.js');
  const db = conn || pool;
  const clauses = [];
  const params = [];
  if (email) { clauses.push('email = ?'); params.push(email); }
  if (mobile) { clauses.push('mobile = ?'); params.push(mobile); }
  if (!clauses.length) return null;
  const contactClause = `(${clauses.join(' OR ')})`;
  if (companyId) { params.push(Number(companyId)); }
  return one(`SELECT * FROM leads WHERE ${contactClause}${companyId ? ' AND company_id = ?' : ''} ORDER BY created_at ASC LIMIT 1`, params, db);
}

export async function insertLead(data, conn = undefined) {
  const { pool } = await import('../db/pool.js');
  const db = conn || pool;
  const keys = Object.keys(data).filter((key) => data[key] !== undefined);
  const cols = keys.map((key) => `\`${key}\``).join(',');
  const marks = keys.map(() => '?').join(',');
  const result = await run(`INSERT INTO leads (${cols}) VALUES (${marks})`, keys.map((key) => data[key]), db);
  return Number(result.insertId);
}

export async function matchingCampaign(leadId, sourceId, companyId = null, conn = undefined) {
  const { pool } = await import('../db/pool.js');
  const db = conn || pool;
  const campaigns = await q(`SELECT id,entry_rules FROM campaigns WHERE status='active' AND type='drip'${companyId ? ' AND company_id=?' : ''}`, companyId ? [Number(companyId)] : [], db);
  const lead = await one('SELECT * FROM leads WHERE id=? LIMIT 1', [leadId], db);
  for (const campaign of campaigns) {
    let rules = {};
    try { rules = JSON.parse(campaign.entry_rules || '{}') || {}; } catch { rules = {}; }
    // multi-source array (new format)
    if (Array.isArray(rules.source_ids) && rules.source_ids.map(Number).includes(Number(sourceId))) return Number(campaign.id);
    // single source (legacy format)
    if (rules.source_id && Number(rules.source_id) === Number(sourceId)) return Number(campaign.id);
    if (rules.product_interest && lead?.product_interest &&
      String(lead.product_interest).toLowerCase().includes(String(rules.product_interest).toLowerCase())) {
      return Number(campaign.id);
    }
  }
  return null;
}

export async function processLead(rawData, sourceId, campaignId, req, conn = undefined) {
  const { pool } = await import('../db/pool.js');
  const { enqueueJob } = await import('./job.service.js');
  const { enrollLead } = await import('./drip.service.js');
  const db = conn || pool;
  const { clean, errors, valid } = validateLead(rawData, req);
  if (!valid) return { success: false, lead_id: null, is_duplicate: false, errors };

  clean.source_id = Number(sourceId);
  const companyId = Number(req?.companyId || rawData.company_id || 0) || null;
  if (companyId) clean.company_id = companyId;
  const existing = await findLeadByEmailOrMobile(clean.email || '', clean.mobile || '', companyId, db);
  let leadId;
  let isDuplicate = false;

  if (existing) {
    const merge = {};
    for (const field of ['company', 'designation', 'industry', 'city', 'state', 'country', 'product_interest']) {
      if (!existing[field] && clean[field]) merge[field] = clean[field];
    }
    if (Object.keys(merge).length) await updateById('leads', existing.id, merge, db);
    leadId = Number(existing.id);
    const ageSeconds = (Date.now() - new Date(existing.created_at).getTime()) / 1000;
    isDuplicate = ageSeconds < config.dedupWindowHours * 3600;
    if (isDuplicate) {
      await insertLead({
        name: clean.name, email: clean.email, mobile: clean.mobile, company: clean.company,
        source_id: clean.source_id, source_ref: clean.source_ref, is_duplicate: 1,
        duplicate_of: existing.id, email_valid: clean.email_valid, mobile_valid: clean.mobile_valid
      }, db);
    }
  } else {
    leadId = await insertLead(clean, db);
  }

  await enqueueJob('segment_lead', { lead_id: leadId }, db);
  const autoCampaignId = campaignId || (await matchingCampaign(leadId, sourceId, companyId, db));
  if (autoCampaignId) await enqueueJob('enroll_lead', { lead_id: leadId, campaign_id: autoCampaignId }, db);
  return { success: true, lead_id: leadId, is_duplicate: isDuplicate, errors: [] };
}

export async function leadTimeline(leadId) {
  return q(
    `SELECT 'communication' AS entity, id, channel AS subtype, status, created_at,
            COALESCE(subject, channel) AS summary, NULL AS user_name, failed_reason AS detail,
            enrollment_id
     FROM communications WHERE lead_id = ?
     UNION ALL
     SELECT 'activity', a.id, a.type, NULL, a.created_at, a.subject, u.name, NULL, NULL
     FROM activities a LEFT JOIN users u ON u.id = a.user_id WHERE a.lead_id = ?
     UNION ALL
     SELECT 'score_event', id, event, NULL, created_at,
            CONCAT(IF(delta>0,'+',''), delta, ' pts (', score_after, ' total)'), NULL, NULL, NULL
     FROM lead_score_events WHERE lead_id = ?
     ORDER BY created_at DESC`,
    [leadId, leadId, leadId]
  );
}

export async function listLeads(filters = {}, page = 1, perPage = config.perPage, companyId = null) {
  const where = ['1=1'];
  const params = [];
  if (companyId) { where.push('l.company_id = ?'); params.push(Number(companyId)); }
  if (filters.search) {
    const s = `%${filters.search}%`;
    where.push('(l.name LIKE ? OR l.email LIKE ? OR l.mobile LIKE ? OR l.company LIKE ?)');
    params.push(s, s, s, s);
  }
  if (filters.source_id === 'none') { where.push('l.source_id IS NULL'); }
  else if (filters.source_id) { where.push('l.source_id = ?'); params.push(Number(filters.source_id)); }
  if (filters.status) { where.push('l.status = ?'); params.push(filters.status); }
  if (filters.category) { where.push('l.category = ?'); params.push(filters.category); }
  if (filters.assigned) { where.push('l.assigned_to = ?'); params.push(filters.assigned); }
  if (filters.date_from) { where.push('DATE(l.created_at) >= ?'); params.push(filters.date_from); }
  if (filters.date_to) { where.push('DATE(l.created_at) <= ?'); params.push(filters.date_to); }
  const clause = where.join(' AND ');
  const offset = (page - 1) * perPage;
  const total = Number(await scalar(`SELECT COUNT(*) FROM leads l WHERE ${clause}`, params));
  const data = await q(
    `SELECT l.*, ls.name AS source_name, u.name AS assigned_name,
       (SELECT COUNT(*) FROM communications WHERE lead_id=l.id AND channel='email') AS email_sent,
       (SELECT COUNT(*) FROM communications WHERE lead_id=l.id AND channel='email' AND status IN ('opened','clicked')) AS email_opened,
       (SELECT COUNT(*) FROM communications WHERE lead_id=l.id AND channel='email' AND status='clicked') AS email_clicked,
       (SELECT COUNT(*) FROM communications WHERE lead_id=l.id AND channel='whatsapp') AS wa_sent,
       (SELECT COUNT(*) FROM communications WHERE lead_id=l.id AND channel='whatsapp' AND status IN ('delivered','opened','clicked','replied')) AS wa_delivered,
       (SELECT COUNT(*) FROM communications WHERE lead_id=l.id AND channel='sms') AS sms_sent,
       (SELECT COUNT(*) FROM communications WHERE lead_id=l.id AND channel='sms' AND status IN ('delivered','opened','clicked')) AS sms_delivered,
       (SELECT COUNT(*) FROM communications WHERE lead_id=l.id AND channel='rcs') AS rcs_sent,
       (SELECT COUNT(*) FROM communications WHERE lead_id=l.id AND channel='rcs' AND status IN ('delivered','opened','clicked','replied')) AS rcs_delivered
     FROM leads l
     LEFT JOIN lead_sources ls ON ls.id=l.source_id
     LEFT JOIN users u ON u.id=l.assigned_to
     WHERE ${clause}
     ORDER BY l.created_at DESC LIMIT ${Number(perPage)} OFFSET ${Number(offset)}`,
    params
  );
  return { data, total, per_page: perPage, current_page: page, last_page: Math.ceil(total / perPage) || 1 };
}
