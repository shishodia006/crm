import { one } from '../db/pool.js';
import { ok, fail } from '../utils/response.js';
import {
  listConversations,
  getConversationCounts,
  getThread,
  getOrCreateConversation,
  sendReply,
  markRead,
} from '../services/conversation.service.js';

export async function index(req, res) {
  const { channel, assigned, search } = req.query;
  const [conversations, counts] = await Promise.all([
    listConversations(req.companyId, { channel, assigned, search }),
    getConversationCounts(req.companyId),
  ]);
  ok(res, { conversations, counts });
}

export async function show(req, res) {
  const data = await getThread(req.companyId, Number(req.params.id));
  if (!data) return fail(res, 'Conversation not found.', 404);
  ok(res, data);
}

export async function store(req, res) {
  const leadId = Number(req.body.lead_id);
  const channel = req.body.channel || 'email';
  if (!leadId) return fail(res, 'Lead is required.', 422);

  const lead = await one('SELECT id FROM leads WHERE id=? AND company_id=? LIMIT 1', [leadId, req.companyId]);
  if (!lead) return fail(res, 'Lead not found.', 404);

  const conversation = await getOrCreateConversation(req.companyId, leadId, channel);

  const body = String(req.body.message || '').trim();
  const templateId = req.body.template_id ? Number(req.body.template_id) : null;
  const integrationAccountId = req.body.integration_account_id ? Number(req.body.integration_account_id) : null;
  let message = null;
  let delivered = null;
  if (body || templateId) {
    const result = await sendReply(req.companyId, conversation.id, req.user.id, body, templateId, integrationAccountId);
    if (result.error) {
      const messages = {
        template_required: 'A template is required to message a lead on this channel.',
        template_not_found: 'Selected template was not found.',
        lead_not_found: 'Lead not found on this conversation.',
        daily_send_limit_reached: 'This account has reached its daily send limit — try again tomorrow or pick a different account.',
      };
      return fail(res, messages[result.error] || result.error, 422);
    }
    message = result.message;
    delivered = result.delivered;
  }

  ok(res, { id: conversation.id, message, delivered }, delivered === false ? 'Message could not be delivered.' : 'Conversation ready.');
}

export async function reply(req, res) {
  const body = String(req.body.body || '').trim();
  if (!body) return fail(res, 'Message body required.', 422);

  const result = await sendReply(req.companyId, Number(req.params.id), req.user.id, body);
  if (result.error === 'not_found') return fail(res, 'Conversation not found.', 404);
  if (result.error === 'lead_not_found') return fail(res, 'Lead not found on this conversation.', 404);
  if (result.error === 'template_required') return fail(res, 'This channel only sends approved templates — use "New Message" to pick one.', 422);
  if (result.error === 'template_not_found') return fail(res, 'Selected template was not found.', 422);
  if (result.error === 'daily_send_limit_reached') return fail(res, 'This account has reached its daily send limit — try again tomorrow or pick a different account.', 422);

  ok(res, { message: result.message, delivered: result.delivered }, result.delivered ? 'Message sent.' : (result.error || 'Message saved but delivery failed.'));
}

export async function read(req, res) {
  await markRead(req.companyId, Number(req.params.id));
  ok(res, null);
}
