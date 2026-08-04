import twilio from 'twilio';
import { one, run } from '../db/pool.js';
import { config } from '../config/index.js';
import { getSetting } from './settings.service.js';
import { normalizeMobile, insertLead, pickLeastLoadedAgent } from './lead.service.js';

const VoiceResponse = twilio.twiml.VoiceResponse;

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
const PARENT_STATUS_MAP = { queued: 'queued', ringing: 'ringing', 'in-progress': 'in_progress', completed: 'completed', busy: 'busy', 'no-answer': 'no_answer', failed: 'failed', canceled: 'canceled' };

// ── Outbound: agent clicks "Call" on a lead ──────────────────────────────
// Twilio rings the agent's own phone first; buildOutboundConnectTwiml() below
// is what fires once they pick up, bridging to the lead.
export async function initiateOutboundCall(leadId, companyId, agentUser) {
  const twilioCfg = await getTwilioConfig(companyId);
  if (!twilioCfg) return { delivered: false, comm_id: null, error: 'twilio_not_configured' };

  const lead = await one('SELECT id, mobile FROM leads WHERE id=? AND company_id=? LIMIT 1', [leadId, companyId]);
  if (!lead) return { delivered: false, comm_id: null, error: 'lead_not_found' };

  const leadMobile = normalizeMobile(lead.mobile);
  if (!lead.mobile || !leadMobile.valid) return { delivered: false, comm_id: null, error: 'lead_mobile_invalid' };

  const agentPhone = normalizeMobile(agentUser.phone);
  if (!agentUser.phone) return { delivered: false, comm_id: null, error: 'agent_phone_not_set' };
  if (!agentPhone.valid) return { delivered: false, comm_id: null, error: 'agent_phone_invalid' };

  const insert = await run(
    `INSERT INTO communications (lead_id, channel, to_address, status, provider, direction, agent_user_id)
     VALUES (?, 'call', ?, 'queued', 'twilio', 'outbound', ?)`,
    [lead.id, leadMobile.value, agentUser.id]
  );
  const commId = Number(insert.insertId);

  try {
    const call = await twilioCfg.client.calls.create({
      to: agentPhone.value,
      from: twilioCfg.fromNumber,
      url: `${config.appUrl}/webhook/twilio/voice/outbound/${commId}`,
      statusCallback: `${config.appUrl}/webhook/twilio/voice/status/${commId}`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
    });
    await run("UPDATE communications SET status='ringing', provider_msg_id=? WHERE id=?", [call.sid, commId]);
    return { delivered: true, comm_id: commId, call_sid: call.sid, error: null };
  } catch (err) {
    await run("UPDATE communications SET status='failed', failed_reason=? WHERE id=?", [String(err.message || err).slice(0, 500), commId]);
    return { delivered: false, comm_id: commId, error: err.message || 'twilio_call_failed' };
  }
}

// TwiML Twilio requests once the agent's own phone answers — bridges to the lead.
export async function buildOutboundConnectTwiml(commId) {
  const comm = await one(
    'SELECT c.id, c.to_address, l.company_id FROM communications c JOIN leads l ON l.id=c.lead_id WHERE c.id=? LIMIT 1',
    [commId]
  );
  const twiml = new VoiceResponse();
  if (!comm || !comm.to_address) {
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
// whichever agent that lead is assigned to (or round-robins + persists the
// assignment if nobody is, mirroring the drip engine's Assign Agent step).
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
  const agent = agentId ? await one('SELECT id, phone FROM users WHERE id=? LIMIT 1', [agentId]) : null;
  const agentPhone = agent ? normalizeMobile(agent.phone) : { value: null, valid: false };

  const insert = await run(
    `INSERT INTO communications (lead_id, channel, to_address, status, provider, direction, agent_user_id)
     VALUES (?, 'call', ?, 'ringing', 'twilio', 'inbound', ?)`,
    [lead.id, mobile, agent?.id || null]
  );
  const commId = Number(insert.insertId);

  if (!agent || !agentPhone.valid) {
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
  });
  dial.number(agentPhone.value);
  return { twiml: twiml.toString(), commId };
}

// <Dial action> callback — the human<->human leg ended (both directions).
export async function recordDialOutcome(commId, fields) {
  if (!commId) return;
  const status = DIAL_STATUS_MAP[fields.DialCallStatus] || 'completed';
  const duration = fields.DialCallDuration != null ? Number(fields.DialCallDuration) : null;
  await run(
    'UPDATE communications SET status=?, duration_seconds=?, recording_url=COALESCE(?, recording_url) WHERE id=?',
    [status, duration, fields.RecordingUrl || null, commId]
  );
}

// Outer statusCallback on calls.create() — outbound only, catches the agent's
// own phone never being answered. Never overwrites a more specific outcome
// the dial-status callback (the actual agent<->lead leg) already recorded.
export async function recordParentCallStatus(commId, fields) {
  if (!commId) return;
  const status = PARENT_STATUS_MAP[fields.CallStatus];
  if (!status) return;
  await run(
    "UPDATE communications SET status=? WHERE id=? AND status IN ('queued','ringing','in_progress')",
    [status, commId]
  );
}

export { logTwilioWebhook };
