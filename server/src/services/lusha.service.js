import { one, run } from '../db/pool.js';
import { getSetting } from './settings.service.js';
import { normalizeImportRow, processLead } from './lead.service.js';

let _lushaSourceId = null;
async function ensureLushaSourceId() {
  if (_lushaSourceId) return _lushaSourceId;
  const existing = await one("SELECT id FROM lead_sources WHERE slug='lusha' LIMIT 1");
  if (existing) { _lushaSourceId = Number(existing.id); return _lushaSourceId; }
  const result = await run("INSERT INTO lead_sources (name,slug,category) VALUES ('Lusha','lusha','external')");
  _lushaSourceId = Number(result.insertId);
  return _lushaSourceId;
}

function mapLushaContactToLead(contact) {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() || contact.email || 'Lusha Contact';
  const email = (contact.emailAddresses || contact.emails || [])[0]?.email || contact.email || '';
  const phone = (contact.phoneNumbers || contact.phones || [])[0]?.number || contact.phone || '';
  return normalizeImportRow({
    name,
    email,
    mobile: phone,
    company: contact.companyName || contact.company?.name || '',
    designation: contact.jobTitle || contact.title || '',
    city: contact.city || '',
    country: contact.country || 'India',
    'Lusha Contact ID': contact.id ?? contact.contactId ?? '',
  });
}

// Lusha's API is primarily built around on-demand enrichment/prospecting
// (look up a person/company, spend credits) rather than "list everything
// I've saved" the way HubSpot/Apollo contacts work — this reads their saved
// "Requested Contacts" list, which is the closest equivalent. Confidence here
// is lower than Apollo's; verify field names against a real response if
// Sync Now returns 0 despite having saved contacts.
async function fetchAllLushaContacts(companyId) {
  const apiKey = await getSetting('lusha_api_key', '', companyId);
  if (!apiKey) throw new Error('Lusha is not connected — add your API key first.');
  const response = await fetch('https://api.lusha.com/contacts', { headers: { api_key: apiKey } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Lusha API error (HTTP ${response.status})`);
  return Array.isArray(data) ? data : (data.contacts || data.data || []);
}

export async function syncLushaLeads(companyId, req) {
  const contacts = await fetchAllLushaContacts(companyId);
  const sourceId = await ensureLushaSourceId();
  const summary = { total: 0, imported: 0, duplicates: 0, failed: 0, errors: [] };
  for (const contact of contacts) {
    summary.total += 1;
    const normalized = mapLushaContactToLead(contact);
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
        [companyId, `Review ${summary.imported} leads from Lusha`, `Synced ${summary.imported} new contact(s) from your connected Lusha account — review and reach out.`]
      );
    } catch (err) {
      console.error('[syncLushaLeads] summary task creation failed:', err);
    }
  }
  return summary;
}
