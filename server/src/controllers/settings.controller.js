import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { one, q, run, scalar, updateById } from '../db/pool.js';
import { ok, fail } from '../utils/response.js';
import { boolInt } from '../utils/helpers.js';
import { companySettings, saveCompanySetting, getSetting } from '../services/settings.service.js';
import { sendSms } from '../services/sms.service.js';
import { encryptValue, decryptValue } from '../utils/crypto.js';
import { config } from '../config/index.js';
import crypto from 'crypto';

function parseAccountConfig(account) {
  const raw = account?.config ? decryptValue(account.config) : null;
  if (!raw) return {};
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return {}; }
}

export async function getSettings(req, res) {
  const result = await companySettings(req.companyId);
  ok(res, { settings: result.values, rows: result.rows });
}

export async function saveSettings(req, res) {
  const allowed = [
    'app_name','timezone','currency','smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from','smtp_from_name',
    'imap_host','imap_port','imap_user','imap_pass','imap_secure',
    'sendgrid_key','mailgun_key','mailgun_domain','ses_key','ses_secret','ses_region','wa_api_token','wa_phone_id',
    'sms_provider','sms_mshastra_url','sms_mshastra_user','sms_mshastra_pwd','sms_mshastra_sender','sms_mshastra_country',
    'sms_api_key','sms_api_url','sms_sender','rcs_api_key','score_email_open','score_email_click','score_wa_read',
    'score_wa_reply','score_website_visit','score_meeting_booked','score_quotation_requested','score_purchase_completed','ai_enabled','ai_api_url','ai_api_key','ai_model'
  ];
  const goalKeys = ['goal_monthly_revenue', 'goal_monthly_deals', 'goal_monthly_leads', 'goal_monthly_demos'];
  const billingKeys = ['billing_email_notifications', 'billing_auto_renew'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) await saveCompanySetting(req.companyId, key, req.body[key], 'general');
  }
  for (const key of goalKeys) {
    if (req.body[key] !== undefined) await saveCompanySetting(req.companyId, key, req.body[key], 'goals');
  }
  for (const key of billingKeys) {
    if (req.body[key] !== undefined) await saveCompanySetting(req.companyId, key, req.body[key], 'billing');
  }
  ok(res, null, 'Settings saved.');
}

export async function getUsers(req, res) {
  const users = await q(
    `SELECT u.id,u.name,u.email,u.role,u.status,u.is_active,u.last_login_at,u.created_at, cu.role AS company_role
     FROM users u JOIN company_users cu ON cu.user_id=u.id
     WHERE cu.company_id=? ORDER BY u.created_at DESC`,
    [req.companyId]
  );
  ok(res, { users });
}

