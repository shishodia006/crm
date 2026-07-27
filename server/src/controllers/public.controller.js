import crypto from 'crypto';
import { one, run } from '../db/pool.js';
import { ok, fail } from '../utils/response.js';
import { ipAddress } from '../utils/helpers.js';
import { safeEquals } from '../utils/crypto.js';
import { decodeTrackingUid } from '../utils/crypto.js';
import { processLead } from '../services/lead.service.js';
import { updateById } from '../db/pool.js';
import { config } from '../config/index.js';
import { getSetting, saveSetting, saveCompanySetting, resolveCompanyByAnantyaKey } from '../services/settings.service.js';
import { processDue } from '../services/drip.service.js';
import { processJobs } from '../services/job.service.js';
import { extractWebhookEvents, extractInboundMessages, recordCommunicationEvent } from '../services/engagement.service.js';
import { recordInboundMessage } from '../services/conversation.service.js';

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
  if (req.params.source === 'shopify') {
    // Shopify signs with its own header/scheme (X-Shopify-Hmac-Sha256, base64,
    // no GET-verification handshake) — entirely different from the hub-signature
    // convention the rest of this function assumes, so it gets its own path.
    const { handleShopifyWebhook } = await import('../services/shopify.service.js');
    return handleShopifyWebhook(req, res);
  }
  if (req.params.source === 'hubspot') {
    // HubSpot resolves the company via a per-company key baked into the URL
    // (/webhook/hubspot/:webhookKey) rather than a header — same convention as
    // integration_accounts elsewhere — and signs with its own v3 HMAC scheme.
    const { handleHubspotWebhook } = await import('../services/hubspot.service.js');
    return handleHubspotWebhook(req, res);
  }
  if (req.params.source === 'mailchimp') {
    // Mailchimp never signs webhooks at all — the URL-embedded key is the only
    // authentication — and pings with a plain GET first to check reachability.
    const { handleMailchimpWebhook } = await import('../services/mailchimp.service.js');
    return handleMailchimpWebhook(req, res);
  }
  if (req.params.source === 'zendesk') {
    const { handleZendeskWebhook } = await import('../services/zendesk.service.js');
    return handleZendeskWebhook(req, res);
  }
  if (req.params.source === 'indiamart') {
    const { handleIndiamartWebhook } = await import('../services/indiamart.service.js');
    return handleIndiamartWebhook(req, res);
  }
  if (req.params.source === 'tradeindia') {
    const { handleTradeindiaWebhook } = await import('../services/tradeindia.service.js');
    return handleTradeindiaWebhook(req, res);
  }
  if (req.params.source === 'meta' || req.params.source === 'meta_leads') {
    // Handles both the GET hub.challenge handshake and POST leadgen events —
    // superseding the generic GET-verification branch further down for this
    // source specifically, since Meta needs a Graph API follow-up call the
    // generic branch has no concept of.
    const { handleMetaWebhook } = await import('../services/meta.service.js');
    return handleMetaWebhook(req, res);
  }
  if (req.params.source === 'google_ads') {
    const { handleGoogleAdsWebhook } = await import('../services/googleAds.service.js');
    return handleGoogleAdsWebhook(req, res);
  }
  if (req.params.source === 'justdial') {
    const { handleJustdialWebhook } = await import('../services/justdial.service.js');
    return handleJustdialWebhook(req, res);
  }
  if (req.params.source === 'bombora') {
    const { handleBomboraWebhook } = await import('../services/bombora.service.js');
    return handleBomboraWebhook(req, res);
  }
  if (req.params.source === 'g2_intent') {
    const { handleG2IntentWebhook } = await import('../services/g2intent.service.js');
    return handleG2IntentWebhook(req, res);
  }
  if (req.params.source === 'anantya') {
    try {
      const fs = await import('fs');
      fs.appendFileSync('webhook_debug.log', `\n=== NEW REQUEST [${new Date().toISOString()}] ===\nMethod: ${req.method}\nURL: ${req.url}\nHeaders: ${JSON.stringify(req.headers, null, 2)}\nBody: ${JSON.stringify(req.body, null, 2)}\nRawBody: ${req.rawBody || ''}\n==================================\n`);
    } catch (e) {
      console.error('Debug log write failed:', e);
    }
  }
  let account = null;
  if (req.params.webhookKey) {
    account = await one('SELECT * FROM integration_accounts WHERE webhook_key=? AND is_active=1 LIMIT 1', [req.params.webhookKey]);
    if (!account) return fail(res, 'Webhook endpoint not found.', 404);
    if (req.method !== 'GET' && account.webhook_secret) {
      const rawSignature = req.get('x-hub-signature-256') || req.get('x-webhook-signature') || req.get('x-signature') || '';
      const provided = rawSignature.replace(/^sha256=/i, '').trim();
      const expected = crypto.createHmac('sha256', account.webhook_secret).update(req.rawBody || '').digest('hex');
      if (!safeEquals(expected, provided)) return fail(res, 'Invalid webhook signature.', 401);
    }
  }
  // The generic /webhook/anantya route (a company's *default* WhatsApp number, no
  // named integration_accounts row) has no webhook_key in the URL to authenticate
  // against, so it has no protection at all otherwise. Anantya lets you echo the
  // API key we gave them back in a custom header — verifying it both confirms the
  // call is genuinely from Anantya and resolves which company it belongs to.
  let anantyaCompanyId = null;
  if (!account && req.params.source === 'anantya' && req.method !== 'GET') {
    anantyaCompanyId = await resolveCompanyByAnantyaKey(req.get('x-api-key') || '');
    if (!anantyaCompanyId) return fail(res, 'Invalid or missing X-API-KEY.', 401);
  }

  const logResult = await run('INSERT INTO webhook_logs (source,payload,status,ip) VALUES (?,?,?,?)', [
    req.params.source, req.rawBody || JSON.stringify(req.body || {}), 'received', ipAddress(req)
  ]);
  if (req.method === 'GET') {
    // Anantya's "is this URL reachable" check is a plain GET with no query params —
    // it doesn't speak Meta's hub.mode/hub.challenge handshake, so don't require it.
    // The real authentication for Anantya happens via the X-API-KEY header on POSTs.
    if (req.params.source === 'anantya') return res.status(200).json({ status: 'ok' });

    const token = req.query.hub_verify_token || req.query['hub.verify_token'];
    const challenge = req.query.hub_challenge || req.query['hub.challenge'] || '';
    const source = req.params.source;
    let accountConfig = {};
    try { accountConfig = JSON.parse(account?.config || '{}'); } catch {}
    const verifyToken = accountConfig.verify_token || (source === 'meta' || source === 'meta_leads'
      ? await getSetting('meta_verify_token', '', account?.company_id)
      : await getSetting('wa_webhook_token', process.env.WA_WEBHOOK_TOKEN || '')
    );
    if ((req.query.hub_mode || req.query['hub.mode']) === 'subscribe' && token === verifyToken) {
      return res.type('text/plain').send(String(challenge));
    }
    return fail(res, 'Verification failed', 403);
  }
  const resolvedCompanyId = account?.company_id || anantyaCompanyId || null;

  // Whatever goes wrong below must never leave the request hanging or the log
  // row stuck at 'received' with no trace — always ack the sender (so they don't
  // retry-storm us) and always write down exactly what happened, in the DB where
  // it can actually be queried, not just console output that may go unobserved.
  try {
    const events = extractWebhookEvents(req.body || {});
    const results = await Promise.all(events.map((event) => recordCommunicationEvent({
      ...event, provider: account?.provider || event.provider || req.params.source, companyId: resolvedCompanyId
    })));

    const inboundMessages = extractInboundMessages(req.body || {});
    const inboundResults = await Promise.all(inboundMessages.map((msg) => recordInboundMessage({
      companyId: resolvedCompanyId,
      channel: account?.channel && account.channel !== 'other' ? account.channel : 'whatsapp',
      fromPhone: msg.from,
      senderName: msg.contactName,
      body: msg.body,
      providerMsgId: msg.providerMsgId,
      contextProviderMsgId: msg.contextId,
      occurredAt: msg.occurredAt,
    })));
    const inboundRecorded = inboundResults.filter((r) => r.recorded).length;

    await run('UPDATE webhook_logs SET status=? WHERE id=?', [(results.some((event) => event.recorded) || inboundRecorded > 0) ? 'processed' : 'ignored', logResult.insertId]);
    res.json({ status: 'ok', events_received: events.length, events_recorded: results.filter((event) => event.recorded).length, inbound_recorded: inboundRecorded });
  } catch (err) {
    console.error('[webhook] processing error:', err);
    await run('UPDATE webhook_logs SET status=?, error=? WHERE id=?', ['failed', String(err.stack || err.message || err).slice(0, 2000), logResult.insertId]).catch(() => {});
    res.status(200).json({ status: 'error', message: 'Logged for review.' });
  }
}

