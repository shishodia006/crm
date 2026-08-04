import { one } from '../db/pool.js';
import { fail } from '../utils/response.js';
import { resolveCompanyByTwilioNumber, getSetting } from '../services/settings.service.js';
import {
  validateTwilioSignature, getTwilioConfig, buildOutboundConnectTwiml,
  buildInboundRouteTwiml, recordDialOutcome, recordParentCallStatus, logTwilioWebhook,
} from '../services/call.service.js';

// GET/POST /webhook/twilio/voice/outbound/:commId — Twilio requests this the
// instant the agent's own phone answers (see initiateOutboundCall()).
export async function outboundTwiml(req, res) {
  const commId = Number(req.params.commId);
  const comm = await one(
    'SELECT c.id, l.company_id FROM communications c JOIN leads l ON l.id=c.lead_id WHERE c.id=? LIMIT 1',
    [commId]
  );
  const twilioCfg = comm ? await getTwilioConfig(comm.company_id) : null;
  if (!validateTwilioSignature(req, twilioCfg?.authToken)) return fail(res, 'Invalid Twilio signature.', 403);
  const xml = await buildOutboundConnectTwiml(commId);
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

// POST /webhook/twilio/voice/status/:commId — outer statusCallback, outbound only.
export async function parentStatus(req, res) {
  const commId = Number(req.params.commId);
  await recordParentCallStatus(commId, req.body);
  await logTwilioWebhook(req.body?.CallStatus, req.body, 'processed');
  res.sendStatus(200);
}