export async function inviteUser(req, res) {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const role = ['agent', 'manager', 'admin'].includes(req.body.role) ? req.body.role : 'agent';
  if (!name || !email) return fail(res, 'Name and email are required.', 422);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 'Invalid email address.', 422);
  const existing = await one('SELECT id FROM users WHERE email=? LIMIT 1', [email]);

  let userId;
  if (existing) {
    const memberships = await q('SELECT company_id FROM company_users WHERE user_id=?', [existing.id]);
    const alreadyMember = memberships.some((m) => Number(m.company_id) === Number(req.companyId));
    if (alreadyMember) return fail(res, 'This user is already a member of your company.', 422);

    // Each company is an independent tenant/client — the same login must never
    // be able to see two companies' data via the switcher. If this email is
    // still an active member of ANY other company, block instead of merging.
    if (memberships.length > 0) {
      return fail(res, 'This email already has an active account in another company. Remove them from that company first, or invite a different email.', 422);
    }

    // Email exists but has zero active company memberships anywhere (fully
    // removed elsewhere) — safe to recycle as a brand new, independent
    // identity: reset their name and send a fresh password-setup invite,
    // same as a first-time invite, rather than reusing their old password.
    userId = existing.id;
    await run("UPDATE users SET name=?, status='invited' WHERE id=?", [name, userId]);
  } else {
    const placeholderHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
    const result = await run(
      "INSERT INTO users (name,email,password,role,status) VALUES (?,?,?,?,'invited')",
      [name, email, placeholderHash, role]
    );
    userId = result.insertId;
  }
  await run('INSERT INTO company_users (company_id,user_id,role) VALUES (?,?,?)', [req.companyId, userId, role]);

  const token = crypto.randomBytes(32).toString('hex');
  await run('INSERT INTO password_resets (email,token,expires_at) VALUES (?,?,DATE_ADD(NOW(), INTERVAL 7 DAY))', [email, token]);
  const inviteUrl = `${config.appUrl}/reset-password/${token}`;

  let emailSent = false;
  try {
    const smtpHost = await getSetting('smtp_host', '', req.companyId);
    if (smtpHost) {
      const smtpPort = await getSetting('smtp_port', '587', req.companyId);
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(smtpPort),
        secure: smtpPort === '465',
        auth: { user: await getSetting('smtp_user', '', req.companyId), pass: await getSetting('smtp_pass', '', req.companyId) }
      });
      const from = await getSetting('smtp_from', await getSetting('smtp_user', '', req.companyId), req.companyId);
      const fromName = await getSetting('smtp_from_name', 'Dot Domino CRM', req.companyId);
      await transporter.sendMail({
        from: `${fromName} <${from}>`,
        to: email,
        subject: `You've been invited to ${fromName}`,
        html: `<p>Hi ${name},</p><p>You've been invited to join ${fromName} on Dot Domino CRM as ${role}.</p><p><a href="${inviteUrl}">Set your password to get started</a></p><p>This link expires in 7 days.</p>`
      });
      emailSent = true;
    }
  } catch (error) {
    console.error('[invite] email send failed:', error.message);
  }

  ok(res, { id: userId, invite_url: config.env === 'development' ? inviteUrl : undefined, email_sent: emailSent }, emailSent ? `Invite sent to ${email}.` : `User created — configure SMTP under Channels to email invites automatically.`);
}

export async function createUser(req, res) {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const role = req.body.role || 'agent';
  if (!name || !email || !password) return fail(res, 'Name, email and password are required.', 422);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, 'Invalid email address.', 422);
  const exists = await one('SELECT id FROM users WHERE email=? LIMIT 1', [email]);
  if (exists) return fail(res, 'Email already exists.', 422);
  const hashed = await bcrypt.hash(password, 12);
  const result = await run('INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)', [name, email, hashed, role]);
  await run('INSERT INTO company_users (company_id,user_id,role) VALUES (?,?,?)', [req.companyId, result.insertId, role === 'admin' ? 'admin' : role === 'manager' ? 'manager' : 'agent']);
  ok(res, { id: result.insertId }, `User ${name} created.`);
}

export async function updateUser(req, res) {
  const userId = Number(req.params.id);
  const member = await one('SELECT user_id FROM company_users WHERE company_id=? AND user_id=? LIMIT 1', [req.companyId, userId]);
  if (!member) return fail(res, 'User not found.', 404);

  const data = {};
  if (req.body.name) data.name = String(req.body.name).trim();
  if (req.body.role) data.role = req.body.role;
  if (req.body.is_active !== undefined) data.is_active = boolInt(req.body.is_active);
  if (req.body.password && String(req.body.password).length >= 8) data.password = await bcrypt.hash(String(req.body.password), 12);
  await updateById('users', userId, data);
  if (req.body.role) await run('UPDATE company_users SET role=? WHERE company_id=? AND user_id=?', [req.body.role, req.companyId, userId]);
  ok(res, null, 'User updated.');
}

export async function getIntegrations(req, res) {
  const { ensureWebhookKey } = await import('../services/settings.service.js');
  // Generated lazily (once) so the webhook URL these Lead Sources API cards
  // display is always ready to copy, the same way it always was before these
  // sources had any real per-company routing key.
  await Promise.all([
    ensureWebhookKey(req.companyId, 'indiamart_webhook_key'),
    ensureWebhookKey(req.companyId, 'tradeindia_webhook_key'),
    ensureWebhookKey(req.companyId, 'meta_webhook_key'),
    ensureWebhookKey(req.companyId, 'google_ads_webhook_key'),
    ensureWebhookKey(req.companyId, 'justdial_webhook_key'),
    ensureWebhookKey(req.companyId, 'bombora_webhook_key'),
    ensureWebhookKey(req.companyId, 'g2_intent_webhook_key'),
  ]);
  const [integrations, settingsRows] = await Promise.all([
    q('SELECT * FROM integrations WHERE company_id=? ORDER BY type,name', [req.companyId]),
    companySettings(req.companyId, ['email','whatsapp','sms','rcs','voice','general','sources'])
  ]);
  ok(res, { integrations, settings: settingsRows.values });
}

