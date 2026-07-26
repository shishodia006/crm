import { run } from '../db/pool.js';
import { getSetting, ensureWebhookKey, resolveCompanyByWebhookKey } from './settings.service.js';

// Same reasoning as Bombora: G2's Buyer Intent data is account-level (a
// company researching/comparing products on G2), not a person with contact
// details, so it becomes a Task rather than a lead.
async function createIntentTask(companyId, signal) {
  const company = signal.company_name || signal.company || signal.domain || 'A company';
  const activity = signal.activity || signal.category || signal.product || 'your category';
  const score = signal.intent_score ?? signal.score ?? '';
  await run(
    `INSERT INTO tasks (company_id, title, description, priority, due_at) VALUES (?, ?, ?, 'medium', NOW())`,
    [
      companyId,
      `${company} showing buying intent (G2)`,
      `${company} has been active around "${activity}" on G2${score !== '' ? ` — intent score ${score}` : ''}. Consider reaching out.`,
    ]
  );
}

export async function getOrCreateG2IntentWebhookKey(companyId) {
  return ensureWebhookKey(companyId, 'g2_intent_webhook_key');
}

export async function handleG2IntentWebhook(req, res) {
  const companyId = await resolveCompanyByWebhookKey('g2_intent_webhook_key', req.params.webhookKey);
  if (!companyId) return res.status(404).json({ status: 'unknown_key' });

  const logResult = await run('INSERT INTO webhook_logs (source,event,payload,status,ip) VALUES (?,?,?,?,?)',
    ['g2_intent', 'intent_signal', req.rawBody || JSON.stringify(req.body || {}), 'received', req.socket?.remoteAddress || '0.0.0.0']);

  try {
    const payload = req.body || {};
    const signals = Array.isArray(payload) ? payload : (payload.signals || payload.accounts || [payload]);
    let created = 0;
    for (const signal of signals) {
      if (!signal || (!signal.company_name && !signal.company && !signal.domain)) continue;
      await createIntentTask(companyId, signal);
      created += 1;
    }
    await run('UPDATE webhook_logs SET status=? WHERE id=?', [created > 0 ? 'processed' : 'ignored', logResult.insertId]);
    res.status(200).json({ status: 'ok', created });
  } catch (err) {
    console.error('[g2 intent webhook] processing error:', err);
    await run('UPDATE webhook_logs SET status=?, error=? WHERE id=?', ['failed', String(err.stack || err.message || err).slice(0, 2000), logResult.insertId]).catch(() => {});
    res.status(200).json({ status: 'error', message: 'Logged for review.' });
  }
}

// Best-effort — G2's Intent API access depends on your G2 Track/Buyer Intent
// subscription tier; if this errors, the webhook path above (configured from
// G2's side to push to you) is the more likely to work option.
export async function syncG2IntentSignals(companyId) {
  const apiKey = await getSetting('g2_intent_api_key', '', companyId);
  if (!apiKey) throw new Error('G2 Intent is not connected — add your API key first.');
  const response = await fetch('https://data.g2.com/api/v1/intent', { headers: { Authorization: `Bearer ${apiKey}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `G2 API error (HTTP ${response.status})`);
  const signals = Array.isArray(data) ? data : (data.signals || data.data || []);
  let created = 0;
  for (const signal of signals) {
    await createIntentTask(companyId, signal);
    created += 1;
  }
  return { total: signals.length, created };
}
