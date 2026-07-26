import { one, run, q } from '../db/pool.js';
import { getSetting, saveCompanySetting } from './settings.service.js';
import { normalizeImportRow, processLead } from './lead.service.js';

async function refreshLinkedinToken(companyId) {
  const refreshToken = await getSetting('linkedin_refresh_token', '', companyId);
  const clientId = await getSetting('linkedin_oauth_client_id', '', companyId);
  const clientSecret = await getSetting('linkedin_oauth_client_secret', '', companyId);
  if (!refreshToken) return false;
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret });
  const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', { method: 'POST', body });
  const token = await response.json().catch(() => ({}));
  if (!token.access_token) return false;
  await saveCompanySetting(companyId, 'linkedin_access_token', token.access_token, 'sources');
  await saveCompanySetting(companyId, 'linkedin_token_expires_at', String(Date.now() + Number(token.expires_in || 3600) * 1000), 'sources');
  return true;
}

// LinkedIn's Lead Sync API (r_ads_leadgen_automation scope) is gated behind
// Marketing Developer Platform partner approval — this OAuth+polling code is
// correct against LinkedIn's general REST conventions, but the exact
// leadFormResponses resource shape should be re-verified against LinkedIn's
// current Marketing API docs once your app is actually approved, since access
// to test it isn't available generally.
async function linkedinRequest(companyId, path, isRetry = false) {
  const accessToken = await getSetting('linkedin_access_token', '', companyId);
  if (!accessToken) throw new Error('LinkedIn is not connected — connect via OAuth first.');
  const response = await fetch(`https://api.linkedin.com${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': '202401',
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });
  if (response.status === 401 && !isRetry) {
    const refreshed = await refreshLinkedinToken(companyId);
    if (refreshed) return linkedinRequest(companyId, path, true);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || `LinkedIn API error (HTTP ${response.status}) — if this is a 403, your app likely doesn't have Lead Sync / Marketing Developer Platform approval yet.`);
  }
  return data;
}

let _linkedinSourceId = null;
async function ensureLinkedinSourceId() {
  if (_linkedinSourceId) return _linkedinSourceId;
  const existing = await one("SELECT id FROM lead_sources WHERE slug='linkedin' LIMIT 1");
  if (existing) { _linkedinSourceId = Number(existing.id); return _linkedinSourceId; }
  const result = await run("INSERT INTO lead_sources (name,slug,category) VALUES ('LinkedIn Lead Gen','linkedin','advertising')");
  _linkedinSourceId = Number(result.insertId);
  return _linkedinSourceId;
}

function mapLinkedinResponseToLead(response) {
  const answers = response.formResponse?.answers || response.answers || [];
  const flat = {};
  for (const answer of answers) {
    const question = (answer.questionName || answer.question || '').toLowerCase();
    flat[question] = answer.answer || answer.textAnswer || '';
  }
  return normalizeImportRow({
    ...flat,
    'LinkedIn Response ID': response.id ?? response.leadFormResponseId ?? '',
  });
}

async function importLinkedinResponses(companyId, req, responses) {
  const sourceId = await ensureLinkedinSourceId();
  const summary = { total: 0, imported: 0, duplicates: 0, failed: 0, errors: [] };
  for (const response of responses) {
    summary.total += 1;
    const normalized = mapLinkedinResponseToLead(response);
    const result = await processLead(normalized, sourceId, null, req, undefined, { skipWelcomeTask: true });
    if (result.success) result.is_duplicate ? summary.duplicates += 1 : summary.imported += 1;
    else {
      summary.failed += 1;
      summary.errors.push(`Response ${summary.total}: ${Object.values(result.errors).join(', ')}`);
    }
  }
  if (summary.imported > 0) {
    try {
      await run(
        `INSERT INTO tasks (company_id, title, description, priority, due_at) VALUES (?, ?, ?, 'high', NOW())`,
        [companyId, `Review ${summary.imported} leads from LinkedIn`, `Synced ${summary.imported} new lead(s) from LinkedIn Lead Gen Forms — review and reach out.`]
      );
    } catch (err) {
      console.error('[linkedin] summary task creation failed:', err);
    }
  }
  return summary;
}

export async function syncLinkedinLeads(companyId, req) {
  const orgUrn = await getSetting('linkedin_org_urn', '', companyId);
  if (!orgUrn) throw new Error('Enter your LinkedIn Organization URN first.');
  const data = await linkedinRequest(companyId, `/rest/leadFormResponses?q=owner&owner=${encodeURIComponent(orgUrn)}`);
  const responses = data.elements || [];
  return importLinkedinResponses(companyId, req, responses);
}

async function companiesWithLinkedin() {
  const rows = await q("SELECT DISTINCT company_id FROM company_settings WHERE `key`='linkedin_refresh_token' AND `value` <> ''");
  return rows.map((r) => Number(r.company_id));
}

export async function pollLinkedinNewLeads(companyId) {
  const orgUrn = await getSetting('linkedin_org_urn', '', companyId);
  if (!orgUrn) return { total: 0, imported: 0, duplicates: 0, failed: 0, errors: [] };
  const lastPollAt = await getSetting('linkedin_last_poll_at', '', companyId);
  const sinceMs = lastPollAt ? Number(lastPollAt) : Date.now() - 24 * 3600 * 1000;
  const data = await linkedinRequest(companyId, `/rest/leadFormResponses?q=owner&owner=${encodeURIComponent(orgUrn)}`);
  const responses = (data.elements || []).filter((r) => Number(r.submittedAt || r.submitted_at || 0) > sinceMs);
  const fakeReq = { companyId, headers: {}, socket: { remoteAddress: '0.0.0.0' } };
  const summary = await importLinkedinResponses(companyId, fakeReq, responses);
  await saveCompanySetting(companyId, 'linkedin_last_poll_at', String(Date.now()), 'sources');
  return summary;
}

export async function pollAllLinkedinCompanies() {
  const companyIds = await companiesWithLinkedin();
  let processed = 0, imported = 0, errors = 0;
  for (const companyId of companyIds) {
    try {
      const result = await pollLinkedinNewLeads(companyId);
      processed += result.total;
      imported += result.imported;
    } catch (err) {
      errors += 1;
      console.error(`[linkedin-poll] company ${companyId}:`, err.message);
    }
  }
  return { processed, imported, errors };
}

export async function disconnectLinkedin(companyId) {
  await run(
    "DELETE FROM company_settings WHERE company_id=? AND `key` IN ('linkedin_access_token','linkedin_refresh_token','linkedin_token_expires_at','linkedin_connected_account','linkedin_last_poll_at')",
    [companyId]
  );
}