export async function saveIntegrations(req, res) {
  const groupMap = {
    email_provider: 'email', smtp_host: 'email', smtp_port: 'email', smtp_user: 'email', smtp_pass: 'email',
    smtp_from: 'email', smtp_from_name: 'email', sendgrid_key: 'email', mailgun_key: 'email', mailgun_domain: 'email',
    imap_host: 'email', imap_port: 'email', imap_user: 'email', imap_pass: 'email', imap_secure: 'email',
    ses_key: 'email', ses_secret: 'email', ses_region: 'email', gmail_oauth_client_id: 'email', gmail_oauth_client_secret: 'email',
    outlook_oauth_client_id: 'email', outlook_oauth_client_secret: 'email', outlook_oauth_tenant: 'email',
    wa_provider: 'whatsapp', wa_meta_token: 'whatsapp', wa_meta_phone_id: 'whatsapp', wa_gupshup_api_key: 'whatsapp',
    wa_gupshup_src_number: 'whatsapp', wa_gupshup_app_name: 'whatsapp', wa_anantya_api_key: 'whatsapp',
    wa_anantya_api_user: 'whatsapp', wa_anantya_waba_id: 'whatsapp',
    sms_provider: 'sms', sms_mshastra_url: 'sms', sms_mshastra_user: 'sms', sms_mshastra_pwd: 'sms', sms_mshastra_sender: 'sms', sms_mshastra_country: 'sms',
    sms_api_key: 'sms', sms_api_url: 'sms', sms_sender: 'sms',
    rcs_api_key: 'rcs',
    twilio_account_sid: 'voice', twilio_auth_token: 'voice', twilio_phone_number: 'voice',
    twilio_api_key_sid: 'voice', twilio_api_key_secret: 'voice', twilio_twiml_app_sid: 'voice', twilio_record_calls: 'voice',
    twilio_inbound_enabled: 'voice', twilio_fallback_voice_url: 'voice',
    indiamart_key: 'sources', tradeindia_key: 'sources',
    tradeindia_user: 'sources', meta_ads_token: 'sources', meta_ads_secret: 'sources', meta_verify_token: 'sources',
    google_ads_webhook_secret: 'sources', linkedin_oauth_client_id: 'sources', linkedin_oauth_client_secret: 'sources',
    linkedin_org_urn: 'sources', justdial_api_key: 'sources', justdial_login: 'sources', ai_api_url: 'ai', ai_api_key: 'ai',
    google_sheets_oauth_client_id: 'sources', google_sheets_oauth_client_secret: 'sources', google_sheets_id: 'sources', google_sheets_range: 'sources',
    shopify_shop_domain: 'sources', shopify_admin_token: 'sources', shopify_api_secret: 'sources', shopify_webhook_base_url: 'sources',
    hubspot_access_token: 'sources', hubspot_webhook_secret: 'sources', hubspot_webhook_base_url: 'sources',
    salesforce_oauth_client_id: 'sources', salesforce_oauth_client_secret: 'sources', salesforce_login_url: 'sources',
    mailchimp_api_key: 'sources', mailchimp_list_id: 'sources', mailchimp_webhook_base_url: 'sources',
    zendesk_subdomain: 'sources', zendesk_email: 'sources', zendesk_api_token: 'sources', zendesk_webhook_base_url: 'sources',
    bombora_api_key: 'sources', g2_intent_api_key: 'sources', apollo_api_key: 'sources', lusha_api_key: 'sources', zoominfo_api_key: 'sources'
  };
  for (const [key, group] of Object.entries(groupMap)) {
    if (req.body[key] !== undefined) await saveCompanySetting(req.companyId, key, req.body[key], group);
  }
  ok(res, null, 'Integrations saved.');
}

