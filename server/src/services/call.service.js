import twilio from 'twilio';
import { one, run } from '../db/pool.js';
import { config } from '../config/index.js';
import { getSetting } from './settings.service.js';
import { normalizeMobile, insertLead, pickLeastLoadedAgent } from './lead.service.js';

const VoiceResponse = twilio.twiml.VoiceResponse;
const { AccessToken } = twilio.jwt;
const { VoiceGrant } = AccessToken;

// A company-wide Twilio credential set (not a named-account thing like the
// per-sender WhatsApp integration_accounts — a company only has one voice
// number) stored via the same company_settings key/value pattern Anantya's
// WhatsApp API key uses (settings.service.js). twilio_auth_token auto-encrypts
// (matches isSensitive()'s _token suffix); account_sid/phone_number don't need
// to, and phone_number specifically must stay plaintext so
// resolveCompanyByTwilioNumber() can match it with a plain SQL query.
export async function getTwilioConfig(companyId) {
  const accountSid = await getSetting('twilio_account_sid', '', companyId);
  const authToken  = await getSetting('twilio_auth_token', '', companyId);
  const fromNumber = await getSetting('twilio_phone_number', '', companyId);
  if (!accountSid || !authToken || !fromNumber) return null;
  return { client: twilio(accountSid, authToken), authToken, fromNumber };
}

// Calls happen entirely in the browser (Twilio Voice SDK / WebRTC) — this
// mints the short-lived Access Token each agent's Device registers with.
// Requires two Twilio credentials beyond the REST ones above: an API Key
// (Console → Account → API keys, NOT the Account SID/Auth Token) and a TwiML
// Application (Console → Voice → TwiML Apps) whose Voice Request URL points
// at the browser-outbound webhook below. Returns null if any piece is missing
// — callers treat that as "voice calling isn't set up for this company yet"
// and just don't register a Device, no error shown.
export async function getVoiceAccessToken(companyId, user) {
  const accountSid    = await getSetting('twilio_account_sid', '', companyId);
  const apiKeySid      = await getSetting('twilio_api_key_sid', '', companyId);
  const apiKeySecret   = await getSetting('twilio_api_key_secret', '', companyId);
  const twimlAppSid    = await getSetting('twilio_twiml_app_sid', '', companyId);
  if (!accountSid || !apiKeySid || !apiKeySecret || !twimlAppSid) return null;

  const identity = `agent_${user.id}`;
  const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, { identity, ttl: 3600 });
  token.addGrant(new VoiceGrant({ incomingAllow: true, outgoingApplicationSid: twimlAppSid }));
  return { token: token.toJwt(), identity };
}

// Gates every /webhook/twilio/voice/* endpoint against Twilio's request
// signature. If the company's auth token isn't resolvable yet (e.g. the
// inbound-call webhook for a number that was never actually configured),
// there's nothing to validate against — let it through so the caller still
// gets a clean "not configured" TwiML response instead of a raw 403.
export function validateTwilioSignature(req, authToken) {
  if (!authToken) return true;
  const signature = req.get('X-Twilio-Signature') || '';
  const url = `${config.appUrl}${req.originalUrl}`;
  return twilio.validateRequest(authToken, signature, url, req.body || {});
}

async function logTwilioWebhook(event, payload, status) {
  return run('INSERT INTO webhook_logs (source,event,payload,status) VALUES (?,?,?,?)', [
    'twilio', event || null, JSON.stringify(payload || {}), status
  ]);
}

const DIAL_STATUS_MAP = { completed: 'completed', busy: 'busy', 'no-answer': 'no_answer', failed: 'failed', canceled: 'canceled' };

// Recording is a company-level opt-in (Settings → Channels → Voice) — off by
// default, since consent requirements vary by jurisdiction and this is the
// company's call to make, not ours. Applies identically to outbound
// (browser->lead) and inbound (lead->browser) dials.
async function recordingAttrs(companyId, commId) {
  const enabled = (await getSetting('twilio_record_calls', '0', companyId)) === '1';
  if (!enabled) return {};
  return {
    record: 'record-from-answer-dual',
    recordingStatusCallback: `${config.appUrl}/webhook/twilio/voice/recording-status/${commId}`,
    recordingStatusCallbackMethod: 'POST',
  };
}

// ── Outbound: agent clicks "Call" on a lead ──────────────────────────────
// Just validates and logs a queued row — the browser places the actual call
// via the Voice SDK's Device.connect(), which is what triggers
// buildBrowserOutboundTwiml() below.
export async function initiateOutboundCall(leadId, companyId, agentUser) {
  const twilioCfg = await getTwilioConfig(companyId);
  if (!twilioCfg) return { delivered: false, comm_id: null, error: 'twilio_not_configured' };

  const lead = await one('SELECT id, mobile FROM leads WHERE id=? AND company_id=? LIMIT 1', [leadId, companyId]);
  if (!lead) return { delivered: false, comm_id: null, error: 'lead_not_found' };

  const leadMobile = normalizeMobile(lead.mobile);
  if (!lead.mobile || !leadMobile.valid) return { delivered: false, comm_id: null, error: 'lead_mobile_invalid' };

  const insert = await run(
    `INSERT INTO communications (lead_id, channel, to_address, status, provider, direction, agent_user_id)
     VALUES (?, 'call', ?, 'queued', 'twilio', 'outbound', ?)`,
    [lead.id, leadMobile.value, agentUser.id]
  );
  return { delivered: true, comm_id: Number(insert.insertId), error: null };
}

