import { q, one, run } from '../db/pool.js';
import { sendCommunication } from './comm.service.js';

function truncate(str, len = 140) {
  const s = String(str || '').replace(/\s+/g, ' ').trim();
  return s.length > len ? `${s.slice(0, len - 1)}…` : s;
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
            SUM(assigned_to IS NULL) AS unassigned_count
     FROM conversations WHERE company_id=?`,
    [companyId]
  );
  return {
    all: Number(row?.all_count || 0),
    email: Number(row?.email_count || 0),
    whatsapp: Number(row?.whatsapp_count || 0),
    sms: Number(row?.sms_count || 0),
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

// WhatsApp/RCS go through Anantya's template-send API — there's no free-text
// endpoint in this integration, so a real template row (with wa_template_id)
// is required for those channels. Email/SMS can send free-form text.
const TEMPLATE_ONLY_CHANNELS = ['whatsapp', 'rcs'];

export async function sendReply(companyId, conversationId, userId, body, templateId = null) {
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

  const sendResult = await sendCommunication(channel, lead, template);
  const sentComm = await one('SELECT body_rendered FROM communications WHERE id=?', [sendResult.comm_id]);
  const logBody = sentComm?.body_rendered || body || template.body || '';

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
