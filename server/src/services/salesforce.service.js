import { one, run, q } from '../db/pool.js';
import { getSetting, saveCompanySetting } from './settings.service.js';
import { normalizeImportRow, processLead } from './lead.service.js';

const API_VERSION = 'v59.0';
const LEAD_FIELDS = 'Id, FirstName, LastName, Email, Phone, Company, City, State, Country, Title, CreatedDate';

async function refreshSalesforceToken(companyId) {
  const loginUrl = (await getSetting('salesforce_login_url', 'https://login.salesforce.com', companyId)).replace(/\/+$/, '');
  const refreshToken = await getSetting('salesforce_refresh_token', '', companyId);
  const clientId = await getSetting('salesforce_oauth_client_id', '', companyId);
  const clientSecret = await getSetting('salesforce_oauth_client_secret', '', companyId);
  if (!refreshToken) return false;
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret });
  const response = await fetch(`${loginUrl}/services/oauth2/token`, { method: 'POST', body });
  const token = await response.json().catch(() => ({}));
  if (!token.access_token) return false;
  await saveCompanySetting(companyId, 'salesforce_access_token', token.access_token, 'sources');
  if (token.instance_url) await saveCompanySetting(companyId, 'salesforce_instance_url', token.instance_url, 'sources');
  return true;
}

// Salesforce access tokens don't advertise a fixed expiry the way Google's do —
// org session-timeout policy varies and isn't exposed via the API — so refresh
// here is reactive: retry once after a 401 rather than tracking an expiry clock.
async function salesforceRequest(companyId, path, isRetry = false) {
  const instanceUrl = await getSetting('salesforce_instance_url', '', companyId);
  const accessToken = await getSetting('salesforce_access_token', '', companyId);
  if (!instanceUrl || !accessToken) throw new Error('Salesforce is not connected — connect via OAuth first.');
  const url = path.startsWith('http') ? path : `${instanceUrl}${path}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.status === 401 && !isRetry) {
    const refreshed = await refreshSalesforceToken(companyId);
    if (refreshed) return salesforceRequest(companyId, path, true);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(data) ? (data[0]?.message || 'Salesforce API error') : (data.error_description || data.message || `Salesforce API error (HTTP ${response.status})`);
    throw new Error(message);
  }
  return data;
}

async function querySalesforceAll(companyId, soql) {
  let data = await salesforceRequest(companyId, `/services/data/${API_VERSION}/query?q=${encodeURIComponent(soql)}`);
  const records = [...(data.records || [])];
  while (!data.done && data.nextRecordsUrl) {
    data = await salesforceRequest(companyId, data.nextRecordsUrl);
    records.push(...(data.records || []));
  }
  return records;
}

let _salesforceSourceId = null;
async function ensureSalesforceSourceId() {
  if (_salesforceSourceId) return _salesforceSourceId;
  const existing = await one("SELECT id FROM lead_sources WHERE slug='salesforce' LIMIT 1");
  if (existing) { _salesforceSourceId = Number(existing.id); return _salesforceSourceId; }
  const result = await run("INSERT INTO lead_sources (name,slug,category) VALUES ('Salesforce','salesforce','external')");
  _salesforceSourceId = Number(result.insertId);
  return _salesforceSourceId;
}

function mapSalesforceLeadToImport(record) {
  const name = [record.FirstName, record.LastName].filter(Boolean).join(' ').trim() || record.Company || record.Email || 'Salesforce Lead';
  return normalizeImportRow({
    name,
    email: record.Email || '',
    mobile: record.Phone || '',
    company: record.Company || '',
    designation: record.Title || '',
    city: record.City || '',
    state: record.State || '',
    country: record.Country || 'India',
    'Salesforce Lead ID': record.Id ?? '',
  });
}

async function importSalesforceRecords(companyId, req, records, taskNote) {
  const sourceId = await ensureSalesforceSourceId();
  const summary = { total: 0, imported: 0, duplicates: 0, failed: 0, errors: [] };
  for (const record of records) {
    summary.total += 1;
    const normalized = mapSalesforceLeadToImport(record);
    const result = await processLead(normalized, sourceId, null, req, undefined, { skipWelcomeTask: true });
    if (result.success) result.is_duplicate ? summary.duplicates += 1 : summary.imported += 1;
    else {
      summary.failed += 1;
      summary.errors.push(`Lead ${record.Id}: ${Object.values(result.errors).join(', ')}`);
    }
  }
  if (summary.imported > 0) {
    try {
      await run(
        `INSERT INTO tasks (company_id, title, description, priority, due_at) VALUES (?, ?, ?, 'high', NOW())`,
        [companyId, `Review ${summary.imported} leads from Salesforce`, `${taskNote}: ${summary.imported} new lead(s) synced from Salesforce — review and reach out.`]
      );
    } catch (err) {
      console.error('[salesforce] summary task creation failed:', err);
    }
  }
  return summary;
}

export async function syncSalesforceLeads(companyId, req) {
  const records = await querySalesforceAll(companyId, `SELECT ${LEAD_FIELDS} FROM Lead ORDER BY CreatedDate DESC`);
  return importSalesforceRecords(companyId, req, records, 'Manual sync');
}

async function companiesWithSalesforce() {
  const rows = await q("SELECT DISTINCT company_id FROM company_settings WHERE `key`='salesforce_refresh_token' AND `value` <> ''");
  return rows.map((r) => Number(r.company_id));
}

// Salesforce has no simple per-org webhook equivalent to Shopify/HubSpot without
// Platform Events/CometD streaming (a much bigger build) — polling on a
// CreatedDate high-water-mark (mirroring the IMAP UID watermark already used
// elsewhere in this codebase) is the pragmatic "near real-time" middle ground.
export async function pollSalesforceNewLeads(companyId) {
  const lastPollAt = await getSetting('salesforce_last_poll_at', '', companyId);
  const since = lastPollAt || new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const soql = `SELECT ${LEAD_FIELDS} FROM Lead WHERE CreatedDate > ${since} ORDER BY CreatedDate ASC LIMIT 200`;
  const records = await querySalesforceAll(companyId, soql);
  const fakeReq = { companyId, headers: {}, socket: { remoteAddress: '0.0.0.0' } };
  const summary = await importSalesforceRecords(companyId, fakeReq, records, 'Auto-sync');
  if (records.length > 0) {
    await saveCompanySetting(companyId, 'salesforce_last_poll_at', records[records.length - 1].CreatedDate, 'sources');
  }
  return summary;
}

export async function pollAllSalesforceCompanies() {
  const companyIds = await companiesWithSalesforce();
  let processed = 0, imported = 0, errors = 0;
  for (const companyId of companyIds) {
    try {
      const result = await pollSalesforceNewLeads(companyId);
      processed += result.total;
      imported += result.imported;
    } catch (err) {
      errors += 1;
      console.error(`[salesforce-poll] company ${companyId}:`, err.message);
    }
  }
  return { processed, imported, errors };
}

export async function disconnectSalesforce(companyId) {
  await run(
    "DELETE FROM company_settings WHERE company_id=? AND `key` IN ('salesforce_access_token','salesforce_refresh_token','salesforce_instance_url','salesforce_connected_org','salesforce_last_poll_at')",
    [companyId]
  );
  await run("UPDATE integrations SET is_active=0, updated_at=NOW() WHERE company_id=? AND slug='salesforce'", [companyId]);
}