// TwiML the Voice SDK's Device.connect() lands on (via the company's TwiML
// Application) — dials the lead directly from the browser, no intermediate leg.
export async function buildBrowserOutboundTwiml(commId, companyId) {
  const twiml = new VoiceResponse();
  const comm = await one(
    "SELECT c.id, c.to_address, l.company_id FROM communications c JOIN leads l ON l.id=c.lead_id WHERE c.id=? AND c.status='queued' LIMIT 1",
    [commId]
  );
  if (!comm || !comm.to_address || Number(comm.company_id) !== Number(companyId)) {
    twiml.say('This call could not be connected.');
    twiml.hangup();
    return twiml.toString();
  }
  const twilioCfg = await getTwilioConfig(comm.company_id);
  const dial = twiml.dial({
    callerId: twilioCfg?.fromNumber,
    action: `${config.appUrl}/webhook/twilio/voice/dial-status/${commId}`,
    method: 'POST',
    timeout: 25,
    ...(await recordingAttrs(comm.company_id, commId)),
  });
  dial.number(comm.to_address);
  return twiml.toString();
}

let _inboundCallSourceId = null;
async function ensureInboundCallLeadSourceId() {
  if (_inboundCallSourceId) return _inboundCallSourceId;
  const existing = await one("SELECT id FROM lead_sources WHERE slug='phone_inbound' LIMIT 1");
  if (existing) { _inboundCallSourceId = Number(existing.id); return _inboundCallSourceId; }
  const result = await run("INSERT INTO lead_sources (name,slug,category) VALUES ('Inbound Call','phone_inbound','external')");
  _inboundCallSourceId = Number(result.insertId);
  return _inboundCallSourceId;
}

// ── Inbound: someone dialed the company's Twilio number ─────────────────
// Matches the caller to a lead by mobile (auto-creating a minimal one if none
// exists yet, same pattern as WhatsApp's recordInboundMessage()), rings
// whichever agent that lead is assigned to, in THEIR BROWSER (<Dial><Client>,
// not a phone number) — round-robins + persists the assignment if nobody is,
// mirroring the drip engine's Assign Agent step. If that agent's browser
// isn't registered (CRM tab not open), the Dial just times out into
// no-answer, same as it would for an unreachable phone number.
export async function buildInboundRouteTwiml(companyId, fromNumber, toNumber) {
  const twiml = new VoiceResponse();
  const mobile = normalizeMobile(fromNumber).value;

  let lead = mobile ? await one('SELECT * FROM leads WHERE company_id=? AND mobile=? LIMIT 1', [companyId, mobile]) : null;
  if (!lead && mobile) {
    const sourceId = await ensureInboundCallLeadSourceId();
    const leadId = await insertLead({ company_id: companyId, name: mobile, mobile, source_id: sourceId, status: 'new' });
    lead = await one('SELECT * FROM leads WHERE id=? LIMIT 1', [leadId]);
  }
  if (!lead) {
    twiml.say('Sorry, we could not process your call.');
    twiml.hangup();
    return { twiml: twiml.toString(), commId: null };
  }

  let agentId = lead.assigned_to;
  if (!agentId) {
    agentId = await pickLeastLoadedAgent(companyId);
    if (agentId) await run('UPDATE leads SET assigned_to=? WHERE id=?', [agentId, lead.id]);
  }

  const insert = await run(
    `INSERT INTO communications (lead_id, channel, to_address, status, provider, direction, agent_user_id)
     VALUES (?, 'call', ?, 'ringing', 'twilio', 'inbound', ?)`,
    [lead.id, mobile, agentId || null]
  );
  const commId = Number(insert.insertId);

  if (!agentId) {
    twiml.say('Thanks for calling. No agent is currently available. Please try again later.');
    twiml.hangup();
    await run("UPDATE communications SET status='no_answer' WHERE id=?", [commId]);
    return { twiml: twiml.toString(), commId };
  }

  const dial = twiml.dial({
    callerId: toNumber,
    action: `${config.appUrl}/webhook/twilio/voice/dial-status/${commId}`,
    method: 'POST',
    timeout: 20,
    ...(await recordingAttrs(companyId, commId)),
  });
  const clientNode = dial.client(`agent_${agentId}`);
  clientNode.parameter({ name: 'leadId', value: String(lead.id) });
  clientNode.parameter({ name: 'leadName', value: lead.name || '' });
  return { twiml: twiml.toString(), commId };
}

// <Dial action> callback — the human<->human leg ended (both directions).
export async function recordDialOutcome(commId, fields) {
  if (!commId) return;
  const status = DIAL_STATUS_MAP[fields.DialCallStatus] || 'completed';
  const duration = fields.DialCallDuration != null ? Number(fields.DialCallDuration) : null;
  await run(
    'UPDATE communications SET status=?, duration_seconds=? WHERE id=?',
    [status, duration, commId]
  );
}

// Fires asynchronously once a recording finishes processing (recordingStatusCallback) —
// separate from and later than the <Dial action> callback above.
export async function recordRecordingStatus(commId, fields) {
  if (!commId || !fields.RecordingUrl) return;
  await run('UPDATE communications SET recording_url=? WHERE id=?', [fields.RecordingUrl, commId]);
}

export { logTwilioWebhook };
