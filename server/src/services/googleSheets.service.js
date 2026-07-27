import { one, run } from '../db/pool.js';
import { getSetting, saveCompanySetting } from './settings.service.js';
import { normalizeImportRow, processLead } from './lead.service.js';
import { config } from '../config/index.js';

// Google Sheets credentials/tokens are company-scoped (saveCompanySetting), unlike
// the pre-existing Gmail/Outlook OAuth code which reads/writes the global `settings`
// table — every lookup and write here must carry companyId or it'll silently miss
// values saved through the Settings UI, the same bug that already affects Gmail/Outlook.
async function refreshAccessTokenIfNeeded(companyId) {
  const expiresAt = Number(await getSetting('google_sheets_token_expires_at', '0', companyId));
  const accessToken = await getSetting('google_sheets_access_token', '', companyId);
  if (accessToken && expiresAt && Date.now() < expiresAt - 60000) return accessToken;

  const refreshToken = await getSetting('google_sheets_refresh_token', '', companyId);
  if (!refreshToken) return null;

  const body = new URLSearchParams({
    client_id: config.googleSheets.clientId,
    client_secret: config.googleSheets.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body });
  const token = await response.json().catch(() => ({}));
  if (!token.access_token) return null;

  await saveCompanySetting(companyId, 'google_sheets_access_token', token.access_token, 'sources');
  await saveCompanySetting(companyId, 'google_sheets_token_expires_at', String(Date.now() + Number(token.expires_in || 3600) * 1000), 'sources');
  return token.access_token;
}

export async function disconnectGoogleSheets(companyId) {
  await run(
    "DELETE FROM company_settings WHERE company_id=? AND `key` IN ('google_sheets_access_token','google_sheets_refresh_token','google_sheets_token_expires_at','google_sheets_email')",
    [companyId]
  );
  await run("UPDATE integrations SET is_active=0, updated_at=NOW() WHERE company_id=? AND slug='google_sheets'", [companyId]);
}

// Accepts either a bare Sheet ID or a full URL like
// https://docs.google.com/spreadsheets/d/<id>/edit#gid=0
function extractSheetId(input) {
  const raw = String(input || '').trim();
  const match = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : raw;
}

let _sheetsSourceId = null;
async function ensureGoogleSheetsSourceId() {
  if (_sheetsSourceId) return _sheetsSourceId;
  const existing = await one("SELECT id FROM lead_sources WHERE slug='google_sheets' LIMIT 1");
  if (existing) { _sheetsSourceId = Number(existing.id); return _sheetsSourceId; }
  const result = await run("INSERT INTO lead_sources (name,slug,category) VALUES ('Google Sheets','google_sheets','external')");
  _sheetsSourceId = Number(result.insertId);
  return _sheetsSourceId;
}

// Pulls every row from the connected sheet and imports it the same way a CSV/Excel
// upload does (same header-matching rules, same "one summary task not one per row"
// behavior for a bulk batch) — just sourced from a live Google Sheet instead of an
// uploaded file.
export async function syncGoogleSheetLeads(companyId, req) {
  const accessToken = await refreshAccessTokenIfNeeded(companyId);
  if (!accessToken) throw new Error('Google Sheets is not connected — connect via OAuth first.');

  const sheetIdRaw = await getSetting('google_sheets_id', '', companyId);
  const sheetId = extractSheetId(sheetIdRaw);
  if (!sheetId) throw new Error('No Google Sheet configured yet — paste a Sheet URL or ID first.');

  const range = (await getSetting('google_sheets_range', 'A1:Z10000', companyId)) || 'A1:Z10000';
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `Google Sheets API error (HTTP ${response.status})`);

  const values = data.values || [];
  if (values.length < 2) return { total: 0, imported: 0, duplicates: 0, failed: 0, errors: [] };

  const headers = values[0].map((h) => String(h || '').trim());
  const rows = values.slice(1)
    .map((rowValues) => {
      const record = {};
      headers.forEach((h, i) => { if (h) record[h] = rowValues[i] != null ? String(rowValues[i]).trim() : ''; });
      return record;
    })
    .filter((r) => Object.values(r).some((v) => v !== ''));

  const sourceId = await ensureGoogleSheetsSourceId();
  const summary = { total: 0, imported: 0, duplicates: 0, failed: 0, errors: [] };
  for (const row of rows) {
    summary.total += 1;
    const result = await processLead(normalizeImportRow(row), sourceId, null, req, undefined, { skipWelcomeTask: true });
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
        [companyId, `Review ${summary.imported} leads from Google Sheets`, `Synced ${summary.imported} new lead(s) from your connected Google Sheet — review and reach out.`]
      );
    } catch (err) {
      console.error('[syncGoogleSheetLeads] summary task creation failed:', err);
    }
  }

  return summary;
}
