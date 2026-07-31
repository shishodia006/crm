import { one, q, run } from '../db/pool.js';
import { ok, fail } from '../utils/response.js';
import {
  syncAllGoogleSheetConnections, disconnectGoogleSheets,
  listGoogleSheetConnections, createGoogleSheetConnection,
  updateGoogleSheetConnection, deleteGoogleSheetConnection, syncGoogleSheetConnection,
} from '../services/googleSheets.service.js';
import { verifyAndActivateShopify, syncShopifyLeads, disconnectShopify } from '../services/shopify.service.js';
import { verifyAndActivateHubspot, syncHubspotLeads, disconnectHubspot } from '../services/hubspot.service.js';
import { syncSalesforceLeads, disconnectSalesforce } from '../services/salesforce.service.js';
import { verifyAndActivateMailchimp, syncMailchimpLeads, disconnectMailchimp } from '../services/mailchimp.service.js';
import { verifyAndActivateZendesk, syncZendeskLeads, disconnectZendesk } from '../services/zendesk.service.js';

export const APP_CATALOG = [
  { slug: 'hubspot', name: 'HubSpot', type: 'crm', icon: 'bullseye' },
  { slug: 'salesforce', name: 'Salesforce', type: 'crm', icon: 'cloud-fill' },
  { slug: 'mailchimp', name: 'Mailchimp', type: 'marketing', icon: 'envelope-paper-fill' },
  { slug: 'zendesk', name: 'Zendesk', type: 'communication', icon: 'headset' },
  { slug: 'shopify', name: 'Shopify', type: 'marketplace', icon: 'shop' },
  { slug: 'google_sheets', name: 'Google Sheets', type: 'other', icon: 'file-earmark-spreadsheet-fill' },
];
const CATALOG_BY_SLUG = Object.fromEntries(APP_CATALOG.map((a) => [a.slug, a]));

// Everything here has a real backend; anything in APP_CATALOG but not listed
// (Zendesk's fictional siblings, if any get added later) falls through to the
// old fake connect/disconnect/sync below until it gets a real implementation.
// google_sheets/salesforce are oauthOnly — connect happens via the browser
// redirect flow in public.controller.js, not this JSON endpoint.
const REAL_INTEGRATIONS = {
  google_sheets: { oauthOnly: true, sync: syncAllGoogleSheetConnections, disconnect: disconnectGoogleSheets },
  salesforce: { oauthOnly: true, sync: syncSalesforceLeads, disconnect: disconnectSalesforce },
  shopify: { connect: verifyAndActivateShopify, sync: syncShopifyLeads, disconnect: disconnectShopify },
  hubspot: { connect: verifyAndActivateHubspot, sync: syncHubspotLeads, disconnect: disconnectHubspot },
  mailchimp: { connect: verifyAndActivateMailchimp, sync: syncMailchimpLeads, disconnect: disconnectMailchimp },
  zendesk: { connect: verifyAndActivateZendesk, sync: syncZendeskLeads, disconnect: disconnectZendesk },
};

export async function index(req, res) {
  const rows = await q('SELECT * FROM integrations WHERE company_id=?', [req.companyId]);
  const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r]));
  const apps = APP_CATALOG.map((app) => {
    const row = bySlug[app.slug];
    let config = null;
    if (row?.config) { try { config = JSON.parse(row.config); } catch { /* leave null */ } }
    return {
      ...app,
      connected: Boolean(row?.is_active),
      last_sync: row?.last_sync || null,
      status: row?.is_active ? 'active' : 'inactive',
      config,
    };
  });
  ok(res, { apps });
}

export async function connect(req, res) {
  const app = CATALOG_BY_SLUG[req.params.slug];
  if (!app) return fail(res, 'Unknown app.', 404);
  const real = REAL_INTEGRATIONS[app.slug];
  if (real?.oauthOnly) return fail(res, `Use the "Connect with ${app.name}" button to authorize.`, 400);
  if (real?.connect) {
    try {
      const result = await real.connect(req.companyId);
      return ok(res, result, `${app.name} connected.`);
    } catch (err) {
      return fail(res, err.message, 422);
    }
  }
  const existing = await one('SELECT id FROM integrations WHERE company_id=? AND slug=? LIMIT 1', [req.companyId, app.slug]);
  if (existing) {
    await run("UPDATE integrations SET is_active=1, updated_at=NOW() WHERE id=?", [existing.id]);
    return ok(res, { id: existing.id }, `${app.name} connected.`);
  }
  const result = await run(
    'INSERT INTO integrations (company_id,name,slug,type,is_active) VALUES (?,?,?,?,1)',
    [req.companyId, app.name, app.slug, app.type]
  );
  ok(res, { id: result.insertId }, `${app.name} connected.`);
}

export async function disconnect(req, res) {
  const app = CATALOG_BY_SLUG[req.params.slug];
  if (!app) return fail(res, 'Unknown app.', 404);
  const real = REAL_INTEGRATIONS[app.slug];
  if (real?.disconnect) {
    await real.disconnect(req.companyId);
    return ok(res, null, `${app.name} disconnected.`);
  }
  await run("UPDATE integrations SET is_active=0, updated_at=NOW() WHERE company_id=? AND slug=?", [req.companyId, app.slug]);
  ok(res, null, `${app.name} disconnected.`);
}

export async function sync(req, res) {
  const app = CATALOG_BY_SLUG[req.params.slug];
  if (!app) return fail(res, 'Unknown app.', 404);
  const existing = await one('SELECT id,is_active FROM integrations WHERE company_id=? AND slug=? LIMIT 1', [req.companyId, app.slug]);
  if (!existing || !existing.is_active) return fail(res, `Connect ${app.name} before syncing.`, 422);
  const real = REAL_INTEGRATIONS[app.slug];
  if (real?.sync) {
    const summary = await real.sync(req.companyId, req);
    await run('UPDATE integrations SET last_sync=NOW() WHERE id=?', [existing.id]);
    return ok(res, summary, `Synced ${summary.imported} new lead(s) from ${app.name}.`);
  }
  await run('UPDATE integrations SET last_sync=NOW() WHERE id=?', [existing.id]);
  ok(res, null, `${app.name} synced.`);
}

// Google Sheets is the one lead source where a company can configure more than
// one live connection (multiple spreadsheets, each its own Lead Source) instead
// of a single provider-wide credential — these routes manage that list directly
// rather than going through the generic connect/disconnect/sync-by-slug flow above.
export async function listGoogleSheets(req, res) {
  ok(res, { connections: await listGoogleSheetConnections(req.companyId) });
}

export async function createGoogleSheet(req, res) {
  try {
    const result = await createGoogleSheetConnection(req.companyId, req.body || {});
    ok(res, result, 'Sheet added.');
  } catch (err) {
    fail(res, err.message, 422);
  }
}

export async function updateGoogleSheet(req, res) {
  try {
    await updateGoogleSheetConnection(req.companyId, Number(req.params.id), req.body || {});
    ok(res, null, 'Sheet updated.');
  } catch (err) {
    fail(res, err.message, 422);
  }
}

export async function deleteGoogleSheet(req, res) {
  await deleteGoogleSheetConnection(req.companyId, Number(req.params.id));
  ok(res, null, 'Sheet removed.');
}

export async function syncGoogleSheet(req, res) {
  try {
    const summary = await syncGoogleSheetConnection(req.companyId, Number(req.params.id), req);
    ok(res, summary, `Synced ${summary.imported} new lead(s).`);
  } catch (err) {
    fail(res, err.message, 422);
  }
}