const LEAD_SOURCE_SYNC = {
  indiamart: async (companyId, req) => (await import('../services/indiamart.service.js')).syncIndiamartLeads(companyId, req),
  tradeindia: async (companyId, req) => (await import('../services/tradeindia.service.js')).syncTradeindiaLeads(companyId, req),
  linkedin: async (companyId, req) => (await import('../services/linkedin.service.js')).syncLinkedinLeads(companyId, req),
  justdial: async (companyId, req) => (await import('../services/justdial.service.js')).syncJustdialLeads(companyId, req),
  apollo: async (companyId, req) => (await import('../services/apollo.service.js')).syncApolloLeads(companyId, req),
  lusha: async (companyId, req) => (await import('../services/lusha.service.js')).syncLushaLeads(companyId, req),
  zoominfo: async (companyId, req) => (await import('../services/zoominfo.service.js')).syncZoominfoLeads(companyId, req),
};

// Bombora/G2 Intent don't produce leads at all (see their services) — they
// create Tasks from account-level intent signals, so they get their own
// response shape/message instead of "N new lead(s)".
const INTENT_SOURCE_SYNC = {
  bombora: async (companyId) => (await import('../services/bombora.service.js')).syncBomboraSignals(companyId),
  g2_intent: async (companyId) => (await import('../services/g2intent.service.js')).syncG2IntentSignals(companyId),
};

// Separate from thirdPartyApps.controller.js's connect/sync/disconnect (that
// controller is scoped to the Third Party Apps catalog/page) — these Lead
// Sources API cards never had a Connect/Disconnect concept, just credential
// fields plus a webhook URL, so a lighter dedicated sync-only endpoint fits
// better than bolting them onto the other catalog.
export async function syncLeadSource(req, res) {
  const intentHandler = INTENT_SOURCE_SYNC[req.params.slug];
  if (intentHandler) {
    try {
      const result = await intentHandler(req.companyId);
      return ok(res, result, `Created ${result.created} task(s) from ${result.total} intent signal(s).`);
    } catch (err) {
      return fail(res, err.message, 422);
    }
  }
  const handler = LEAD_SOURCE_SYNC[req.params.slug];
  if (!handler) return fail(res, 'Unknown or webhook-only lead source.', 404);
  try {
    const summary = await handler(req.companyId, req);
    ok(res, summary, `Synced ${summary.imported} new lead(s).`);
  } catch (err) {
    fail(res, err.message, 422);
  }
}

export async function channelMetrics(req, res) {
  const channel = ['email', 'whatsapp', 'sms', 'rcs', 'call'].includes(req.query.channel) ? req.query.channel : 'email';
  const row = await one(
    `SELECT COUNT(*) AS sent,
            SUM(cm.status IN ('delivered','opened','clicked','replied')) AS delivered,
            SUM(cm.status IN ('opened','clicked','replied')) AS opened,
            SUM(cm.status='clicked') AS clicked
     FROM communications cm JOIN leads l ON l.id=cm.lead_id
     WHERE l.company_id=? AND cm.channel=?`,
    [req.companyId, channel]
  );
  const sent = Number(row?.sent || 0);
  const delivered = Number(row?.delivered || 0);
  const opened = Number(row?.opened || 0);
  const clicked = Number(row?.clicked || 0);
  const pct = (part, total) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);
  ok(res, {
    sent, delivered,
    delivery_rate: pct(delivered, sent),
    open_rate: pct(opened, sent),
    click_rate: pct(clicked, sent),
  });
}

export async function integrationAccounts(req, res) {
  const accounts = await q(
    'SELECT id,name,provider,channel,external_account_id,webhook_key,is_active,daily_send_limit,sent_today,sent_today_date,created_at,updated_at FROM integration_accounts WHERE company_id=? ORDER BY provider,name',
    [req.companyId]
  );
  ok(res, { accounts });
}

