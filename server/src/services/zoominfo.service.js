import { one, run } from '../db/pool.js';
import { getSetting } from './settings.service.js';
import { normalizeImportRow, processLead } from './lead.service.js';

let _zoominfoSourceId = null;
async function ensureZoominfoSourceId() {
  if (_zoominfoSourceId) return _zoominfoSourceId;
  const existing = await one("SELECT id FROM lead_sources WHERE slug='zoominfo' LIMIT 1");
  if (existing) { _zoominfoSourceId = Number(existing.id); return _zoominfoSourceId; }
  const result = await run("INSERT INTO lead_sources (name,slug,category) VALUES ('ZoomInfo','zoominfo','external')");
  _zoominfoSourceId = Number(result.insertId);
  return _zoominfoSourceId;
}

function mapZoominfoContactToLead(contact) {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || contact.email || 'ZoomInfo Contact';
  return normalizeImportRow({
    name,
    email: contact.email || '',
    mobile: contact.phone || contact.mobilePhone || '',
    company: contact.companyName || contact.company?.name || '',
    designation: contact.jobTitle || contact.title || '',
    city: contact.city || '',
    state: contact.state || '',
    country: contact.country || 'India',
    'ZoomInfo Contact ID': contact.id ?? contact.personId ?? '',
  });
}

// Lowest confidence of the batch — ZoomInfo's API is enterprise-gated
// (requires a ZoomInfo API contract, and their auth is typically
// username+client_id JWT-based, not a bare API key). This assumes a plain
// bearer token for simplicity; if your ZoomInfo contract uses their JWT auth
// flow instead, this will need updating to match — check with your ZoomInfo
// account rep for the exact auth your contract provides.
async function fetchAllZoominfoContacts(companyId) {
  const apiKey = await getSetting('zoominfo_api_key', '', companyId);
  if (!apiKey) throw new Error('ZoomInfo is not connected — add your API key first.');
  const response = await fetch('https://api.zoominfo.com/search/contact', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ rpp: 100 }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `ZoomInfo API error (HTTP ${response.status}) — check with your ZoomInfo rep whether this account uses bearer-token or JWT auth.`);
  return data.data || data.contacts || [];
}

export async function syncZoominfoLeads(companyId, req) {
  const contacts = await fetchAllZoominfoContacts(companyId);
  const sourceId = await ensureZoominfoSourceId();
  const summary = { total: 0, imported: 0, duplicates: 0, failed: 0, errors: [] };
  for (const contact of contacts) {
    summary.total += 1;
    const normalized = mapZoominfoContactToLead(contact);
    const result = await processLead(normalized, sourceId, null, req, undefined, { skipWelcomeTask: true });
    if (result.success) result.is_duplicate ? summary.duplicates += 1 : summary.imported += 1;
    else {
      summary.failed += 1;
      summary.errors.push(`Row ${summary.total}: ${Object.values(result.errors).join(', ')}`);
    }
  }
  if (summary.imported > 0) {
    try {
      await run(
        `INSERT INTO tasks (company_id, title, description, priority, due_at) VALUES (?, ?, ?, 'high', NOW())`,
        [companyId, `Review ${summary.imported} leads from ZoomInfo`, `Synced ${summary.imported} new contact(s) from your connected ZoomInfo account — review and reach out.`]
      );
    } catch (err) {
      console.error('[syncZoominfoLeads] summary task creation failed:', err);
    }
  }
  return summary;
}
