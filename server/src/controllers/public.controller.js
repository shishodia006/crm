import crypto from 'crypto';
import { one, run } from '../db/pool.js';
import { ok, fail } from '../utils/response.js';
import { ipAddress } from '../utils/helpers.js';
import { safeEquals } from '../utils/crypto.js';
import { decodeTrackingUid } from '../utils/crypto.js';
import { processLead } from '../services/lead.service.js';
import { addScoreEvent } from '../services/score.service.js';
import { updateById } from '../db/pool.js';
import { config } from '../config/index.js';
import { getSetting, saveSetting } from '../services/settings.service.js';
import { processDue } from '../services/drip.service.js';
import { processJobs } from '../services/job.service.js';

export async function ingest(req, res) {
  const expected = config.apiToken;
  if (expected) {
    const header = req.headers.authorization || '';
    const provided = /^Bearer\s+(.+)$/i.test(header) ? header.replace(/^Bearer\s+/i, '').trim() : '';
    if (!safeEquals(expected, provided)) return fail(res, 'Invalid API token.', 401);
  } else if (config.env === 'production') {
    return fail(res, 'Lead ingest API token is not configured.', 503);
  }
  const sourceRow = await one('SELECT * FROM lead_sources WHERE slug=? LIMIT 1', [req.params.source]);
  if (!sourceRow) return fail(res, `Unknown source: ${req.params.source}`, 404);
  const raw = { ...req.body, ...req.query };
  const normalized = {
    name: raw.name ?? raw.full_name ?? raw.contact_name ?? '',
    email: raw.email ?? raw.email_address ?? null,
    mobile: raw.mobile ?? raw.phone ?? raw.phone_number ?? null,
    company: raw.company ?? raw.company_name ?? raw.organization ?? null,
    designation: raw.designation ?? raw.job_title ?? raw.title ?? null,
    industry: raw.industry ?? null, city: raw.city ?? null, state: raw.state ?? null,
    country: raw.country ?? 'India', product_interest: raw.product_interest ?? raw.product ?? raw.subject ?? null,
    campaign_ref: raw.campaign ?? raw.utm_campaign ?? null, source_ref: raw.source_ref ?? raw.lead_id ?? null,
    custom_fields: raw
  };
  const result = await processLead(normalized, sourceRow.id, raw.campaign_id ? Number(raw.campaign_id) : null, req);
  if (!result.success) return fail(res, 'Validation failed', 422, result.errors);
  ok(res, { lead_id: result.lead_id, is_duplicate: result.is_duplicate }, result.is_duplicate ? 'Lead already exists, merged.' : 'Lead created.');
}

export async function webhook(req, res) {
  await run('INSERT INTO webhook_logs (source,payload,status,ip) VALUES (?,?,?,?)', [
    req.params.source, req.rawBody || JSON.stringify(req.body || {}), 'received', ipAddress(req)
  ]);
  if (req.method === 'GET') {
    const token = req.query.hub_verify_token || req.query['hub.verify_token'];
    const challenge = req.query.hub_challenge || req.query['hub.challenge'] || '';
    const source = req.params.source;
    const verifyToken = source === 'meta' || source === 'meta_leads'
      ? await getSetting('meta_verify_token')
      : await getSetting('wa_webhook_token', process.env.WA_WEBHOOK_TOKEN || '');
    if ((req.query.hub_mode || req.query['hub.mode']) === 'subscribe' && token === verifyToken) {
      return res.type('text/plain').send(String(challenge));
    }
    return fail(res, 'Verification failed', 403);
  }
  res.json({ status: 'ok' });
}

export async function trackOpen(req, res) {
  const commId = decodeTrackingUid(req.params.uid);
  if (commId) {
    const comm = await one('SELECT * FROM communications WHERE id=? LIMIT 1', [commId]);
    if (comm && !comm.opened_at) {
      await run("UPDATE communications SET status='opened', opened_at=NOW() WHERE id=?", [commId]);
      await addScoreEvent(Number(comm.lead_id), 'email_open', 'communication', commId);
    }
  }
  res.setHeader('Content-Type', 'image/gif');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
}

export async function trackClick(req, res) {
  const commId = decodeTrackingUid(req.params.uid);
  const url = String(req.query.url || '/');
  if (commId) {
    const comm = await one('SELECT * FROM communications WHERE id=? LIMIT 1', [commId]);
    if (comm) {
      await run('INSERT INTO email_link_clicks (communication_id,lead_id,url,ip) VALUES (?,?,?,?)', [commId, comm.lead_id, url, ipAddress(req)]);
      await run("UPDATE communications SET status='clicked', clicked_at=NOW() WHERE id=?", [commId]);
      const score = await addScoreEvent(Number(comm.lead_id), 'email_click', 'communication', commId);
      if (score >= 76) await updateById('leads', Number(comm.lead_id), { category: 'hot' });
    }
  }
  const parsed = /^https?:\/\//i.test(url) ? url : config.appUrl;
  res.redirect(parsed);
}

