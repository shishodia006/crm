import { q, one, run } from '../db/pool.js';
import { sendCommunication } from './comm.service.js';
import { insertLead } from './lead.service.js';
import { notifyUsers, notifyRecipientsForLead } from './notifications.service.js';
import { recordCommunicationEvent } from './engagement.service.js';

// Channels where an inbound message from a phone number nobody has talked to yet
// should still show up on the panel — a business WhatsApp/RCS number receiving a
// message is (almost always) a real prospect, unlike a shared inbox's email traffic
// (newsletters, notifications) which shouldn't auto-become CRM leads.
const AUTO_LEAD_CHANNELS = ['whatsapp', 'rcs'];

let _inboundSourceId = null;
async function ensureInboundLeadSourceId() {
  if (_inboundSourceId) return _inboundSourceId;
  const existing = await one("SELECT id FROM lead_sources WHERE slug='whatsapp_inbound' LIMIT 1");
  if (existing) { _inboundSourceId = Number(existing.id); return _inboundSourceId; }
  const result = await run("INSERT INTO lead_sources (name,slug,category) VALUES ('WhatsApp Inbound','whatsapp_inbound','external')");
  _inboundSourceId = Number(result.insertId);
  return _inboundSourceId;
}

// The generic (no per-account key) webhook URL — what a company's *default*
// WhatsApp/Anantya number posts to — carries no company context. In this
// single-company-per-install reality that's fine: if exactly one company has a
// WhatsApp provider configured at all, that's unambiguously who the message
// belongs to. A true multi-tenant install would need Anantya to pass some
// per-account identifier instead of relying on this fallback.
async function resolveSoleWhatsappCompanyId() {
  const rows = await q("SELECT DISTINCT company_id FROM company_settings WHERE `key`='wa_provider' AND `value`<>''");
  return rows.length === 1 ? Number(rows[0].company_id) : null;
}

export function truncate(str, len = 140) {
  const s = String(str || '').replace(/\s+/g, ' ').trim();
  return s.length > len ? `${s.slice(0, len - 1)}…` : s;
}