export async function saveIntegrationAccount(req, res) {
  const name = String(req.body.name || '').trim();
  const provider = String(req.body.provider || '').trim().toLowerCase();
  const channel = String(req.body.channel || 'other').trim();
  if (!name || !provider) return fail(res, 'Account name and provider are required.', 422);
  if (!['email','whatsapp','rcs','sms','lead_source','other'].includes(channel)) return fail(res, 'Invalid channel.', 422);
  const dailyLimit = req.body.daily_send_limit !== undefined && req.body.daily_send_limit !== ''
    ? Number(req.body.daily_send_limit) : null;
  const newConfig = req.body.config && typeof req.body.config === 'object' ? req.body.config : {};

  if (req.body.id) {
    const existing = await one('SELECT config FROM integration_accounts WHERE id=? AND company_id=? LIMIT 1', [Number(req.body.id), req.companyId]);
    if (!existing) return fail(res, 'Account not found.', 404);
    let existingConfig = {};
    try { existingConfig = existing.config ? JSON.parse(decryptValue(existing.config) || '{}') : {}; } catch { existingConfig = {}; }
    // Merge: blank/omitted fields (e.g. re-saving to just toggle pause, or leaving
    // the password field empty on edit) keep the previously stored value instead
    // of wiping it out.
    const merged = { ...existingConfig };
    for (const [k, v] of Object.entries(newConfig)) {
      if (v !== '' && v != null) merged[k] = v;
    }
    const config = Object.keys(merged).length ? encryptValue(JSON.stringify(merged)) : null;
    await run(
      'UPDATE integration_accounts SET name=?,provider=?,channel=?,external_account_id=?,webhook_secret=?,config=?,is_active=?,daily_send_limit=? WHERE id=? AND company_id=?',
      [name, provider, channel, req.body.external_account_id || null, req.body.webhook_secret || null, config, boolInt(req.body.is_active ?? true), dailyLimit, Number(req.body.id), req.companyId]
    );
    return ok(res, { id: Number(req.body.id) }, 'Integration account updated.');
  }
  const config = Object.keys(newConfig).length ? encryptValue(JSON.stringify(newConfig)) : null;
  const webhookKey = crypto.randomBytes(24).toString('hex');
  const result = await run(
    'INSERT INTO integration_accounts (company_id,name,provider,channel,external_account_id,webhook_key,webhook_secret,config,is_active,daily_send_limit) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [req.companyId, name, provider, channel, req.body.external_account_id || null, webhookKey, req.body.webhook_secret || null, config, boolInt(req.body.is_active ?? true), dailyLimit]
  );
  ok(res, { id: result.insertId, webhook_key: webhookKey }, 'Integration account created.');
}

export async function deleteIntegrationAccount(req, res) {
  await run('DELETE FROM integration_accounts WHERE id=? AND company_id=?', [Number(req.params.id), req.companyId]);
  ok(res, null, 'Integration account deleted.');
}

export async function getSources(req, res) {
  const [sources, accounts] = await Promise.all([
    q(
      `SELECT ls.*, COUNT(l.id) AS lead_count,
              SUM(MONTH(l.created_at)=MONTH(NOW()) AND YEAR(l.created_at)=YEAR(NOW())) AS leads_this_month,
              MAX(l.created_at) AS last_lead_at,
              SUM(NOT l.is_duplicate AND COALESCE(l.email_valid,1)=1 AND COALESCE(l.mobile_valid,1)=1) AS valid_count
       FROM lead_sources ls LEFT JOIN leads l ON l.source_id=ls.id AND l.company_id=?
       GROUP BY ls.id ORDER BY ls.category, ls.name`, [req.companyId]
    ),
    q("SELECT * FROM integration_accounts WHERE company_id=? AND channel='lead_source'", [req.companyId])
  ]);

  const byProvider = Object.fromEntries(accounts.map((a) => [a.provider, a]));
  for (const s of sources) {
    const leadCount = Number(s.lead_count || 0);
    const validCount = Number(s.valid_count || 0);
    s.success_rate = leadCount > 0 ? Math.round((validCount / leadCount) * 1000) / 10 : null;
    s.status = leadCount === 0 ? 'new' : s.success_rate >= 90 ? 'healthy' : s.success_rate >= 50 ? 'warning' : 'error';

    const account = byProvider[s.slug];
    const cfg = parseAccountConfig(account);
    s.integration_account_id = account?.id ?? null;
    s.webhook_key = account?.webhook_key ?? null;
    s.api_key = cfg.api_key || '';
  }
  ok(res, { sources });
}

