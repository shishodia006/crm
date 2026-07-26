import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { q } from '../db/pool.js';
import { getSetting, saveCompanySetting } from './settings.service.js';
import { recordInboundMessage } from './conversation.service.js';

// Companies that have configured an IMAP mailbox (Settings → Integrations → Email)
// get their INBOX polled on every tick; everyone else is skipped with zero DB/network cost.
async function companiesWithImap() {
  const rows = await q("SELECT DISTINCT company_id FROM company_settings WHERE `key`='imap_host' AND `value` <> ''");
  return rows.map((r) => Number(r.company_id));
}

function extractMessageId(value) {
  return String(value || '').replace(/[<>]/g, '').trim();
}

// Gmail/Outlook/Apple Mail all prefix the quoted original with a line like
// "On <date>, <name> wrote:" (or classic "-----Original Message-----"), followed by
// "> "-quoted lines. A reply thread in a chat-style bubble should show only the new
// text the lead actually typed, not their whole quoted copy of what we sent them.
const QUOTE_MARKERS = [
  /^-{2,}\s*Original Message\s*-{2,}/im,
  // Non-greedy [\s\S] (not `.`) so this still matches when Gmail/Outlook wrap a long
  // "On <date>, <name> <email> wrote:" header across two lines.
  /^On\s[\s\S]{0,300}?\swrote:\s*$/im,
  /^From:\s.+$/im,
];
function stripQuotedReply(text) {
  let cut = text.length;
  for (const re of QUOTE_MARKERS) {
    const m = re.exec(text);
    if (m && m.index < cut) cut = m.index;
  }
  return text.slice(0, cut).trim();
}

async function handleParsedEmail(companyId, parsed) {
  const fromEmail = parsed.from?.value?.[0]?.address?.toLowerCase();
  if (!fromEmail) return { recorded: false, reason: 'no_from_address' };

  // mailparser returns `references` as a plain string when there's exactly one
  // Reference header value, and only as an array when there are several — spreading
  // a string with `.map()` throws (strings have no `.map`), which silently crashed
  // this whole function for the extremely common case of a first-time reply.
  const referencesRaw = Array.isArray(parsed.references) ? parsed.references : (parsed.references ? [parsed.references] : []);
  const references = [extractMessageId(parsed.inReplyTo), ...referencesRaw.map(extractMessageId)].filter(Boolean);
  const rawText = String(parsed.text || (parsed.html || '').replace(/<[^>]+>/g, ' ') || '').trim();
  const bodyText = stripQuotedReply(rawText).slice(0, 20000);
  if (!bodyText) return { recorded: false, reason: 'empty_body' };

  return recordInboundMessage({
    companyId,
    channel: 'email',
    fromEmail,
    body: bodyText,
    providerMsgId: extractMessageId(parsed.messageId) || null,
    contextProviderMsgId: references[0] || null,
    occurredAt: parsed.date || null,
  });
}

// Tracks progress with a UID high-water mark instead of the \Seen flag. A shared
// business mailbox can have thousands of pre-existing unrelated unread emails —
// scanning "all unseen" would burn the batch limit on old backlog before ever
// reaching a lead's reply, and would mark the human's real inbox mail as read as
// a side effect. UID tracking only ever looks at mail that arrived since the last
// poll and never touches message flags.
async function pollCompanyInbox(companyId, limit) {
  const host = await getSetting('imap_host', '', companyId);
  const user = await getSetting('imap_user', '', companyId);
  const pass = await getSetting('imap_pass', '', companyId);
  if (!host || !user || !pass) return { processed: 0, recorded: 0 };

  const port = Number(await getSetting('imap_port', '993', companyId)) || 993;
  const secure = (await getSetting('imap_secure', '1', companyId)) !== '0';

  const client = new ImapFlow({ host, port, secure, auth: { user, pass }, logger: false });
  let processed = 0;
  let recorded = 0;

  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uidNext = client.mailbox.uidNext;
      const lastUid = Number((await getSetting('imap_last_uid', '', companyId)) || 0);

      if (!lastUid) {
        // First poll for this mailbox — start the high-water mark at "now" rather
        // than dumping years of pre-existing inbox history into Conversations.
        await saveCompanySetting(companyId, 'imap_last_uid', String(uidNext - 1), 'email');
        return { processed: 0, recorded: 0 };
      }

      const from = lastUid + 1;
      if (from >= uidNext) return { processed: 0, recorded: 0 };

      const to = Math.min(uidNext - 1, from + limit - 1);
      for await (const message of client.fetch(`${from}:${to}`, { uid: true, source: true }, { uid: true })) {
        try {
          const parsed = await simpleParser(message.source);
          const result = await handleParsedEmail(companyId, parsed);
          if (result.recorded) recorded++;
        } catch (err) {
          console.error(`[imap] company ${companyId} uid ${message.uid} parse failed:`, err.message);
        }
        processed++;
      }
      await saveCompanySetting(companyId, 'imap_last_uid', String(to), 'email');
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
  return { processed, recorded };
}

export async function pollEmailReplies(batchLimitPerCompany = 200) {
  const companyIds = await companiesWithImap();
  let processed = 0, recorded = 0, errors = 0;
  for (const companyId of companyIds) {
    try {
      const result = await pollCompanyInbox(companyId, batchLimitPerCompany);
      processed += result.processed;
      recorded += result.recorded;
    } catch (err) {
      errors++;
      console.error(`[imap] company ${companyId} poll failed:`, err.message);
    }
  }
  return { processed, recorded, errors };
}