// Email templates store full HTML (tables/inline styles for the actual sent design);
// the Conversations thread is a plain chat bubble, not an HTML viewer, so strip markup
// down to readable text rather than dumping raw tags in front of the user.
function stripHtml(str) {
  return String(str || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Mirrors the +91-prefixing lead.service.js applies when a lead's mobile is saved,
// so an inbound webhook's raw phone digits can be matched against leads.mobile.
export function normalizeInboundPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

export async function listConversations(companyId, { channel, assigned, search } = {}) {
  const clauses = ['c.company_id = ?'];
  const params = [companyId];

  if (channel && channel !== 'all') { clauses.push('c.channel = ?'); params.push(channel); }
  if (assigned === 'unassigned') clauses.push('c.assigned_to IS NULL');
  if (search) {
    const like = `%${search}%`;
    clauses.push('(l.name LIKE ? OR l.company LIKE ? OR l.email LIKE ?)');
    params.push(like, like, like);
  }

  return q(
    `SELECT c.*, l.name AS lead_name, l.company AS lead_company, l.email AS lead_email, l.mobile AS lead_mobile,
            u.name AS assigned_name,
            d.value AS deal_value, d.currency AS deal_currency, ps.name AS deal_stage
     FROM conversations c
     JOIN leads l ON l.id = c.lead_id
     LEFT JOIN users u ON u.id = c.assigned_to
     LEFT JOIN deals d ON d.id = (SELECT dd.id FROM deals dd WHERE dd.lead_id = l.id ORDER BY dd.created_at DESC LIMIT 1)
     LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY c.last_message_at DESC, c.created_at DESC
     LIMIT 200`,
    params
  );
}

export async function getConversationCounts(companyId) {
  const row = await one(
    `SELECT COUNT(*) AS all_count,
            SUM(channel='email')    AS email_count,
            SUM(channel='whatsapp') AS whatsapp_count,
            SUM(channel='sms')      AS sms_count,
            SUM(channel='rcs')      AS rcs_count,
            SUM(assigned_to IS NULL) AS unassigned_count
     FROM conversations WHERE company_id=?`,
    [companyId]
  );
  return {
    all: Number(row?.all_count || 0),
    email: Number(row?.email_count || 0),
    whatsapp: Number(row?.whatsapp_count || 0),
    sms: Number(row?.sms_count || 0),
    rcs: Number(row?.rcs_count || 0),
    unassigned: Number(row?.unassigned_count || 0),
  };
}

export async function getThread(companyId, conversationId) {
  const conversation = await one(
    `SELECT c.*, l.name AS lead_name, l.company AS lead_company, l.email AS lead_email, l.mobile AS lead_mobile
     FROM conversations c JOIN leads l ON l.id = c.lead_id
     WHERE c.id=? AND c.company_id=? LIMIT 1`,
    [conversationId, companyId]
  );
  if (!conversation) return null;

  const [deal, messages] = await Promise.all([
    one(
      `SELECT d.value, d.currency, ps.name AS stage_name
       FROM deals d LEFT JOIN pipeline_stages ps ON ps.id = d.stage_id
       WHERE d.lead_id=? AND d.company_id=? ORDER BY d.created_at DESC LIMIT 1`,
      [conversation.lead_id, companyId]
    ),
    q(
      `SELECT m.*, u.name AS sender_name
       FROM conversation_messages m LEFT JOIN users u ON u.id = m.sender_user_id
       WHERE m.conversation_id=? ORDER BY m.created_at ASC`,
      [conversationId]
    ),
  ]);

  return { conversation, deal, messages };
}

export async function getOrCreateConversation(companyId, leadId, channel = 'email') {
  const existing = await one('SELECT * FROM conversations WHERE company_id=? AND lead_id=? LIMIT 1', [companyId, leadId]);
  if (existing) {
    // A lead has one conversation thread, but the channel used to reach them can change
    // between sends (e.g. task modal sending WhatsApp after an earlier email) — keep it current.
    if (existing.channel !== channel) {
      await run('UPDATE conversations SET channel=? WHERE id=?', [channel, existing.id]);
      existing.channel = channel;
    }
    return existing;
  }
  const result = await run(
    'INSERT INTO conversations (company_id, lead_id, channel) VALUES (?,?,?)',
    [companyId, leadId, channel]
  );
  return one('SELECT * FROM conversations WHERE id=?', [result.insertId]);
}

// Records an inbound reply (WhatsApp webhook message, or a parsed IMAP email) into
// the lead's conversation thread. `providerMsgId` is used to dedupe re-delivered
// webhooks / re-scanned mailbox items — see migration 008 for the unique index.
// `contextProviderMsgId` (WhatsApp's reply-to id / an email's In-Reply-To header)
// is tried first to resolve the lead via the original outbound communication;
// falls back to matching `fromPhone`/`fromEmail` directly against the lead record.
// `companyId` is optional: a webhook posted to the generic (no per-account key) URL —
// which is what a company's *default* WhatsApp/Anantya number uses — carries no
// company context on its own, so it's resolved here the same way status webhooks
// already do: via the matched communication/lead, falling back to a global phone
// lookup. Requiring companyId upfront would silently drop every reply sent through
// a company's default account instead of a named integration_accounts entry.
export async function recordInboundMessage({
  companyId = null, channel, fromPhone = null, fromEmail = null, senderName = null, body,
  providerMsgId = null, contextProviderMsgId = null, occurredAt = null,
}) {
  if (!body) return { recorded: false, reason: 'missing_body' };

  let communication = contextProviderMsgId
    ? await one(
        companyId
          ? `SELECT cm.* FROM communications cm JOIN leads l ON l.id=cm.lead_id
             WHERE l.company_id=? AND cm.channel=? AND cm.provider_msg_id=? ORDER BY cm.id DESC LIMIT 1`
          : `SELECT cm.* FROM communications cm WHERE cm.channel=? AND cm.provider_msg_id=? ORDER BY cm.id DESC LIMIT 1`,
        companyId ? [companyId, channel, contextProviderMsgId] : [channel, contextProviderMsgId]
      )
    : null;

  let lead = communication ? await one('SELECT * FROM leads WHERE id=? LIMIT 1', [communication.lead_id]) : null;
  const mobile = fromPhone ? normalizeInboundPhone(fromPhone) : '';
  if (!lead && mobile) {
    lead = await one(
      companyId ? 'SELECT * FROM leads WHERE company_id=? AND mobile=? LIMIT 1' : 'SELECT * FROM leads WHERE mobile=? LIMIT 1',
      companyId ? [companyId, mobile] : [mobile]
    );
  }
  if (!lead && fromEmail) {
    const email = String(fromEmail).toLowerCase();
    lead = await one(
      companyId ? 'SELECT * FROM leads WHERE company_id=? AND email=? LIMIT 1' : 'SELECT * FROM leads WHERE email=? LIMIT 1',
      companyId ? [companyId, email] : [email]
    );
  }

  // Nobody in the CRM has this phone number yet — for a business WhatsApp/RCS
  // number that's a new prospect messaging in, not noise, so create a minimal
  // lead on the spot rather than silently dropping their message. Guard against
  // masked/placeholder numbers some providers send in test payloads (e.g.
  // Anantya's own "9198*****" example) — stripping non-digits from that leaves
  // "9198", which would otherwise create a garbage lead on every test click.
  if (!lead && mobile && mobile.replace(/\D/g, '').length >= 10 && AUTO_LEAD_CHANNELS.includes(channel)) {
    const resolvedCompanyId = companyId || (await resolveSoleWhatsappCompanyId());
    if (resolvedCompanyId) {
      const sourceId = await ensureInboundLeadSourceId();
      const leadId = await insertLead({
        company_id: resolvedCompanyId, name: senderName || mobile, mobile, source_id: sourceId, status: 'new',
      });
      lead = await one('SELECT * FROM leads WHERE id=? LIMIT 1', [leadId]);
    }
  }
  if (!lead) return { recorded: false, reason: 'lead_not_found' };

  // The provider didn't send a reply-to id we could match (or Anantya's payload
  // shape doesn't carry one for this message type) — this is still a real reply
  // from a known lead, and the drip engine's reply-keyword/engagement-event
  // condition checks need SOME outbound communication to scope to, or they can
  // never see this reply at all. Best-effort: treat it as a reply to this lead's
  // most recent outbound message on the same channel.
  if (!communication) {
    communication = await one(
      'SELECT * FROM communications WHERE lead_id=? AND channel=? ORDER BY id DESC LIMIT 1',
      [lead.id, channel]
    );
  }

  const conversation = await getOrCreateConversation(companyId || lead.company_id, lead.id, channel);

  try {
    const insert = await run(
      `INSERT INTO conversation_messages (conversation_id, communication_id, direction, channel, body, status, provider_msg_id, created_at)
       VALUES (?,?, 'in', ?, ?, 'received', ?, COALESCE(?, NOW()))`,
      [conversation.id, communication?.id || null, channel, body, providerMsgId, occurredAt]
    );
    await run(
      'UPDATE conversations SET last_message_at=COALESCE(?,NOW()), last_message_preview=?, unread_count=unread_count+1 WHERE id=?',
      [occurredAt, truncate(body), conversation.id]
    );
    if (communication) {
      // Feeds evaluateCondition()'s reply_keyword/engagement_event check in
      // drip.service.js — without this, a workflow's reply-based Condition step
      // can never see a reply that only arrived through the Conversations pipeline
      // (i.e. didn't match the stricter Meta-style status-webhook parsing).
      try {
        await recordCommunicationEvent({
          provider: 'crm_inbound',
          communicationId: communication.id,
          companyId: companyId || lead.company_id,
          eventType: 'replied',
          occurredAt,
          payload: { text: { body } },
        });
      } catch (err) {
        console.error('[conversation] recordCommunicationEvent (replied) failed:', err.message);
      }
    }
    try {
      const recipients = await notifyRecipientsForLead(companyId || lead.company_id, lead.assigned_to);
      await notifyUsers(recipients, {
        type: 'new_message',
        title: `New ${channel} reply from ${lead.name}`,
        body: truncate(body),
        link: `/conversations?id=${conversation.id}`,
      });
    } catch (err) {
      // A missed notification shouldn't fail the whole inbound-message write —
      // the message itself is already saved at this point.
      console.error('[conversation] notifyUsers failed:', err.message);
    }
    return { recorded: true, conversationId: conversation.id, messageId: insert.insertId, leadId: lead.id };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return { recorded: false, duplicate: true, leadId: lead.id };
    throw err;
  }
}

// WhatsApp/RCS go through Anantya's template-send API — there's no free-text
// endpoint in this integration, so a real template row (with wa_template_id)
// is required for those channels. Email/SMS can send free-form text.
// RCS has no free-text/session-message API (Google RCS Business Messaging
// requires an approved template for every send) — WhatsApp does, via Anantya's
// /api/Messages/sendtext session-message endpoint (see sendCommunication in
// comm.service.js), so it's no longer forced through the template picker.
const TEMPLATE_ONLY_CHANNELS = ['rcs'];

export async function sendReply(companyId, conversationId, userId, body, templateId = null, integrationAccountId = null) {
  const conversation = await one('SELECT * FROM conversations WHERE id=? AND company_id=? LIMIT 1', [conversationId, companyId]);
  if (!conversation) return { error: 'not_found' };

  const lead = await one('SELECT * FROM leads WHERE id=? AND company_id=? LIMIT 1', [conversation.lead_id, companyId]);
  if (!lead) return { error: 'lead_not_found' };

  const channel = conversation.channel;

  let template;
  if (templateId) {
    template = await one('SELECT * FROM templates WHERE id=? AND company_id=? AND channel=? LIMIT 1', [templateId, companyId, channel]);
    if (!template) return { error: 'template_not_found' };
  } else if (TEMPLATE_ONLY_CHANNELS.includes(channel)) {
    return { error: 'template_required' };
  } else {
    template = channel === 'email' ? { subject: `Re: ${lead.company || lead.name}`, body } : { body };
  }

  const sendResult = await sendCommunication(channel, lead, template, null, null, integrationAccountId);
  const sentComm = await one('SELECT body_rendered FROM communications WHERE id=?', [sendResult.comm_id]);
  const logBody = stripHtml(sentComm?.body_rendered || body || template.body || '');

  const insert = await run(
    `INSERT INTO conversation_messages (conversation_id, communication_id, direction, channel, body, sender_user_id, status, error_message)
     VALUES (?,?,?,?,?,?,?,?)`,
    [conversationId, sendResult.comm_id, 'out', channel, logBody, userId, sendResult.delivered ? 'sent' : 'failed', sendResult.error || null]
  );

  await run(
    'UPDATE conversations SET last_message_at=NOW(), last_message_preview=?, unread_count=0 WHERE id=?',
    [truncate(logBody), conversationId]
  );

  const message = await one(
    'SELECT m.*, u.name AS sender_name FROM conversation_messages m LEFT JOIN users u ON u.id=m.sender_user_id WHERE m.id=?',
    [insert.insertId]
  );

  return { message, delivered: sendResult.delivered, error: sendResult.error };
}

export async function markRead(companyId, conversationId) {
  await run('UPDATE conversations SET unread_count=0 WHERE id=? AND company_id=?', [conversationId, companyId]);
}
