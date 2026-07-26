import { run } from '../db/pool.js';
import { getSetting, ensureWebhookKey, resolveCompanyByWebhookKey } from './settings.service.js';

// Bombora delivers account-level "Company Surge" intent signals — a company
// researching certain topics, with a surge score — not a person with an
// email/phone. The leads table requires one of those, so these never become
// leads; they become a Task ("Acme Corp is showing intent for X") for the
// sales team to act on manually, same as the user asked for G2 Intent.
async function createIntentTask(companyId, provider, signal) {
  const company = signal.company_name || signal.company || signal.domain || 'A company';
  const topic = signal.topic || signal.topics?.join(', ') || 'your product category';
  const score = signal.score ?? signal.surge_score ?? '';
  await run(
    `INSERT INTO tasks (company_id, title, description, priority, due_at) VALUES (?, ?, ?, 'medium', NOW())`,
    [
      companyId,
      `${company} showing buying intent (${provider})`,
      `${company} is researching "${topic}"${score !== '' ? ` — intent score ${score}` : ''}. Consider reaching out.`,
    ]
  );
}

export async function getOrCreateBomboraWebhookKey(companyId) {
  return ensureWebhookKey(companyId, 'bombora_webhook_key');
}

export async function handleBomboraWebhook(req, res) {
  const companyId = await resolveCompanyByWebhookKey('bombora_webhook_key', req.params.webhookKey);
  if (!companyId) return res.status(404).json({ status: 'unknown_key' });

  const logResult = await run('INSERT INTO webhook_logs (source,event,payload,status,ip) VALUES (?,?,?,?,?)',
    ['bombora', 'surge_signal', req.rawBody || JSON.stringify(req.body || {}), 'received', req.socket?.remoteAddress || '0.0.0.0']);

  try {
    const payload = req.body || {};
    const signals = Array.isArray(payload) ? payload : (payload.signals || payload.companies || [payload]);
    let created = 0;
    for (const signal of signals) {
      if (!signal || (!signal.company_name && !signal.company && !signal.domain)) continue;
      await createIntentTask(companyId, 'Bombora', signal);
      created += 1;
    }
    await run('UPDATE webhook_logs SET status=? WHERE id=?', [created > 0 ? 'processed' : 'ignored', logResult.insertId]);
    res.status(200).json({ status: 'ok', created });
  } catch (err) {
    console.error('[bombora webhook] processing error:', err);
    await run('UPDATE webhook_logs SET status=?, error=? WHERE id=?', ['failed', String(err.stack || err.message || err).slice(0, 2000), logResult.insertId]).catch(() => {});
    res.status(200).json({ status: 'error', message: 'Logged for review.' });
  }
}

// Best-effort — Bombora's self-serve REST access varies by contract type
// (many accounts get data via file delivery/partner integration rather than a
// simple REST pull). If this 404s or comes back empty for your account, the
// webhook above is the more likely to actually work path.
export async function syncBomboraSignals(companyId) {
  const apiKey = await getSetting('bombora_api_key', '', companyId);
  if (!apiKey) throw new Error('Bombora is not connected — add your API key first.');
  const response = await fetch(`https://api.bombora.com/company-surge/v1/topics?api_key=${encodeURIComponent(apiKey)}`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Bombora API error (HTTP ${response.status})`);
  const signals = Array.isArray(data) ? data : (data.signals || data.data || []);
  let created = 0;
  for (const signal of signals) {
    await createIntentTask(companyId, 'Bombora', signal);
    created += 1;
  }
  return { total: signals.length, created };
}
