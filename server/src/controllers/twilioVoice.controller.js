import { one } from '../db/pool.js';
import { ok, fail } from '../utils/response.js';
import { resolveCompanyByTwilioNumber, getSetting } from '../services/settings.service.js';
import {
  validateTwilioSignature, getTwilioConfig, getVoiceAccessToken, buildBrowserOutboundTwiml,
  buildInboundRouteTwiml, recordDialOutcome, recordRecordingStatus, logTwilioWebhook,
} from '../services/call.service.js';

// GET /api/voice/token — authenticated. Each agent's browser calls this to
// register a Twilio Voice SDK Device. `configured:false` means this company
// hasn't set up Voice calling yet — the frontend just skips Device
// registration silently, no error shown.
export async function voiceToken(req, res) {
  const result = await getVoiceAccessToken(req.companyId, req.user);
  if (!result) return ok(res, { configured: false });
  ok(res, { configured: true, token: result.token, identity: result.identity });
}

// POST /webhook/twilio/voice/browser-outbound — Twilio's TwiML Application
// hits this the instant Device.connect() fires from the agent's browser.
export async function browserOutboundTwiml(req, res) {
  const commId = Number(req.body.commId);
  const comm = await one(
    'SELECT c.id, l.company_id FROM communications c JOIN leads l ON l.id=c.lead_id WHERE c.id=? LIMIT 1',
    [commId]
  );
  const twilioCfg = comm ? await getTwilioConfig(comm.company_id) : null;
  if (!validateTwilioSignature(req, twilioCfg?.authToken)) return fail(res, 'Invalid Twilio signature.', 403);
  const xml = comm ? await buildBrowserOutboundTwiml(commId, comm.company_id) : '<Response><Say>This call could not be connected.</Say><Hangup/></Response>';
  await logTwilioWebhook(req.body?.CallStatus, req.body, 'processed');
  res.type('text/xml').send(xml);
}

// POST /webhook/twilio/voice/inbound — the Twilio number's "A call comes in" webhook.
export async function inboundTwiml(req, res) {
  const toNumber = req.body.To;
  const companyId = await resolveCompanyByTwilioNumber(toNumber);
  const authToken = companyId ? await getSetting('twilio_auth_token', '', companyId) : '';
  if (!validateTwilioSignature(req, authToken)) return fail(res, 'Invalid Twilio signature.', 403);
  if (!companyId) {
    await logTwilioWebhook('inbound_unresolved', req.body, 'ignored');
    return res.type('text/xml').send('<Response><Say>This number is not configured.</Say><Hangup/></Response>');
  }
  const { twiml, commId } = await buildInboundRouteTwiml(companyId, req.body.From, toNumber);
  await logTwilioWebhook('inbound', { ...req.body, commId }, 'processed');
  res.type('text/xml').send(twiml);
}

// POST /webhook/twilio/voice/dial-status/:commId — <Dial action> callback, both directions.
export async function dialStatus(req, res) {
  const commId = Number(req.params.commId);
  await recordDialOutcome(commId, req.body);
  await logTwilioWebhook(req.body?.DialCallStatus, req.body, 'processed');
  res.type('text/xml').send('<Response></Response>');
}

// POST /webhook/twilio/voice/recording-status/:commId — fires once a recording
// finishes processing, asynchronously and later than dial-status.
export async function recordingStatus(req, res) {
  const commId = Number(req.params.commId);
  await recordRecordingStatus(commId, req.body);
  await logTwilioWebhook(req.body?.RecordingStatus, req.body, 'processed');
  res.sendStatus(200);
}
