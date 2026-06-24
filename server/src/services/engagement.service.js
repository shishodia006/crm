import crypto from 'crypto';
import { one, q, run } from '../db/pool.js';
import { addScoreEvent } from './score.service.js';

const EVENT_STATUS = {
  sent: 'sent', delivered: 'delivered', read: 'opened', opened: 'opened', clicked: 'clicked',
  replied: 'replied', reply: 'replied', failed: 'failed', bounced: 'bounced', undelivered: 'failed'
};
const EVENT_SCORE = { opened: 'email_open', clicked: 'email_click', read: 'wa_read', replied: 'wa_reply' };

export function replyTextFromPayload(payload = {}) {
  return String(
    payload?.text?.body || payload?.button?.text || payload?.interactive?.button_reply?.title ||
    payload?.interactive?.list_reply?.title || payload?.reply_text || payload?.message || ''
  ).trim();
}

export function keywordMatches(value, expected) {
  const actual = String(value || '').trim().toLowerCase();
  const values = String(expected || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  return values.some((keyword) => actual === keyword || actual.includes(keyword));
}

export function normalizeEventType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return EVENT_STATUS[normalized] ? normalized : 'unknown';
}

export async function recordCommunicationEvent({ provider = 'unknown', providerMsgId, communicationId = null, companyId = null, eventType, occurredAt = null, payload = {} }) {
  const type = normalizeEventType(eventType);
  const messageId = String(providerMsgId || '').trim();
  if (!messageId && !communicationId) return { recorded: false, reason: 'missing_provider_message_id' };

  const communication = communicationId
    ? await one(`SELECT cm.* FROM communications cm JOIN leads l ON l.id=cm.lead_id WHERE cm.id=?${companyId ? ' AND l.company_id=?' : ''} LIMIT 1`, companyId ? [communicationId, companyId] : [communicationId])
    : await one(`SELECT cm.* FROM communications cm JOIN leads l ON l.id=cm.lead_id WHERE cm.provider_msg_id=?${companyId ? ' AND l.company_id=?' : ''} ORDER BY cm.id DESC LIMIT 1`, companyId ? [messageId, companyId] : [messageId]);
  const eventKey = crypto.createHash('sha256').update(JSON.stringify({ provider, messageId: messageId || `comm-${communicationId}`, type, occurredAt: occurredAt || '', payload })).digest('hex');
  const result = await run(
    `INSERT IGNORE INTO communication_events (communication_id,lead_id,provider,provider_msg_id,event_type,event_key,occurred_at,payload)
     VALUES (?,?,?,?,?,?,COALESCE(?,NOW()),?)`,
    [communication?.id || null, communication?.lead_id || null, provider, messageId || communication?.provider_msg_id || null, type, eventKey, occurredAt, JSON.stringify(payload)]
  );
  if (result.affectedRows !== 1) return { recorded: false, duplicate: true, communicationId: communication?.id || null };
  if (!communication) return { recorded: true, unmatched: true };

  const status = EVENT_STATUS[type];
  if (status) {
    const timestampColumn = { delivered: 'delivered_at', opened: 'opened_at', clicked: 'clicked_at', replied: 'replied_at' }[status];
    const set = timestampColumn ? `status=?, ${timestampColumn}=COALESCE(${timestampColumn}, COALESCE(?,NOW()))` : 'status=?';
    const params = timestampColumn ? [status, occurredAt, communication.id] : [status, communication.id];
    await run(`UPDATE communications SET ${set} WHERE id=?`, params);
  }
  const scoreEvent = EVENT_SCORE[type];
  if (scoreEvent) await addScoreEvent(Number(communication.lead_id), scoreEvent, 'communication', Number(communication.id));
  await triggerMatchingEventConditions({ ...communication, _eventPayload: payload }, type);
  return { recorded: true, communicationId: Number(communication.id), leadId: Number(communication.lead_id), eventType: type };
}

async function triggerMatchingEventConditions(communication, eventType) {
  const enrollments = await q(
    `SELECT le.id AS enrollment_id, le.current_step_id, ws.id AS condition_step_id, ws.action_data
     FROM lead_enrollments le
     JOIN workflow_steps current_step ON current_step.id=le.current_step_id
     JOIN workflow_steps ws ON ws.parent_id=current_step.id AND ws.type='condition'
     WHERE le.lead_id=? AND le.status='active'`,
    [communication.lead_id]
  );
  const { advanceEnrollment } = await import('./drip.service.js');
  for (const enrollment of enrollments) {
    let actionData = {};
    try { actionData = JSON.parse(enrollment.action_data || '{}'); } catch {}
    const matchesEvent = actionData.condition === 'engagement_event' && String(actionData.condition_val || '').toLowerCase() === eventType;
    const matchesKeyword = actionData.condition === 'reply_keyword' && eventType === 'replied' && keywordMatches(replyTextFromPayload(communication._eventPayload || {}), actionData.condition_val);
    if (!matchesEvent && !matchesKeyword) continue;
    await advanceEnrollment(enrollment.enrollment_id, enrollment.condition_step_id, { triggered_by_event: eventType, communication_id: communication.id });
  }
}

// Handles Meta-style `statuses` arrays plus common provider event array shapes.
export function extractWebhookEvents(payload = {}) {
  const events = [];
  const push = (item, provider = 'webhook') => {
    const messageId = item?.id || item?.message_id || item?.messageId || item?.provider_msg_id;
    const eventType = item?.status || item?.event || item?.type || item?.event_type;
    if (messageId && eventType) events.push({ provider, providerMsgId: messageId, eventType, occurredAt: item.timestamp ? new Date(Number(item.timestamp) * 1000) : (item.occurred_at || item.created_at || null), payload: item });
  };
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      for (const status of change?.value?.statuses || []) push(status, 'meta');
      // Meta inbound messages reference the outbound message under context.id.
      // That reference, not the new inbound message ID, maps a reply to a flow step.
      for (const message of change?.value?.messages || []) {
        if (message?.context?.id) events.push({
          provider: 'meta', providerMsgId: message.context.id, eventType: 'replied',
          occurredAt: message.timestamp ? new Date(Number(message.timestamp) * 1000) : null, payload: message
        });
      }
    }
  }
  for (const item of payload.statuses || payload.events || payload.data?.events || []) push(item, payload.provider || 'webhook');
  if (payload.status || payload.event) push(payload, payload.provider || 'webhook');
  return events;
}