export async function trackOpen(req, res) {
  const commId = decodeTrackingUid(req.params.uid);
  if (commId) {
    const comm = await one('SELECT * FROM communications WHERE id=? LIMIT 1', [commId]);
    if (comm && !comm.opened_at) {
      await run("UPDATE communications SET status='opened', opened_at=NOW() WHERE id=?", [commId]);
      await recordCommunicationEvent({ provider: 'email_tracking', communicationId: comm.id, eventType: 'opened', payload: { communication_id: comm.id } });
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
      const scoreResult = await recordCommunicationEvent({ provider: 'email_tracking', communicationId: comm.id, eventType: 'clicked', payload: { communication_id: comm.id, url } });
      const score = scoreResult.recorded ? Number((await one('SELECT score FROM leads WHERE id=? LIMIT 1', [comm.lead_id]))?.score || 0) : 0;
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
  } else if (provider === 'google_sheets') {
    // Client ID/secret are one fixed Google Cloud OAuth app for the whole
    // deployment (config/env, not per-company) — every company connects
    // through the same app, only the resulting tokens are per-company.
    redirectUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: config.googleSheets.clientId,
      redirect_uri: `${config.appUrl}/oauth/google_sheets/callback`,
      response_type: 'code', scope: 'https://www.googleapis.com/auth/spreadsheets.readonly email profile',
      access_type: 'offline', prompt: 'consent', state: req.session.oauth_state
    })}`;
  } else if (provider === 'salesforce') {
    const loginUrl = (await getSetting('salesforce_login_url', 'https://login.salesforce.com', req.companyId)).replace(/\/+$/, '');
    redirectUrl = `${loginUrl}/services/oauth2/authorize?${new URLSearchParams({
      client_id: await getSetting('salesforce_oauth_client_id', '', req.companyId),
      redirect_uri: `${config.appUrl}/oauth/salesforce/callback`,
      response_type: 'code', scope: 'api refresh_token', state: req.session.oauth_state
    })}`;
  } else if (provider === 'linkedin') {
    // r_ads_leadgen_automation is gated behind LinkedIn Marketing Developer
    // Platform partner approval — the OAuth dance itself works regardless,
    // but the actual API calls will 403 until that approval comes through.
    redirectUrl = `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({
      client_id: await getSetting('linkedin_oauth_client_id', '', req.companyId),
      redirect_uri: `${config.appUrl}/oauth/linkedin/callback`,
      response_type: 'code', scope: 'r_ads_leadgen_automation', state: req.session.oauth_state
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
  if (!code) return res.redirect(`/settings/integrations?oauth=${encodeURIComponent(req.query.error || 'denied')}&provider=${encodeURIComponent(provider)}`);
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
    } else if (provider === 'google_sheets') {
      const body = new URLSearchParams({
        client_id: config.googleSheets.clientId,
        client_secret: config.googleSheets.clientSecret,
        redirect_uri: `${config.appUrl}/oauth/google_sheets/callback`, code, grant_type: 'authorization_code'
      });
      const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
      const token = await response.json();
      if (!token.access_token) throw new Error(token.error_description || 'Google Sheets token exchange failed.');
      const profileResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` } });
      const profile = await profileResponse.json();
      // Google only returns a refresh_token on the very first consent — a later
      // re-auth (e.g. after the access token merely expired) won't include one,
      // so keep whatever refresh_token is already stored rather than blanking it.
      const existingRefreshToken = await getSetting('google_sheets_refresh_token', '', req.companyId);
      await saveCompanySetting(req.companyId, 'google_sheets_access_token', token.access_token, 'sources');
      await saveCompanySetting(req.companyId, 'google_sheets_refresh_token', token.refresh_token || existingRefreshToken, 'sources');
      await saveCompanySetting(req.companyId, 'google_sheets_token_expires_at', String(Date.now() + Number(token.expires_in || 3600) * 1000), 'sources');
      await saveCompanySetting(req.companyId, 'google_sheets_email', profile.email || '', 'sources');
      const existingIntegration = await one('SELECT id FROM integrations WHERE company_id=? AND slug=? LIMIT 1', [req.companyId, 'google_sheets']);
      const configJson = JSON.stringify({ email: profile.email || '' });
      if (existingIntegration) {
        await run("UPDATE integrations SET is_active=1, config=?, updated_at=NOW() WHERE id=?", [configJson, existingIntegration.id]);
      } else {
        await run('INSERT INTO integrations (company_id,name,slug,type,is_active,config) VALUES (?,?,?,?,1,?)', [req.companyId, 'Google Sheets', 'google_sheets', 'other', configJson]);
      }
    } else if (provider === 'salesforce') {
      const loginUrl = (await getSetting('salesforce_login_url', 'https://login.salesforce.com', req.companyId)).replace(/\/+$/, '');
      const body = new URLSearchParams({
        grant_type: 'authorization_code', code,
        client_id: await getSetting('salesforce_oauth_client_id', '', req.companyId),
        client_secret: await getSetting('salesforce_oauth_client_secret', '', req.companyId),
        redirect_uri: `${config.appUrl}/oauth/salesforce/callback`,
      });
      const response = await fetch(`${loginUrl}/services/oauth2/token`, { method: 'POST', body });
      const token = await response.json();
      if (!token.access_token) throw new Error(token.error_description || 'Salesforce token exchange failed.');
      await saveCompanySetting(req.companyId, 'salesforce_access_token', token.access_token, 'sources');
      await saveCompanySetting(req.companyId, 'salesforce_refresh_token', token.refresh_token || '', 'sources');
      await saveCompanySetting(req.companyId, 'salesforce_instance_url', token.instance_url || '', 'sources');
      let orgLabel = 'Connected';
      try {
        const idResponse = await fetch(token.id, { headers: { Authorization: `Bearer ${token.access_token}` } });
        const idData = await idResponse.json();
        orgLabel = idData.display_name || idData.username || orgLabel;
      } catch { /* best-effort — connection still succeeds without a friendly label */ }
      await saveCompanySetting(req.companyId, 'salesforce_connected_org', orgLabel, 'sources');
      const existingSfIntegration = await one('SELECT id FROM integrations WHERE company_id=? AND slug=? LIMIT 1', [req.companyId, 'salesforce']);
      const sfConfigJson = JSON.stringify({ name: orgLabel });
      if (existingSfIntegration) {
        await run("UPDATE integrations SET is_active=1, config=?, updated_at=NOW() WHERE id=?", [sfConfigJson, existingSfIntegration.id]);
      } else {
        await run('INSERT INTO integrations (company_id,name,slug,type,is_active,config) VALUES (?,?,?,?,1,?)', [req.companyId, 'Salesforce', 'salesforce', 'crm', sfConfigJson]);
      }
    } else if (provider === 'linkedin') {
      const body = new URLSearchParams({
        grant_type: 'authorization_code', code,
        client_id: await getSetting('linkedin_oauth_client_id', '', req.companyId),
        client_secret: await getSetting('linkedin_oauth_client_secret', '', req.companyId),
        redirect_uri: `${config.appUrl}/oauth/linkedin/callback`,
      });
      const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', { method: 'POST', body });
      const token = await response.json();
      if (!token.access_token) throw new Error(token.error_description || 'LinkedIn token exchange failed.');
      await saveCompanySetting(req.companyId, 'linkedin_access_token', token.access_token, 'sources');
      await saveCompanySetting(req.companyId, 'linkedin_refresh_token', token.refresh_token || '', 'sources');
      await saveCompanySetting(req.companyId, 'linkedin_token_expires_at', String(Date.now() + Number(token.expires_in || 3600) * 1000), 'sources');
      let personLabel = 'Connected';
      try {
        const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` } });
        const profile = await profileResponse.json();
        personLabel = profile.name || profile.email || personLabel;
      } catch { /* best-effort — connection still succeeds without a friendly label */ }
      await saveCompanySetting(req.companyId, 'linkedin_connected_account', personLabel, 'sources');
    }
    res.redirect(`/settings/integrations?oauth=connected&provider=${encodeURIComponent(provider)}`);
  } catch (error) {
    res.redirect(`/settings/integrations?oauth=${encodeURIComponent(error.message)}&provider=${encodeURIComponent(provider)}`);
  }
}

export async function oauthRevoke(req, res) {
  if (req.params.provider === 'google_sheets') {
    const { disconnectGoogleSheets } = await import('../services/googleSheets.service.js');
    await disconnectGoogleSheets(req.companyId);
    return ok(res, null, 'google_sheets disconnected.');
  }
  if (req.params.provider === 'salesforce') {
    const { disconnectSalesforce } = await import('../services/salesforce.service.js');
    await disconnectSalesforce(req.companyId);
    return ok(res, null, 'salesforce disconnected.');
  }
  if (req.params.provider === 'linkedin') {
    const { disconnectLinkedin } = await import('../services/linkedin.service.js');
    await disconnectLinkedin(req.companyId);
    return ok(res, null, 'linkedin disconnected.');
  }
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
