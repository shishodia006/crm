import { one, q, run } from '../db/pool.js';
import { ok, fail } from '../utils/response.js';

export const APP_CATALOG = [
  { slug: 'hubspot', name: 'HubSpot', type: 'crm', icon: 'bullseye' },
  { slug: 'salesforce', name: 'Salesforce', type: 'crm', icon: 'cloud-fill' },
  { slug: 'mailchimp', name: 'Mailchimp', type: 'marketing', icon: 'envelope-paper-fill' },
  { slug: 'zendesk', name: 'Zendesk', type: 'communication', icon: 'headset' },
  { slug: 'shopify', name: 'Shopify', type: 'marketplace', icon: 'shop' },
  { slug: 'google_sheets', name: 'Google Sheets', type: 'other', icon: 'file-earmark-spreadsheet-fill' },
];
const CATALOG_BY_SLUG = Object.fromEntries(APP_CATALOG.map((a) => [a.slug, a]));

export async function index(req, res) {
  const rows = await q('SELECT * FROM integrations WHERE company_id=?', [req.companyId]);
  const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r]));
  const apps = APP_CATALOG.map((app) => {
    const row = bySlug[app.slug];
    return {
      ...app,
      connected: Boolean(row?.is_active),
      last_sync: row?.last_sync || null,
      status: row?.is_active ? 'active' : 'inactive',
    };
  });
  ok(res, { apps });
}

export async function connect(req, res) {
  const app = CATALOG_BY_SLUG[req.params.slug];
  if (!app) return fail(res, 'Unknown app.', 404);
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
  await run("UPDATE integrations SET is_active=0, updated_at=NOW() WHERE company_id=? AND slug=?", [req.companyId, app.slug]);
  ok(res, null, `${app.name} disconnected.`);
}

export async function sync(req, res) {
  const app = CATALOG_BY_SLUG[req.params.slug];
  if (!app) return fail(res, 'Unknown app.', 404);
  const existing = await one('SELECT id,is_active FROM integrations WHERE company_id=? AND slug=? LIMIT 1', [req.companyId, app.slug]);
  if (!existing || !existing.is_active) return fail(res, `Connect ${app.name} before syncing.`, 422);
  await run('UPDATE integrations SET last_sync=NOW() WHERE id=?', [existing.id]);
  ok(res, null, `${app.name} synced.`);
}