export async function qrCapture(req, res) {
  const sourceRow = await one('SELECT * FROM lead_sources WHERE slug=? LIMIT 1', [req.params.source]);
  if (!sourceRow) return res.status(404).send('Lead source not found.');
  if (req.method === 'POST') {
    const result = await processLead(req.body, sourceRow.id, null, req);
    if (!result.success) return fail(res, 'Validation failed', 422, result.errors);
    return ok(res, { lead_id: result.lead_id }, 'Lead captured!');
  }
  res.type('html').send(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lead Capture</title>
<link href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.2/css/bootstrap.min.css" rel="stylesheet"></head>
<body class="bg-light"><main class="container py-5" style="max-width:560px">
<div class="card shadow-sm"><div class="card-body p-4">
<h4 class="mb-1">Dot Domino</h4><p class="text-muted">Share your details and our team will contact you.</p>
<form method="post"><input type="hidden" name="_token" value="${req.session.csrfToken}">
<div class="mb-3"><label class="form-label">Name</label><input name="name" class="form-control" required></div>
<div class="mb-3"><label class="form-label">Email</label><input name="email" type="email" class="form-control"></div>
<div class="mb-3"><label class="form-label">Mobile</label><input name="mobile" class="form-control"></div>
<div class="mb-3"><label class="form-label">Company</label><input name="company" class="form-control"></div>
<div class="mb-3"><label class="form-label">Requirement</label><textarea name="product_interest" class="form-control" rows="3"></textarea></div>
<button class="btn btn-primary w-100">Submit</button></form></div></div></main></body></html>`);
}

export async function oauthStart(req, res) {
  const provider = req.params.provider;
  req.session.oauth_state = crypto.randomBytes(16).toString('hex');
  let redirectUrl = null;
  if (provider === 'gmail') {
    redirectUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: await getSetting('gmail_oauth_client_id'),
      redirect_uri: `${config.appUrl}/oauth/gmail/callback`,
      response_type: 'code', scope: 'https://www.googleapis.com/auth/gmail.send email profile',
      access_type: 'offline', prompt: 'consent', state: req.session.oauth_state
    })}`;
  } else if (provider === 'outlook') {
    const tenant = await getSetting('outlook_oauth_tenant', 'common');
    redirectUrl = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${new URLSearchParams({
      client_id: await getSetting('outlook_oauth_client_id'),
      redirect_uri: `${config.appUrl}/oauth/outlook/callback`,
      response_type: 'code', scope: 'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access',
      response_mode: 'query', state: req.session.oauth_state
    })}`;
  }
  if (!redirectUrl) return res.status(400).send(`Unknown provider: ${provider}`);
  res.redirect(redirectUrl);
}

export async function oauthCallback(req, res) {
  if (!req.session.oauth_state || req.query.state !== req.session.oauth_state) {
    return res.redirect('/settings/integrations?oauth=state_mismatch');
  }
  req.session.oauth_state = null;
  const provider = req.params.provider;
  const code = req.query.code;
  if (!code) return res.redirect(`/settings/integrations?oauth=${encodeURIComponent(req.query.error || 'denied')}`);
  try {
    if (provider === 'gmail') {
      const body = new URLSearchParams({
        client_id: await getSetting('gmail_oauth_client_id'), client_secret: await getSetting('gmail_oauth_client_secret'),
        redirect_uri: `${config.appUrl}/oauth/gmail/callback`, code, grant_type: 'authorization_code'
      });
      const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
      const token = await response.json();
      if (!token.access_token) throw new Error(token.error_description || 'Gmail token exchange failed.');
      const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` } });
      const profile = await profileResponse.json();
      await saveSetting('gmail_oauth_access_token', token.access_token, 'email');
      await saveSetting('gmail_oauth_refresh_token', token.refresh_token || '', 'email');
      await saveSetting('gmail_oauth_email', profile.email || '', 'email');
      await saveSetting('email_provider', 'gmail_oauth', 'email');
    } else if (provider === 'outlook') {
      const tenant = await getSetting('outlook_oauth_tenant', 'common');
      const body = new URLSearchParams({
        client_id: await getSetting('outlook_oauth_client_id'), client_secret: await getSetting('outlook_oauth_client_secret'),
        redirect_uri: `${config.appUrl}/oauth/outlook/callback`, code, grant_type: 'authorization_code',
        scope: 'https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access'
      });
      const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, { method: 'POST', body });
      const token = await response.json();
      if (!token.access_token) throw new Error(token.error_description || 'Outlook token exchange failed.');
      const profileResponse = await fetch('https://graph.microsoft.com/v1.0/me', { headers: { Authorization: `Bearer ${token.access_token}` } });
      const profile = await profileResponse.json();
      await saveSetting('outlook_oauth_access_token', token.access_token, 'email');
      await saveSetting('outlook_oauth_refresh_token', token.refresh_token || '', 'email');
      await saveSetting('outlook_oauth_email', profile.mail || profile.userPrincipalName || '', 'email');
      await saveSetting('email_provider', 'outlook_oauth', 'email');
    }
    res.redirect('/settings/integrations?oauth=connected');
  } catch (error) {
    res.redirect(`/settings/integrations?oauth=${encodeURIComponent(error.message)}`);
  }
}

export async function oauthRevoke(req, res) {
  const keys = req.params.provider === 'gmail'
    ? ['gmail_oauth_access_token','gmail_oauth_refresh_token','gmail_oauth_email']
    : req.params.provider === 'outlook'
      ? ['outlook_oauth_access_token','outlook_oauth_refresh_token','outlook_oauth_email']
      : [];
  if (keys.length) await run(`DELETE FROM settings WHERE \`key\` IN (${keys.map(() => '?').join(',')})`, keys);
  ok(res, null, `${req.params.provider} disconnected.`);
}

export async function runCron(req, res) {
  const provided = req.headers['x-cron-secret'] || req.body.secret || req.query.secret || '';
  if (config.cronSecret && provided !== config.cronSecret) return fail(res, 'Invalid cron secret.', 401);
  const jobs = await processJobs(50);
  const drip = await processDue(config.dripBatchSize);
  ok(res, { jobs, drip }, 'Cron processed.');
}
