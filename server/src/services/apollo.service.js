import { one, run } from '../db/pool.js';
import { getSetting } from './settings.service.js';
import { normalizeImportRow, processLead } from './lead.service.js';

let _apolloSourceId = null;
async function ensureApolloSourceId() {
  if (_apolloSourceId) return _apolloSourceId;
  const existing = await one("SELECT id FROM lead_sources WHERE slug='apollo' LIMIT 1");
  if (existing) { _apolloSourceId = Number(existing.id); return _apolloSourceId; }
  const result = await run("INSERT INTO lead_sources (name,slug,category) VALUES ('Apollo','apollo','external')");
  _apolloSourceId = Number(result.insertId);
  return _apolloSourceId;
}

function mapApolloContactToLead(contact) {
  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() || contact.email || 'Apollo Contact';
  return normalizeImportRow({
    name,
    email: contact.email || '',
    mobile: contact.phone_numbers?.[0]?.sanitized_number || contact.mobile_phone || '',
    company: contact.organization_name || contact.account?.name || '',
    designation: contact.title || '',
    city: contact.city || '',
    state: contact.state || '',
    country: contact.country || 'India',
    'Apollo Contact ID': contact.id ?? '',
  });
}

// Pulls the account's own saved Apollo contacts (not a prospecting search
// against Apollo's whole database — those aren't "your" leads).
async function fetchAllApolloContacts(companyId) {
  const apiKey = await getSetting('apollo_api_key', '', companyId);
  if (!apiKey) throw new Error('Apollo is not connected — add your API key first.');
  const contacts = [];
  let page = 1;
  while (true) {
    const response = await fetch(`https://api.apollo.io/v1/contacts?api_key=${encodeURIComponent(apiKey)}&page=${page}&per_page=100`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Apollo API error (HTTP ${response.status})`);
    const pageContacts = data.contacts || [];
    contacts.push(...pageContacts);
    const totalPages = data.pagination?.total_pages || 1;
    if (page >= totalPages || pageContacts.length === 0) break;
    page += 1;
    await new Promise((r) => setTimeout(r, 250));
  }
  return contacts;
}

export async function syncApolloLeads(companyId, req) {
  const contacts = await fetchAllApolloContacts(companyId);
  const sourceId = await ensureApolloSourceId();
  const summary = { total: 0, imported: 0, duplicates: 0, failed: 0, errors: [] };
  for (const contact of contacts) {
    summary.total += 1;
    const normalized = mapApolloContactToLead(contact);
    const result = await processLead(normalized, sourceId, null, req, undefined, { skipWelcomeTask: true });
    if (result.success) result.is_duplicate ? summary.duplicates += 1 : summary.imported += 1;
    else {
      summary.failed += 1;
      summary.errors.push(`Contact ${contact.id}: ${Object.values(result.errors).join(', ')}`);
    }
  }
  if (summary.imported > 0) {
    try {
      await run(
        `INSERT INTO tasks (company_id, title, description, priority, due_at) VALUES (?, ?, ?, 'high', NOW())`,
        [companyId, `Review ${summary.imported} leads from Apollo`, `Synced ${summary.imported} new contact(s) from your connected Apollo account — review and reach out.`]
      );
    } catch (err) {
      console.error('[syncApolloLeads] summary task creation failed:', err);
    }
  }
  return summary;
}
