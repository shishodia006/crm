import { one, q, run } from '../db/pool.js';
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

// Disconnecting the Google account only revokes the OAuth tokens — it deliberately
// does not delete the configured sheet connections below, so reconnecting the same
// (or a different) Google account resumes syncing every sheet without re-entering
// names/ranges. A sync attempted while disconnected just fails with a clear error.
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

function slugify(name) {
  return String(name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'sheet';
}

// lead_sources.slug is unique across every company (it's a shared catalog table,
// scoped per-company only via leads.company_id) — each sheet a company adds needs
// its own globally-unique slug so it shows up as its own row on the Sources page.
async function uniqueSheetSourceSlug(name) {
  const base = `google_sheets_${slugify(name)}`;
  let slug = base;
  let suffix = 1;
  while (await one('SELECT id FROM lead_sources WHERE slug=? LIMIT 1', [slug])) {
    suffix += 1;
    slug = `${base}_${suffix}`;
  }
  return slug;
}

export async function listGoogleSheetConnections(companyId) {
  return q(
    `SELECT c.id, c.name, c.sheet_id, c.range, c.last_synced_at, c.created_at, c.source_id,
            COUNT(l.id) AS lead_count, MAX(l.created_at) AS last_lead_at
       FROM google_sheet_connections c
       LEFT JOIN leads l ON l.source_id = c.source_id AND l.company_id = c.company_id
      WHERE c.company_id = ?
      GROUP BY c.id
      ORDER BY c.created_at ASC`,
    [companyId]
  );
}

export async function createGoogleSheetConnection(companyId, { name, sheetIdOrUrl, range }) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Give this sheet a name.');
  const sheetId = extractSheetId(sheetIdOrUrl);
  if (!sheetId) throw new Error('Paste a Sheet URL or ID.');
  const cleanRange = String(range || '').trim() || 'A1:Z10000';

  const slug = await uniqueSheetSourceSlug(cleanName);
  const sourceResult = await run(
    "INSERT INTO lead_sources (name,slug,category) VALUES (?,?,'external')",
    [`Google Sheets: ${cleanName}`, slug]
  );
  const sourceId = Number(sourceResult.insertId);
  const result = await run(
    'INSERT INTO google_sheet_connections (company_id, source_id, name, sheet_id, `range`) VALUES (?,?,?,?,?)',
    [companyId, sourceId, cleanName, sheetId, cleanRange]
  );
  return { id: Number(result.insertId), source_id: sourceId };
}

export async function updateGoogleSheetConnection(companyId, connectionId, { name, sheetIdOrUrl, range }) {
  const connection = await one('SELECT * FROM google_sheet_connections WHERE id=? AND company_id=? LIMIT 1', [connectionId, companyId]);
  if (!connection) throw new Error('Sheet connection not found.');

  const cleanName = name != null && String(name).trim() ? String(name).trim() : connection.name;
  const sheetId = sheetIdOrUrl ? extractSheetId(sheetIdOrUrl) : connection.sheet_id;
  const cleanRange = range != null && String(range).trim() ? String(range).trim() : connection.range;

  await run('UPDATE google_sheet_connections SET name=?, sheet_id=?, `range`=? WHERE id=?', [cleanName, sheetId, cleanRange, connection.id]);
  await run('UPDATE lead_sources SET name=? WHERE id=?', [`Google Sheets: ${cleanName}`, connection.source_id]);
}

// Leaves the lead_sources row (and every lead already imported through it) intact —
// same convention as disconnecting any other integration: historical leads/analytics
// don't disappear just because the live sync was turned off.
export async function deleteGoogleSheetConnection(companyId, connectionId) {
  await run('DELETE FROM google_sheet_connections WHERE id=? AND company_id=?', [connectionId, companyId]);
}

async function fetchSheetRows(accessToken, sheetId, range) {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `Google Sheets API error (HTTP ${response.status})`);

  const values = data.values || [];
  if (values.length < 2) return [];

  const headers = values[0].map((h) => String(h || '').trim());
  return values.slice(1)
    .map((rowValues) => {
      const record = {};
      headers.forEach((h, i) => { if (h) record[h] = rowValues[i] != null ? String(rowValues[i]).trim() : ''; });
      return record;
    })
    .filter((r) => Object.values(r).some((v) => v !== ''));
}

// Imports rows the same way a CSV/Excel upload does (same header-matching rules,
// same "one summary task not one per row" behavior for a bulk batch) — just sourced
// from a live Google Sheet instead of an uploaded file.
async function importRows(rows, sourceId, req) {
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
  return summary;
}

async function syncOneConnection(connection, accessToken, req) {
  const rows = await fetchSheetRows(accessToken, connection.sheet_id, connection.range || 'A1:Z10000');
  const summary = rows.length ? await importRows(rows, connection.source_id, req) : { total: 0, imported: 0, duplicates: 0, failed: 0, errors: [] };
  await run('UPDATE google_sheet_connections SET last_synced_at=NOW() WHERE id=?', [connection.id]);
  return summary;
}

async function createSyncTask(companyId, title, imported) {
  try {
    await run(
      `INSERT INTO tasks (company_id, title, description, priority, due_at) VALUES (?, ?, ?, 'high', NOW())`,
      [companyId, title, `Synced ${imported} new lead(s) from your connected Google Sheet(s) — review and reach out.`]
    );
  } catch (err) {
    console.error('[googleSheets] summary task creation failed:', err);
  }
}

// Syncs a single named sheet — used by the "Sync" button on that sheet's row.
export async function syncGoogleSheetConnection(companyId, connectionId, req) {
  const accessToken = await refreshAccessTokenIfNeeded(companyId);
  if (!accessToken) throw new Error('Google Sheets is not connected — connect via OAuth first.');

  const connection = await one('SELECT * FROM google_sheet_connections WHERE id=? AND company_id=? LIMIT 1', [connectionId, companyId]);
  if (!connection) throw new Error('Sheet connection not found.');

  const summary = await syncOneConnection(connection, accessToken, req);
  if (summary.imported > 0) await createSyncTask(companyId, `Review ${summary.imported} leads from "${connection.name}" (Google Sheets)`, summary.imported);
  return summary;
}

// Syncs every configured sheet for the company — used by the generic Third Party
// Apps "Sync Now" button/cron path, which only knows about one sync per provider slug.
export async function syncAllGoogleSheetConnections(companyId, req) {
  const accessToken = await refreshAccessTokenIfNeeded(companyId);
  if (!accessToken) throw new Error('Google Sheets is not connected — connect via OAuth first.');

  const connections = await q('SELECT * FROM google_sheet_connections WHERE company_id=?', [companyId]);
  if (connections.length === 0) throw new Error('No Google Sheet configured yet — add one first.');

  const totals = { total: 0, imported: 0, duplicates: 0, failed: 0, errors: [] };
  for (const connection of connections) {
    try {
      const summary = await syncOneConnection(connection, accessToken, req);
      totals.total += summary.total;
      totals.imported += summary.imported;
      totals.duplicates += summary.duplicates;
      totals.failed += summary.failed;
      totals.errors.push(...summary.errors.map((e) => `[${connection.name}] ${e}`));
    } catch (err) {
      totals.errors.push(`[${connection.name}] ${err.message}`);
    }
  }

  if (totals.imported > 0) await createSyncTask(companyId, `Review ${totals.imported} leads from Google Sheets`, totals.imported);
  return totals;
}
