import crypto from 'crypto';
import { one, run } from '../db/pool.js';
import { safeEquals } from '../utils/crypto.js';
import { ipAddress } from '../utils/helpers.js';
import { getSetting, saveCompanySetting, resolveCompanyByShopDomain } from './settings.service.js';
import { normalizeImportRow, processLead } from './lead.service.js';

const SHOPIFY_API_VERSION = '2024-01';
const WEBHOOK_TOPICS = ['customers/create', 'customers/update', 'orders/create'];

function shopifyBaseUrl(shopDomain) {
  return `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}`;
}

async function shopifyFetch(companyId, path, opts = {}) {
  const shopDomain = await getSetting('shopify_shop_domain', '', companyId);
  const token = await getSetting('shopify_admin_token', '', companyId);
  if (!shopDomain || !token) throw new Error('Shopify is not connected — add your store domain and Admin API token first.');
  const url = path.startsWith('http') ? path : `${shopifyBaseUrl(shopDomain)}${path}`;
  const response = await fetch(url, {
    method: opts.method || 'GET',
    headers: { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' },
    body: opts.body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.errors ? JSON.stringify(data.errors) : `Shopify API error (HTTP ${response.status})`);
  return { data, response };
}

function parseNextLink(linkHeader) {
  if (!linkHeader) return null;
  const next = linkHeader.split(',').map((s) => s.trim()).find((s) => s.endsWith('rel="next"'));
  const match = next && next.match(/<([^>]+)>/);
  return match ? match[1] : null;
}

// Shopify paginates via a Link header (not page numbers), and enforces a ~2 req/sec
// leaky-bucket rate limit on the REST Admin API — the delay between pages keeps a
// large store's full customer/order sync from tripping a 429.
async function fetchAllPages(companyId, initialPath) {
  let path = initialPath;
  let arrayKey = null;
  const items = [];
  while (path) {
    const { data, response } = await shopifyFetch(companyId, path);
    arrayKey = arrayKey || Object.keys(data).find((k) => Array.isArray(data[k]));
    if (arrayKey) items.push(...(data[arrayKey] || []));
    path = parseNextLink(response.headers.get('link'));
    if (path) await new Promise((r) => setTimeout(r, 550));
  }
  return items;
}

let _shopifySourceId = null;
async function ensureShopifySourceId() {
  if (_shopifySourceId) return _shopifySourceId;
  const existing = await one("SELECT id FROM lead_sources WHERE slug='shopify' LIMIT 1");
  if (existing) { _shopifySourceId = Number(existing.id); return _shopifySourceId; }
  const result = await run("INSERT INTO lead_sources (name,slug,category) VALUES ('Shopify','shopify','marketplace')");
  _shopifySourceId = Number(result.insertId);
  return _shopifySourceId;
}

function mapShopifyCustomerToLead(customer, latestOrder) {
  const addr = customer.default_address || {};
  const name = [customer.first_name, customer.last_name].filter(Boolean).join(' ').trim()
    || customer.email || customer.phone || 'Shopify Customer';
  const lineItems = (latestOrder?.line_items || [])
    .map((li) => `${li.title}${li.quantity > 1 ? ` x${li.quantity}` : ''}`)
    .join(', ');
  return normalizeImportRow({
    name,
    email: customer.email || '',
    mobile: customer.phone || addr.phone || '',
    company: addr.company || '',
    city: addr.city || '',
    state: addr.province || '',
    country: addr.country || 'India',
    product_interest: lineItems,
    'Shopify Customer ID': customer.id ?? '',
    'Orders Count': customer.orders_count ?? '',
    'Total Spent': customer.total_spent ?? '',
    'Last Order Total': latestOrder ? `${latestOrder.total_price} ${latestOrder.currency}` : '',
    Tags: customer.tags || '',
  });
}

export async function verifyAndActivateShopify(companyId) {
  const shopDomain = await getSetting('shopify_shop_domain', '', companyId);
  const token = await getSetting('shopify_admin_token', '', companyId);
  if (!shopDomain || !token) throw new Error('Enter your Shopify store domain and Admin API access token first.');

  const { data } = await shopifyFetch(companyId, '/shop.json');
  if (!data.shop) throw new Error('Could not verify Shopify credentials — check the domain and token.');

  const configJson = JSON.stringify({ shop: data.shop.domain || shopDomain, name: data.shop.name || '' });
  const existing = await one('SELECT id FROM integrations WHERE company_id=? AND slug=? LIMIT 1', [companyId, 'shopify']);
  if (existing) await run('UPDATE integrations SET is_active=1, config=?, updated_at=NOW() WHERE id=?', [configJson, existing.id]);
  else await run('INSERT INTO integrations (company_id,name,slug,type,is_active,config) VALUES (?,?,?,?,1,?)', [companyId, 'Shopify', 'shopify', 'marketplace', configJson]);
  // Mirrors google_sheets_email: a company-scoped setting the Integrations
  // Settings UI can read directly (via /api/settings/integrations) to show a
  // persistent "Connected" badge, without needing to also call /api/settings/apps.
  await saveCompanySetting(companyId, 'shopify_connected_shop', data.shop.name || data.shop.domain || shopDomain, 'sources');

  let webhookStatus = 'skipped';
  try {
    const base = await getSetting('shopify_webhook_base_url', '', companyId);
    if (base) { await registerShopifyWebhooks(companyId, base); webhookStatus = 'registered'; }
  } catch (err) {
    console.error('[shopify] webhook registration failed:', err.message);
    webhookStatus = 'failed';
  }
  return { shop: data.shop.domain, webhookStatus };
}

export async function registerShopifyWebhooks(companyId, baseUrlOverride) {
  const base = (baseUrlOverride || await getSetting('shopify_webhook_base_url', '', companyId)).replace(/\/+$/, '');
  if (!base) return { registered: [] };
  const address = `${base}/webhook/shopify`;
  const registered = [];
  for (const topic of WEBHOOK_TOPICS) {
    try {
      await shopifyFetch(companyId, '/webhooks.json', { method: 'POST', body: JSON.stringify({ webhook: { topic, address, format: 'json' } }) });
      registered.push(topic);
    } catch (err) {
      // Shopify returns 422 "has already been taken" when a webhook for this
      // topic+address already exists — re-running Connect isn't a real failure.
      if (!String(err.message).includes('already been taken')) {
        console.error(`[shopify] failed to register webhook ${topic}:`, err.message);
      }
    }
  }
  return { registered };
}

export async function unregisterShopifyWebhooks(companyId) {
  const base = (await getSetting('shopify_webhook_base_url', '', companyId)).replace(/\/+$/, '');
  if (!base) return;
  const address = `${base}/webhook/shopify`;
  try {
    const { data } = await shopifyFetch(companyId, '/webhooks.json');
    const toDelete = (data.webhooks || []).filter((w) => w.address === address);
    for (const w of toDelete) {
      try { await shopifyFetch(companyId, `/webhooks/${w.id}.json`, { method: 'DELETE' }); } catch { /* best-effort */ }
    }
  } catch (err) {
    console.error('[shopify] failed to list/delete webhooks during disconnect:', err.message);
  }
}

export async function disconnectShopify(companyId) {
  await unregisterShopifyWebhooks(companyId);
  await run("UPDATE integrations SET is_active=0, updated_at=NOW() WHERE company_id=? AND slug='shopify'", [companyId]);
  await saveCompanySetting(companyId, 'shopify_connected_shop', '', 'sources');
}

export async function syncShopifyLeads(companyId, req) {
  const customers = await fetchAllPages(companyId, '/customers.json?limit=250');
  const orders = await fetchAllPages(companyId, '/orders.json?status=any&limit=250');

  const latestOrderByCustomerId = {};
  for (const order of orders) {
    const custId = order.customer?.id;
    if (!custId) continue;
    const existing = latestOrderByCustomerId[custId];
    if (!existing || new Date(order.created_at) > new Date(existing.created_at)) latestOrderByCustomerId[custId] = order;
  }

  const sourceId = await ensureShopifySourceId();
  const summary = { total: 0, imported: 0, duplicates: 0, failed: 0, errors: [] };
  for (const customer of customers) {
    summary.total += 1;
    const normalized = mapShopifyCustomerToLead(customer, latestOrderByCustomerId[customer.id]);
    const result = await processLead(normalized, sourceId, null, req, undefined, { skipWelcomeTask: true });
    if (result.success) result.is_duplicate ? summary.duplicates += 1 : summary.imported += 1;
    else {
      summary.failed += 1;
      summary.errors.push(`Customer ${customer.id}: ${Object.values(result.errors).join(', ')}`);
    }
  }

  if (summary.imported > 0) {
    try {
      await run(
        `INSERT INTO tasks (company_id, title, description, priority, due_at) VALUES (?, ?, ?, 'high', NOW())`,
        [companyId, `Review ${summary.imported} leads from Shopify`, `Synced ${summary.imported} new customer(s) from your connected Shopify store — review and reach out.`]
      );
    } catch (err) {
      console.error('[syncShopifyLeads] summary task creation failed:', err);
    }
  }

  return summary;
}

// Handles customers/create, customers/update and orders/create webhooks — kept
// entirely separate from the generic webhook() dispatch in public.controller.js
// since Shopify signs with its own header/scheme (X-Shopify-Hmac-Sha256, base64,
// never a GET verification handshake) rather than the hub-signature convention
// the rest of that file assumes.
export async function handleShopifyWebhook(req, res) {
  const hmacHeader = req.get('x-shopify-hmac-sha256') || '';
  const shopDomain = req.get('x-shopify-shop-domain') || '';
  const topic = req.get('x-shopify-topic') || '';

  const companyId = await resolveCompanyByShopDomain(shopDomain);
  if (!companyId) return res.status(404).json({ status: 'unknown_shop' });

  const secret = await getSetting('shopify_api_secret', '', companyId);
  const digest = secret ? crypto.createHmac('sha256', secret).update(req.rawBody || '', 'utf8').digest('base64') : '';
  if (!secret || !safeEquals(digest, hmacHeader)) return res.status(401).json({ status: 'invalid_signature' });

  const logResult = await run('INSERT INTO webhook_logs (source,event,payload,status,ip) VALUES (?,?,?,?,?)',
    ['shopify', topic, req.rawBody || JSON.stringify(req.body || {}), 'received', ipAddress(req)]);

  const fakeReq = { companyId, headers: req.headers, socket: req.socket };
  try {
    const payload = req.body || {};
    let leadResult = null;
    if (topic === 'customers/create' || topic === 'customers/update') {
      const normalized = mapShopifyCustomerToLead(payload, null);
      leadResult = await processLead(normalized, await ensureShopifySourceId(), null, fakeReq);
    } else if (topic === 'orders/create') {
      const email = payload.email || payload.customer?.email || '';
      const phone = payload.phone || payload.customer?.phone || '';
      if (email || phone) {
        const normalized = mapShopifyCustomerToLead(payload.customer || { email, phone }, payload);
        leadResult = await processLead(normalized, await ensureShopifySourceId(), null, fakeReq);
      }
    }
    await run('UPDATE webhook_logs SET status=? WHERE id=?', [leadResult?.success ? 'processed' : 'ignored', logResult.insertId]);
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[shopify webhook] processing error:', err);
    await run('UPDATE webhook_logs SET status=?, error=? WHERE id=?', ['failed', String(err.stack || err.message || err).slice(0, 2000), logResult.insertId]).catch(() => {});
    res.status(200).json({ status: 'error', message: 'Logged for review.' });
  }
}