export async function saveSourceConfig(req, res) {
  const source = await one('SELECT * FROM lead_sources WHERE id=? LIMIT 1', [Number(req.params.id)]);
  if (!source) return fail(res, 'Source not found.', 404);
  const apiKey = String(req.body.api_key || '');
  const existing = await one(
    "SELECT id FROM integration_accounts WHERE company_id=? AND provider=? AND channel='lead_source' LIMIT 1",
    [req.companyId, source.slug]
  );
  if (existing) {
    await run('UPDATE integration_accounts SET config=? WHERE id=?', [encryptValue(JSON.stringify({ api_key: apiKey })), existing.id]);
    return ok(res, { id: existing.id }, 'Source configured.');
  }
  const webhookKey = crypto.randomBytes(24).toString('hex');
  const result = await run(
    "INSERT INTO integration_accounts (company_id,name,provider,channel,webhook_key,config,is_active) VALUES (?,?,?,'lead_source',?,?,1)",
    [req.companyId, source.name, source.slug, webhookKey, encryptValue(JSON.stringify({ api_key: apiKey }))]
  );
  ok(res, { id: result.insertId }, 'Source configured.');
}

export async function testSourceConnection(req, res) {
  const source = await one('SELECT * FROM lead_sources WHERE id=? LIMIT 1', [Number(req.params.id)]);
  if (!source) return fail(res, 'Source not found.', 404);
  const account = await one(
    "SELECT * FROM integration_accounts WHERE company_id=? AND provider=? AND channel='lead_source' LIMIT 1",
    [req.companyId, source.slug]
  );
  const cfg = parseAccountConfig(account);
  if (!cfg.api_key) return fail(res, 'Add an API key before testing the connection.', 422);
  if (!account?.webhook_key) return fail(res, 'No webhook configured for this source yet.', 422);
  ok(res, { webhook_url: `/webhook/${source.slug}/${account.webhook_key}` }, 'Webhook endpoint is configured and reachable.');
}

export async function getPipelineStages(_req, res) {
  ok(res, { stages: await q('SELECT * FROM pipeline_stages ORDER BY stage_order ASC') });
}

export async function testSms(req, res) {
  const mobile = String(req.body.mobile || '').trim();
  if (!mobile) return fail(res, 'mobile number is required.', 422);

  const message = String(req.body.message || 'Test message from Dot Domino CRM').trim().slice(0, 1000);
  const result = await sendSms({ to: mobile, message, companyId: req.companyId });
  if (!result.success) {
    const status = ['mshastra_not_configured', 'sms_provider_not_configured', 'no_mobile', 'empty_sms_message'].includes(result.error) ? 422 : 502;
    return fail(res, `SMS error: ${result.error}`, status);
  }
  ok(res, { provider: result.provider, messageId: result.msgId, raw: result.raw }, 'Test SMS sent successfully.');
}

export async function savePipelineStages(req, res) {
  const stages = Array.isArray(req.body.stages) ? req.body.stages : [];
  for (const stage of stages) {
    if (stage.id) {
      await run('UPDATE pipeline_stages SET name=?,color=?,stage_order=? WHERE id=?', [
        stage.name || 'New Stage', stage.color || '#6c757d', Number(stage.stage_order || 99), Number(stage.id)
      ]);
    } else {
      await run('INSERT INTO pipeline_stages (name,color,stage_order) VALUES (?,?,?)', [
        stage.name || 'New Stage', stage.color || '#6c757d', Number(stage.stage_order || 99)
      ]);
    }
  }
  ok(res, null, 'Pipeline stages saved.');
}

export async function deletePipelineStage(req, res) {
  const id = Number(req.params.id);
  const stage = await one('SELECT id FROM pipeline_stages WHERE id=? LIMIT 1', [id]);
  if (!stage) return fail(res, 'Pipeline stage not found.', 404);
  // deals.stage_id / deal_stage_history.to_stage are ON DELETE RESTRICT — a stage
  // still holding deals must be emptied first, or the FK throws a raw DB error.
  const dealsInStage = await scalar('SELECT COUNT(*) FROM deals WHERE stage_id=?', [id]);
  if (Number(dealsInStage) > 0) {
    return fail(res, `Cannot delete — ${dealsInStage} deal(s) are still in this stage. Move them to another stage first.`, 409);
  }
  await run('DELETE FROM deal_stage_history WHERE from_stage=? OR to_stage=?', [id, id]);
  await run('DELETE FROM pipeline_stages WHERE id=?', [id]);
  ok(res, null, 'Pipeline stage deleted.');
}
