import bcrypt from 'bcryptjs';
import { one, q, run, updateById } from '../db/pool.js';
import { ok, fail } from '../utils/response.js';
import { boolInt } from '../utils/helpers.js';
import { getSetting, saveSetting } from '../services/settings.service.js';

export async function getSettings(_req, res) {
  const rows = await q('SELECT `key`,`value`,`group` FROM settings ORDER BY `group`,`key`');
  ok(res, { settings: Object.fromEntries(rows.map((row) => [row.key, row.value])), rows });
}

export async function saveSettings(req, res) {
  const allowed = [
    'app_name','timezone','currency','smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from','smtp_from_name',
    'sendgrid_key','mailgun_key','mailgun_domain','ses_key','ses_secret','ses_region','wa_api_token','wa_phone_id',
    'sms_provider','sms_api_key','sms_sender','rcs_api_key','score_email_open','score_email_click','score_wa_read',
    'score_wa_reply','score_website_visit','score_meeting_booked','score_quotation_requested','score_purchase_completed','ai_enabled'
  ];
  for (const key of allowed) {
    if (req.body[key] !== undefined) await saveSetting(key, req.body[key], 'general');
  }
  ok(res, null, 'Settings saved.');
}

export async function getUsers(_req, res) {
  const users = await q('SELECT id,name,email,role,is_active,last_login_at,created_at FROM users ORDER BY created_at DESC');
  ok(res, { users });
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
  ok(res, { id: result.insertId }, `User ${name} created.`);
}

export async function updateUser(req, res) {
  const data = {};
  if (req.body.name) data.name = String(req.body.name).trim();
  if (req.body.role) data.role = req.body.role;
  if (req.body.is_active !== undefined) data.is_active = boolInt(req.body.is_active);
  if (req.body.password && String(req.body.password).length >= 8) data.password = await bcrypt.hash(String(req.body.password), 12);
  await updateById('users', Number(req.params.id), data);
  ok(res, null, 'User updated.');
}

export async function getIntegrations(_req, res) {
  const [integrations, settingsRows] = await Promise.all([
    q('SELECT * FROM integrations ORDER BY type,name'),
    q("SELECT `key`,`value` FROM settings WHERE `group` IN ('email','whatsapp','sms','rcs','general','sources')")
  ]);
  ok(res, { integrations, settings: Object.fromEntries(settingsRows.map((row) => [row.key, row.value])) });
}

export async function saveIntegrations(req, res) {
  const groupMap = {
    email_provider: 'email', smtp_host: 'email', smtp_port: 'email', smtp_user: 'email', smtp_pass: 'email',
    smtp_from: 'email', smtp_from_name: 'email', sendgrid_key: 'email', mailgun_key: 'email', mailgun_domain: 'email',
    ses_key: 'email', ses_secret: 'email', ses_region: 'email', gmail_oauth_client_id: 'email', gmail_oauth_client_secret: 'email',
    outlook_oauth_client_id: 'email', outlook_oauth_client_secret: 'email', outlook_oauth_tenant: 'email',
    wa_provider: 'whatsapp', wa_meta_token: 'whatsapp', wa_meta_phone_id: 'whatsapp', wa_gupshup_api_key: 'whatsapp',
    wa_gupshup_src_number: 'whatsapp', wa_gupshup_app_name: 'whatsapp', wa_anantya_api_key: 'whatsapp',
    wa_anantya_api_user: 'whatsapp', wa_anantya_waba_id: 'whatsapp', sms_provider: 'sms', sms_api_key: 'sms',
    sms_sender: 'sms', rcs_api_key: 'rcs', indiamart_key: 'sources', tradeindia_key: 'sources',
    tradeindia_user_id: 'sources', meta_ads_token: 'sources', meta_app_secret: 'sources', google_ads_token: 'sources',
    google_ads_customer_id: 'sources', linkedin_token: 'sources', linkedin_org_urn: 'sources', justdial_key: 'sources', justdial_login: 'sources'
  };
  for (const [key, group] of Object.entries(groupMap)) {
    if (req.body[key] !== undefined) await saveSetting(key, req.body[key], group);
  }
  ok(res, null, 'Integrations saved.');
}

export async function getSources(_req, res) {
  const sources = await q(
    `SELECT ls.*, COUNT(l.id) AS lead_count FROM lead_sources ls LEFT JOIN leads l ON l.source_id=ls.id
     GROUP BY ls.id ORDER BY ls.category, ls.name`
  );
  ok(res, { sources });
}

export async function getPipelineStages(_req, res) {
  ok(res, { stages: await q('SELECT * FROM pipeline_stages ORDER BY stage_order ASC') });
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
