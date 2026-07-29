import { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api.js';
import { useToast } from '../../hooks/useToast.js';
import { useConfirm } from '../../hooks/useConfirm.js';
import LoadingBox from '../../components/common/LoadingBox.jsx';
import PasswordInput from '../../components/common/PasswordInput.jsx';

/* ── Helpers ─────────────────────────────────────────── */
const Field = ({ label, name, type = 'text', value, onChange, readOnly, hint }) => (
  <div className="mb-3">
    <label className="crm-label">{label}</label>
    {type === 'password' && !readOnly ? (
      <PasswordInput
        className="form-control crm-input"
        value={value ?? ''}
        onChange={(e) => onChange(name, e.target.value)}
      />
    ) : (
      <input
        type={type}
        className="form-control crm-input"
        value={value ?? ''}
        readOnly={readOnly}
        onChange={readOnly ? undefined : (e) => onChange(name, e.target.value)}
      />
    )}
    {hint && <div className="form-text text-11">{hint}</div>}
  </div>
);

const Select = ({ label, name, value, options, onChange }) => (
  <div className="mb-3">
    <label className="crm-label">{label}</label>
    <select
      className="form-select crm-select"
      value={value ?? ''}
      onChange={(e) => onChange(name, e.target.value)}
    >
      {options.map(({ value: v, label: l }) => <option key={v} value={v}>{l}</option>)}
    </select>
  </div>
);

const Card = ({ icon, title, badge, children }) => (
  <div className="card crm-int-card mb-4">
    <div className="card-body p-4">
      {(icon || title) && (
        <div className="d-flex align-items-center gap-2 mb-4">
          {icon && <i className={`bi bi-${icon} crm-int-icon`} />}
          <h6 className="crm-int-card-title mb-0">{title}</h6>
          {badge && <span className="badge badge-source badge-crm ms-1">{badge}</span>}
        </div>
      )}
      {children}
    </div>
  </div>
);

function TestAnantya({ apiKey }) {
  const toast = useToast();
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState(null); // null | 'ok' | 'fail'

  const test = async () => {
    if (!apiKey) { toast('Enter your API key first.', 'warning'); return; }
    setTesting(true);
    setStatus(null);
    try {
      const res = await api.get(`/api/templates/wa-sync?key=${encodeURIComponent(apiKey)}`);
      const count = res?.total ?? (Array.isArray(res?.templates) ? res.templates.length : 0);
      setStatus('ok');
      toast(`Connected! ${count} template(s) found on Anantya.`, 'success');
    } catch (err) {
      setStatus('fail');
      toast(`Connection failed: ${err.message}`, 'danger');
    } finally {
      setTesting(false);
    }
  };

  return (
    <button type="button" className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1" onClick={test} disabled={testing}>
      {testing
        ? <><span className="spinner-border spinner-border-sm" />Testing…</>
        : status === 'ok'
          ? <><i className="bi bi-check-circle-fill text-success" />Connected</>
          : status === 'fail'
            ? <><i className="bi bi-x-circle-fill text-danger" />Failed — Retry</>
            : <><i className="bi bi-wifi" />Test Connection</>
      }
    </button>
  );
}

const SaveBtn = ({ saving, label = 'Save', onClick }) => (
  <button type="button" className="btn btn-crm" disabled={saving} onClick={onClick}>
    {saving ? <><span className="spinner-border spinner-border-sm me-1" />Saving…</> : label}
  </button>
);

const APP_URL = (import.meta.env.VITE_API_BASE || 'http://localhost:8090');
// OAuth redirects (Gmail/Outlook/Google Sheets) land back on whatever origin the
// browser is actually on — unlike APP_URL above, which points at the backend
// directly for webhook URLs the *provider's servers* call, not the browser.
const FRONTEND_URL = window.location.origin;

function GoogleSheetsCard({ form, set, saving, save, toast }) {
  const [disconnecting, setDisconnecting] = useState(false);
  const connectedEmail = form.google_sheets_email;

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await api.post('/api/settings/apps/google_sheets/disconnect');
      set('google_sheets_email', '');
      toast('Google Sheets disconnected.', 'success');
    } catch (err) {
      toast(err.message || 'Could not disconnect.', 'danger');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Card icon="file-earmark-spreadsheet-fill" title="Google Sheets" badge={connectedEmail ? 'Connected' : undefined}>
        <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
          {connectedEmail ? (
            <>
              <span className="badge badge-crm badge-live d-inline-flex align-items-center gap-1">
                <i className="bi bi-check-circle-fill" />{connectedEmail}
              </span>
              <button type="button" className="btn btn-outline-danger btn-sm" onClick={disconnect} disabled={disconnecting}>
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </>
          ) : (
            <a href="/oauth/google_sheets" className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1">
              <i className="bi bi-google" />Connect with Google
            </a>
          )}
        </div>

        <hr className="my-3" />
        <Field label="Sheet URL or ID" name="google_sheets_id" value={form.google_sheets_id} onChange={set}
          hint="Paste the full Google Sheets URL, or just the Sheet ID." />
        <Field label="Range" name="google_sheets_range" value={form.google_sheets_range || 'A1:Z10000'} onChange={set}
          hint="First row must be column headers (Name, Email, Mobile, Company…). Default covers most sheets." />
        <SaveBtn saving={saving} label="Save Sheet"
          onClick={() => save(['google_sheets_id', 'google_sheets_range'])} />
        <p className="text-muted text-11 mt-2 mb-0">
          Share the sheet with the connected Google account above (or make it viewable by anyone with the link), then use
          <strong> Sync Now</strong> on the Integrations page to pull leads in.
        </p>
      </Card>
  );
}

function ShopifyCard({ form, set, saving, save, toast }) {
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const connectedShop = form.shopify_connected_shop;

  const connect = async () => {
    setConnecting(true);
    try {
      const result = await api.post('/api/settings/apps/shopify/connect', {});
      set('shopify_connected_shop', result?.shop || 'Connected');
      toast(`Shopify connected (${result?.shop}).${result?.webhookStatus === 'registered' ? ' Webhooks registered.' : ''}`, 'success');
    } catch (err) {
      toast(err.message || 'Could not connect to Shopify.', 'danger');
    } finally {
      setConnecting(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await api.post('/api/settings/apps/shopify/sync', {});
      toast(`Synced: ${result.imported} new, ${result.duplicates} duplicate(s), ${result.failed} failed (of ${result.total} customers).`, result.failed ? 'warning' : 'success');
    } catch (err) {
      toast(err.message || 'Sync failed.', 'danger');
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await api.post('/api/settings/apps/shopify/disconnect');
      set('shopify_connected_shop', '');
      toast('Shopify disconnected.', 'success');
    } catch (err) {
      toast(err.message || 'Could not disconnect.', 'danger');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Card icon="shop" title="Shopify" badge={connectedShop ? 'Connected' : undefined}>
      <Field label="Store Domain" name="shopify_shop_domain" value={form.shopify_shop_domain} onChange={set}
        hint="e.g. mystore.myshopify.com" />
      <Field label="Admin API Access Token" name="shopify_admin_token" type="password" value={form.shopify_admin_token} onChange={set}
        hint="Shopify Admin → Settings → Apps and sales channels → Develop apps → Create an app → grant read_customers + read_orders → Install → copy the Admin API access token." />
      <Field label="API Secret Key" name="shopify_api_secret" type="password" value={form.shopify_api_secret} onChange={set}
        hint="From the same Custom App's API credentials tab — used to verify incoming webhooks are really from Shopify." />

      <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
        <SaveBtn saving={saving} label="Save Shopify Credentials"
          onClick={() => save(['shopify_shop_domain', 'shopify_admin_token', 'shopify_api_secret', 'shopify_webhook_base_url'])} />
        {connectedShop ? (
          <>
            <span className="badge badge-crm badge-live d-inline-flex align-items-center gap-1">
              <i className="bi bi-check-circle-fill" />{connectedShop}
            </span>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={sync} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
            <button type="button" className="btn btn-outline-danger btn-sm" onClick={disconnect} disabled={disconnecting}>
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1" onClick={connect} disabled={connecting}>
            {connecting ? 'Connecting…' : <><i className="bi bi-shop" />Verify &amp; Connect</>}
          </button>
        )}
      </div>
      <p className="text-muted text-11 mb-0">
        Customers become leads, with their most recent order's items noted under Product Interest. New orders/customers
        also sync automatically going forward if a Webhook Base URL is set above.
      </p>
    </Card>
  );
}

function HubspotCard({ form, set, saving, save, toast }) {
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const connected = form.hubspot_connected === '1';
  const webhookUrl = form.hubspot_webhook_key && form.hubspot_webhook_base_url
    ? `${form.hubspot_webhook_base_url}/webhook/hubspot/${form.hubspot_webhook_key}`
    : null;

  const connect = async () => {
    setConnecting(true);
    try {
      const result = await api.post('/api/settings/apps/hubspot/connect', {});
      set('hubspot_connected', '1');
      if (result?.webhookKey) set('hubspot_webhook_key', result.webhookKey);
      toast('HubSpot connected.', 'success');
    } catch (err) {
      toast(err.message || 'Could not connect to HubSpot.', 'danger');
    } finally {
      setConnecting(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await api.post('/api/settings/apps/hubspot/sync', {});
      toast(`Synced: ${result.imported} new, ${result.duplicates} duplicate(s), ${result.failed} failed (of ${result.total} contacts).`, result.failed ? 'warning' : 'success');
    } catch (err) {
      toast(err.message || 'Sync failed.', 'danger');
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await api.post('/api/settings/apps/hubspot/disconnect');
      set('hubspot_connected', '');
      toast('HubSpot disconnected.', 'success');
    } catch (err) {
      toast(err.message || 'Could not disconnect.', 'danger');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Card icon="bullseye" title="HubSpot" badge={connected ? 'Connected' : undefined}>
      <Field label="Private App Access Token" name="hubspot_access_token" type="password" value={form.hubspot_access_token} onChange={set}
        hint="HubSpot → Settings → Integrations → Private Apps → Create a private app → grant crm.objects.contacts.read (and .write if you want two-way later) → copy the Access Token." />
      <Field label="Webhook Signing Secret" name="hubspot_webhook_secret" type="password" value={form.hubspot_webhook_secret} onChange={set}
        hint="From the same Private App's Webhooks tab — only needed for real-time sync (optional, Sync Now always works without it)." />

      <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
        <SaveBtn saving={saving} label="Save HubSpot Credentials"
          onClick={() => save(['hubspot_access_token', 'hubspot_webhook_secret', 'hubspot_webhook_base_url'])} />
        {connected ? (
          <>
            <span className="badge badge-crm badge-live d-inline-flex align-items-center gap-1">
              <i className="bi bi-check-circle-fill" />Connected
            </span>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={sync} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
            <button type="button" className="btn btn-outline-danger btn-sm" onClick={disconnect} disabled={disconnecting}>
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1" onClick={connect} disabled={connecting}>
            {connecting ? 'Connecting…' : <><i className="bi bi-bullseye" />Verify &amp; Connect</>}
          </button>
        )}
      </div>

      {webhookUrl && (
        <Field label="Webhook URL — paste into HubSpot's Private App → Webhooks tab, subscribe to Contact created/property changed"
          name="_hs_webhook_url" value={webhookUrl} readOnly />
      )}
      <p className="text-muted text-11 mb-0 mt-2">
        Contacts become leads. Real-time sync only kicks in once the Webhook URL above is pasted into HubSpot and a
        Webhook Signing Secret is set — otherwise use Sync Now.
      </p>
    </Card>
  );
}

function SalesforceCard({ form, set, saving, save, toast }) {
  const [disconnecting, setDisconnecting] = useState(false);
  const connectedOrg = form.salesforce_connected_org;

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await api.post('/api/settings/apps/salesforce/disconnect');
      set('salesforce_connected_org', '');
      toast('Salesforce disconnected.', 'success');
    } catch (err) {
      toast(err.message || 'Could not disconnect.', 'danger');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Card icon="cloud-fill" title="Salesforce" badge={connectedOrg ? 'Connected' : undefined}>
      <Field label="Login URL" name="salesforce_login_url" value={form.salesforce_login_url || 'https://login.salesforce.com'} onChange={set}
        hint="Use https://test.salesforce.com for a Sandbox org, otherwise leave as the production login URL." />
      <Field label="Connected App Client ID (Consumer Key)" name="salesforce_oauth_client_id" value={form.salesforce_oauth_client_id} onChange={set} />
      <Field label="Connected App Client Secret (Consumer Secret)" name="salesforce_oauth_client_secret" type="password" value={form.salesforce_oauth_client_secret} onChange={set} />
      <Field label="Callback URL (add this in Salesforce Connected App settings)" name="_sf_redirect"
        value={`${FRONTEND_URL}/oauth/salesforce/callback`} readOnly />

      <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
        <SaveBtn saving={saving} label="Save Salesforce Credentials"
          onClick={() => save(['salesforce_login_url', 'salesforce_oauth_client_id', 'salesforce_oauth_client_secret'])} />
        {form.salesforce_oauth_client_id && (
          connectedOrg ? (
            <>
              <span className="badge badge-crm badge-live d-inline-flex align-items-center gap-1">
                <i className="bi bi-check-circle-fill" />{connectedOrg}
              </span>
              <button type="button" className="btn btn-outline-danger btn-sm" onClick={disconnect} disabled={disconnecting}>
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </>
          ) : (
            <a href="/oauth/salesforce" className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1">
              <i className="bi bi-cloud-fill" />Connect with Salesforce
            </a>
          )
        )}
      </div>
      <p className="text-muted text-11 mb-0">
        Leads sync in automatically every minute or so going forward (polling — Salesforce has no simple real-time
        webhook for this). Use Sync Now on the Integrations page anytime for an immediate full pull.
      </p>
    </Card>
  );
}

function MailchimpCard({ form, set, saving, save, toast }) {
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const connectedAccount = form.mailchimp_connected_account;
  const webhookUrl = form.mailchimp_webhook_key && form.mailchimp_webhook_base_url
    ? `${form.mailchimp_webhook_base_url}/webhook/mailchimp/${form.mailchimp_webhook_key}`
    : null;

  const connect = async () => {
    setConnecting(true);
    try {
      const result = await api.post('/api/settings/apps/mailchimp/connect', {});
      set('mailchimp_connected_account', result?.account || 'Connected');
      if (result?.webhookKey) set('mailchimp_webhook_key', result.webhookKey);
      toast(`Mailchimp connected.${result?.webhookStatus === 'registered' ? ' Webhook registered.' : ''}`, 'success');
    } catch (err) {
      toast(err.message || 'Could not connect to Mailchimp.', 'danger');
    } finally {
      setConnecting(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await api.post('/api/settings/apps/mailchimp/sync', {});
      toast(`Synced: ${result.imported} new, ${result.duplicates} duplicate(s), ${result.failed} failed (of ${result.total} subscribers).`, result.failed ? 'warning' : 'success');
    } catch (err) {
      toast(err.message || 'Sync failed.', 'danger');
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await api.post('/api/settings/apps/mailchimp/disconnect');
      set('mailchimp_connected_account', '');
      toast('Mailchimp disconnected.', 'success');
    } catch (err) {
      toast(err.message || 'Could not disconnect.', 'danger');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Card icon="envelope-paper-fill" title="Mailchimp" badge={connectedAccount ? 'Connected' : undefined}>
      <Field label="API Key" name="mailchimp_api_key" type="password" value={form.mailchimp_api_key} onChange={set}
        hint="Mailchimp → Profile → Extras → API Keys → Create A Key. The data center (e.g. us21) is read automatically from the end of the key." />
      <Field label="Audience/List ID" name="mailchimp_list_id" value={form.mailchimp_list_id} onChange={set}
        hint="Audience → Settings → Audience name and defaults → Audience ID." />

      <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
        <SaveBtn saving={saving} label="Save Mailchimp Credentials"
          onClick={() => save(['mailchimp_api_key', 'mailchimp_list_id', 'mailchimp_webhook_base_url'])} />
        {connectedAccount ? (
          <>
            <span className="badge badge-crm badge-live d-inline-flex align-items-center gap-1">
              <i className="bi bi-check-circle-fill" />{connectedAccount}
            </span>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={sync} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
            <button type="button" className="btn btn-outline-danger btn-sm" onClick={disconnect} disabled={disconnecting}>
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1" onClick={connect} disabled={connecting}>
            {connecting ? 'Connecting…' : <><i className="bi bi-envelope-paper-fill" />Verify &amp; Connect</>}
          </button>
        )}
      </div>

      {webhookUrl && (
        <Field label="Webhook URL — registered automatically on this Audience if a Webhook Base URL was set above" name="_mc_webhook_url" value={webhookUrl} readOnly />
      )}
      <p className="text-muted text-11 mb-0 mt-2">
        Only subscribed members become leads (unsubscribed/cleaned are skipped). Mailchimp doesn't sign webhooks —
        the URL itself is the secret, so keep it private.
      </p>
    </Card>
  );
}

function ZendeskCard({ form, set, saving, save, toast }) {
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const connectedAccount = form.zendesk_connected_account;

  const connect = async () => {
    setConnecting(true);
    try {
      const result = await api.post('/api/settings/apps/zendesk/connect', {});
      set('zendesk_connected_account', result?.account || 'Connected');
      toast(`Zendesk connected.${result?.webhookStatus === 'registered' ? ' Webhook + trigger registered.' : ''}`, 'success');
    } catch (err) {
      toast(err.message || 'Could not connect to Zendesk.', 'danger');
    } finally {
      setConnecting(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await api.post('/api/settings/apps/zendesk/sync', {});
      toast(`Synced: ${result.imported} new, ${result.duplicates} duplicate(s), ${result.failed} failed (of ${result.total} users).`, result.failed ? 'warning' : 'success');
    } catch (err) {
      toast(err.message || 'Sync failed.', 'danger');
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await api.post('/api/settings/apps/zendesk/disconnect');
      set('zendesk_connected_account', '');
      toast('Zendesk disconnected.', 'success');
    } catch (err) {
      toast(err.message || 'Could not disconnect.', 'danger');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Card icon="headset" title="Zendesk" badge={connectedAccount ? 'Connected' : undefined}>
      <Field label="Subdomain" name="zendesk_subdomain" value={form.zendesk_subdomain} onChange={set}
        hint="e.g. mycompany — if you access Zendesk at mycompany.zendesk.com" />
      <Field label="Agent/Admin Email" name="zendesk_email" value={form.zendesk_email} onChange={set} />
      <Field label="API Token" name="zendesk_api_token" type="password" value={form.zendesk_api_token} onChange={set}
        hint="Zendesk Admin Center → Apps and integrations → APIs → Zendesk API → Add API token." />

      <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
        <SaveBtn saving={saving} label="Save Zendesk Credentials"
          onClick={() => save(['zendesk_subdomain', 'zendesk_email', 'zendesk_api_token', 'zendesk_webhook_base_url'])} />
        {connectedAccount ? (
          <>
            <span className="badge badge-crm badge-live d-inline-flex align-items-center gap-1">
              <i className="bi bi-check-circle-fill" />{connectedAccount}
            </span>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={sync} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
            <button type="button" className="btn btn-outline-danger btn-sm" onClick={disconnect} disabled={disconnecting}>
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1" onClick={connect} disabled={connecting}>
            {connecting ? 'Connecting…' : <><i className="bi bi-headset" />Verify &amp; Connect</>}
          </button>
        )}
      </div>
      <p className="text-muted text-11 mb-0">
        End-users (ticket requesters) become leads. New tickets also create/update a lead in real time — with the
        ticket subject noted under Product Interest — once a Webhook Base URL is set above.
      </p>
    </Card>
  );
}

function IndiamartCard({ form, set, saving, save, toast }) {
  const [syncing, setSyncing] = useState(false);
  const webhookUrl = form.indiamart_webhook_key ? `${APP_URL}/webhook/indiamart/${form.indiamart_webhook_key}` : `${APP_URL}/webhook/indiamart`;

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await api.post('/api/settings/sources/indiamart/sync', {});
      toast(`Synced: ${result.imported} new, ${result.duplicates} duplicate(s), ${result.failed} failed (of ${result.total} leads, last 7 days).`, result.failed ? 'warning' : 'success');
    } catch (err) {
      toast(err.message || 'Sync failed.', 'danger');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card icon="building" title="IndiaMart" badge="REST API">
      <Field label="API Key (CRM Key)" name="indiamart_key" type="password" value={form.indiamart_key} onChange={set}
        hint="IndiaMart Seller Panel → Lead Manager → CRM Integration → CRM Key." />
      <Field label="Webhook URL (paste into IndiaMart's Lead Manager push settings)" name="_im_webhook" value={webhookUrl} readOnly />
      <div className="d-flex align-items-center gap-2">
        <SaveBtn saving={saving} label="Save IndiaMart" onClick={() => save(['indiamart_key'])} />
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={sync} disabled={syncing}>
          {syncing ? 'Syncing…' : 'Sync Now (last 7 days)'}
        </button>
      </div>
    </Card>
  );
}

function TradeindiaCard({ form, set, saving, save, toast }) {
  const [syncing, setSyncing] = useState(false);
  const webhookUrl = form.tradeindia_webhook_key ? `${APP_URL}/webhook/tradeindia/${form.tradeindia_webhook_key}` : `${APP_URL}/webhook/tradeindia`;

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await api.post('/api/settings/sources/tradeindia/sync', {});
      toast(`Synced: ${result.imported} new, ${result.duplicates} duplicate(s), ${result.failed} failed (of ${result.total} leads).`, result.failed ? 'warning' : 'success');
    } catch (err) {
      toast(err.message || 'Sync failed.', 'danger');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card icon="shop" title="TradeIndia" badge="REST API">
      <Field label="API Key" name="tradeindia_key" type="password" value={form.tradeindia_key} onChange={set} />
      <Field label="User ID" name="tradeindia_user" value={form.tradeindia_user} onChange={set} />
      <Field label="Webhook URL (paste into TradeIndia's lead push settings)" name="_ti_webhook" value={webhookUrl} readOnly />
      <div className="d-flex align-items-center gap-2">
        <SaveBtn saving={saving} label="Save TradeIndia" onClick={() => save(['tradeindia_key','tradeindia_user'])} />
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={sync} disabled={syncing}>
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>
      <p className="text-muted text-11 mb-0 mt-2">
        Prefer the Webhook URL if your TradeIndia panel supports lead push — Sync Now uses a best-effort reading of
        TradeIndia's lead API and may need adjusting if your account returns a different field layout.
      </p>
    </Card>
  );
}

function JustdialCard({ form, set, saving, save, toast }) {
  const [syncing, setSyncing] = useState(false);
  const webhookUrl = form.justdial_webhook_key ? `${APP_URL}/webhook/justdial/${form.justdial_webhook_key}` : `${APP_URL}/webhook/justdial`;

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await api.post('/api/settings/sources/justdial/sync', {});
      toast(`Synced: ${result.imported} new, ${result.duplicates} duplicate(s), ${result.failed} failed (of ${result.total} leads).`, result.failed ? 'warning' : 'success');
    } catch (err) {
      toast(err.message || 'Sync failed.', 'danger');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card icon="telephone-fill" title="JustDial">
      <Field label="API Key" name="justdial_api_key" type="password" value={form.justdial_api_key} onChange={set} />
      <Field label="Login" name="justdial_login" value={form.justdial_login} onChange={set} />
      <Field label="Webhook URL (paste into JustDial's lead push settings)" name="_jd_webhook" value={webhookUrl} readOnly />
      <div className="d-flex align-items-center gap-2">
        <SaveBtn saving={saving} label="Save JustDial" onClick={() => save(['justdial_api_key','justdial_login'])} />
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={sync} disabled={syncing}>
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>
      <p className="text-muted text-11 mb-0 mt-2">
        Prefer the Webhook URL if your JustDial panel supports lead push — Sync Now uses a best-effort reading of
        JustDial's lead API and may need adjusting if your account returns a different field layout.
      </p>
    </Card>
  );
}

function SimpleApiKeySyncCard({ icon, title, hint, settingKey, syncSlug, unitLabel, confidenceNote, form, set, saving, save, toast }) {
  const [syncing, setSyncing] = useState(false);

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await api.post(`/api/settings/sources/${syncSlug}/sync`, {});
      toast(`Synced: ${result.imported} new, ${result.duplicates} duplicate(s), ${result.failed} failed (of ${result.total} ${unitLabel}).`, result.failed ? 'warning' : 'success');
    } catch (err) {
      toast(err.message || 'Sync failed.', 'danger');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card icon={icon} title={title}>
      <Field label="API Key" name={settingKey} type="password" value={form[settingKey]} onChange={set} hint={hint} />
      <div className="d-flex align-items-center gap-2">
        <SaveBtn saving={saving} label={`Save ${title}`} onClick={() => save([settingKey])} />
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={sync} disabled={syncing}>
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>
      {confidenceNote && <p className="text-muted text-11 mb-0 mt-2">{confidenceNote}</p>}
    </Card>
  );
}

function ApolloCard(props) {
  return (
    <SimpleApiKeySyncCard
      {...props}
      icon="person-badge"
      title="Apollo"
      settingKey="apollo_api_key"
      syncSlug="apollo"
      unitLabel="contacts"
      hint="Apollo → Settings → Integrations → API → your API key."
    />
  );
}

function LushaCard(props) {
  return (
    <SimpleApiKeySyncCard
      {...props}
      icon="person-lines-fill"
      title="Lusha"
      settingKey="lusha_api_key"
      syncSlug="lusha"
      unitLabel="contacts"
      hint="Lusha → Settings → API → your API key."
      confidenceNote="Lusha's API is primarily built for on-demand enrichment rather than bulk contact export — if Sync Now returns 0 despite having saved contacts, this may need adjusting for your account type."
    />
  );
}

function ZoominfoCard(props) {
  return (
    <SimpleApiKeySyncCard
      {...props}
      icon="database-fill"
      title="ZoomInfo"
      settingKey="zoominfo_api_key"
      syncSlug="zoominfo"
      unitLabel="contacts"
      hint="From your ZoomInfo API contract — ask your ZoomInfo account rep if you don't have this yet."
      confidenceNote="ZoomInfo's API access is enterprise-gated and their auth model varies by contract (bearer token vs JWT) — check with your ZoomInfo rep if this doesn't authenticate."
    />
  );
}

function IntentSignalCard({ icon, title, settingKey, syncSlug, webhookSlug, form, set, save, saving, toast }) {
  const [syncing, setSyncing] = useState(false);
  const webhookKeySetting = `${webhookSlug}_webhook_key`;
  const webhookUrl = form[webhookKeySetting] ? `${APP_URL}/webhook/${webhookSlug}/${form[webhookKeySetting]}` : `${APP_URL}/webhook/${webhookSlug}`;

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await api.post(`/api/settings/sources/${syncSlug}/sync`, {});
      toast(`Created ${result.created} task(s) from ${result.total} intent signal(s).`, 'success');
    } catch (err) {
      toast(err.message || 'Sync failed.', 'danger');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card icon={icon} title={title}>
      <div className="alert py-2 px-3 text-12 mb-3" style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a' }}>
        <i className="bi bi-info-circle me-1" />
        {title} tracks company-level buying intent, not individual contacts — there's no email/phone to build a lead
        from. Instead, a <strong>Task</strong> gets created for your sales team whenever a company shows intent
        ("Acme Corp is researching CRM software").
      </div>
      <Field label="API Key" name={settingKey} type="password" value={form[settingKey]} onChange={set} />
      <Field label="Webhook URL" name={`_${webhookSlug}_webhook`} value={webhookUrl} readOnly />
      <div className="d-flex align-items-center gap-2">
        <SaveBtn saving={saving} label={`Save ${title}`} onClick={() => save([settingKey])} />
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={sync} disabled={syncing}>
          {syncing ? 'Syncing…' : 'Sync Now'}
        </button>
      </div>
    </Card>
  );
}

function MetaAdsCard({ form, set, saving, save }) {
  const webhookUrl = form.meta_webhook_key ? `${APP_URL}/webhook/meta/${form.meta_webhook_key}` : `${APP_URL}/webhook/meta`;

  return (
    <Card icon="facebook" title="Meta / Facebook Lead Ads">
      <Field label="Page Access Token" name="meta_ads_token" type="password" value={form.meta_ads_token} onChange={set} />
      <Field label="App Secret (Webhook Verification)" name="meta_ads_secret" type="password" value={form.meta_ads_secret} onChange={set}
        hint="Optional but recommended — verifies incoming webhook payloads are genuinely from Meta." />
      <Field label="Verify Token" name="meta_verify_token" value={form.meta_verify_token} onChange={set}
        hint="Set this same token in Meta App Dashboard → Webhooks → Verify Token." />
      <Field label="Webhook URL (register in Meta App Dashboard → Webhooks → leadgen)" name="_meta_webhook" value={webhookUrl} readOnly />
      <SaveBtn saving={saving} label="Save Meta Ads" onClick={() => save(['meta_ads_token','meta_ads_secret','meta_verify_token'])} />
      <p className="text-muted text-11 mb-0 mt-2">
        Real-time only, no manual sync — new leads arrive the moment someone submits your Facebook/Instagram lead form.
      </p>
    </Card>
  );
}

function GoogleAdsCard({ form, set, saving, save }) {
  const webhookUrl = form.google_ads_webhook_key ? `${APP_URL}/webhook/google_ads/${form.google_ads_webhook_key}` : `${APP_URL}/webhook/google_ads`;

  return (
    <Card icon="google" title="Google Ads Lead Form">
      <Field label="Webhook Secret Key" name="google_ads_webhook_secret" type="password" value={form.google_ads_webhook_secret} onChange={set}
        hint="Pick any secret value here, then paste the SAME value as the webhook 'key' when setting up the webhook on your Lead Form asset in Google Ads." />
      <Field label="Webhook URL (set on the Lead Form asset → Webhook integration in Google Ads)" name="_gads_webhook" value={webhookUrl} readOnly />
      <SaveBtn saving={saving} label="Save Google Ads" onClick={() => save(['google_ads_webhook_secret'])} />
      <p className="text-muted text-11 mb-0 mt-2">
        No Developer Token or OAuth needed — Google Ads Lead Form's built-in webhook feature (configured directly on
        the Lead Form asset in the Ads UI) delivers leads here in real time.
      </p>
    </Card>
  );
}

function LinkedinCard({ form, set, saving, save, toast }) {
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const connectedAccount = form.linkedin_connected_account;

  const sync = async () => {
    setSyncing(true);
    try {
      const result = await api.post('/api/settings/sources/linkedin/sync', {});
      toast(`Synced: ${result.imported} new, ${result.duplicates} duplicate(s), ${result.failed} failed (of ${result.total} responses).`, result.failed ? 'warning' : 'success');
    } catch (err) {
      toast(err.message || "Sync failed — if this mentions a 403, LinkedIn likely hasn't approved Lead Sync access for this app yet.", 'danger');
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      await api.post('/oauth/linkedin/revoke', {});
      set('linkedin_connected_account', '');
      toast('LinkedIn disconnected.', 'success');
    } catch (err) {
      toast(err.message || 'Could not disconnect.', 'danger');
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <Card icon="linkedin" title="LinkedIn Lead Gen" badge={connectedAccount ? 'Connected' : undefined}>
      <div className="alert py-2 px-3 text-12 mb-3" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
        <i className="bi bi-exclamation-triangle me-1" />
        LinkedIn's Lead Sync API needs your app approved as a <strong>Marketing Developer Platform</strong> partner —
        the OAuth connection below will work, but syncing leads will fail (usually with a 403) until LinkedIn approves
        that access for your app.
      </div>
      <Field label="Organization URN" name="linkedin_org_urn" value={form.linkedin_org_urn} onChange={set}
        hint="e.g. urn:li:organization:12345" />
      <Field label="OAuth Client ID" name="linkedin_oauth_client_id" value={form.linkedin_oauth_client_id} onChange={set} />
      <Field label="OAuth Client Secret" name="linkedin_oauth_client_secret" type="password" value={form.linkedin_oauth_client_secret} onChange={set} />
      <Field label="Redirect URI (add this in your LinkedIn app's Auth settings)" name="_li_redirect"
        value={`${FRONTEND_URL}/oauth/linkedin/callback`} readOnly />

      <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
        <SaveBtn saving={saving} label="Save LinkedIn Credentials"
          onClick={() => save(['linkedin_org_urn', 'linkedin_oauth_client_id', 'linkedin_oauth_client_secret'])} />
        {form.linkedin_oauth_client_id && (
          connectedAccount ? (
            <>
              <span className="badge badge-crm badge-live d-inline-flex align-items-center gap-1">
                <i className="bi bi-check-circle-fill" />{connectedAccount}
              </span>
              <button type="button" className="btn btn-outline-secondary btn-sm" onClick={sync} disabled={syncing}>
                {syncing ? 'Syncing…' : 'Sync Now'}
              </button>
              <button type="button" className="btn btn-outline-danger btn-sm" onClick={disconnect} disabled={disconnecting}>
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </button>
            </>
          ) : (
            <a href="/oauth/linkedin" className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1">
              <i className="bi bi-linkedin" />Connect with LinkedIn
            </a>
          )
        )}
      </div>
    </Card>
  );
}

const BLANK_ACCOUNT_FORM = {
  id: null, name: '', provider: 'meta', channel: 'whatsapp', external_account_id: '', webhook_secret: '', config_text: '{}',
  from_name: '', from_email: '', smtp_host: '', smtp_port: '587', smtp_user: '', smtp_pass: '', daily_send_limit: '',
};

function IntegrationAccounts() {
  const toast = useToast();
  const confirm = useConfirm();
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(BLANK_ACCOUNT_FORM);
  const [busy, setBusy] = useState(false);
  const isEmail = form.channel === 'email';
  const isEdit = Boolean(form.id);

  const load = useCallback(async () => {
    try {
      const data = await api.get('/api/settings/integration-accounts');
      setAccounts(data?.accounts ?? []);
    } catch (error) { toast(error.message || 'Could not load integration accounts.', 'danger'); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const set = (n, v) => setForm((p) => ({ ...p, [n]: v }));
  const resetForm = () => setForm(BLANK_ACCOUNT_FORM);

  const editAccount = (account) => {
    setForm({
      ...BLANK_ACCOUNT_FORM,
      id: account.id, name: account.name, provider: account.provider, channel: account.channel,
      external_account_id: account.external_account_id || '',
      daily_send_limit: account.daily_send_limit ?? '',
    });
  };

  const togglePause = async (account) => {
    try {
      await api.post('/api/settings/integration-accounts', { id: account.id, name: account.name, provider: account.provider, channel: account.channel, is_active: !account.is_active });
      toast(account.is_active ? 'Account paused.' : 'Account resumed.', 'success');
      await load();
    } catch (error) { toast(error.message || 'Could not update account.', 'danger'); }
  };

  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      let config = {};
      if (isEmail) {
        config = {
          smtp_from_name: form.from_name, smtp_from: form.from_email,
          smtp_host: form.smtp_host, smtp_port: form.smtp_port,
          smtp_user: form.smtp_user, smtp_pass: form.smtp_pass,
        };
      } else {
        try { config = JSON.parse(form.config_text || '{}'); } catch { toast('Account configuration must be valid JSON.', 'danger'); setBusy(false); return; }
      }
      await api.post('/api/settings/integration-accounts', { ...form, config });
      resetForm();
      await load();
      toast(isEdit ? 'Integration account updated.' : 'Integration account created.', 'success');
    } catch (error) { toast(error.message || 'Could not save account.', 'danger'); }
    finally { setBusy(false); }
  };

  const remove = async (id) => {
    if (!(await confirm('Remove this integration account?', { title: 'Remove account' }))) return;
    try {
      await api.delete(`/api/settings/integration-accounts/${id}`);
      setAccounts((items) => items.filter((item) => item.id !== id));
      toast('Integration account removed.', 'success');
    } catch (error) { toast(error.message || 'Could not remove account.', 'danger'); }
  };

  return (
    <Card icon="collection-fill" title="Connected Accounts" badge="Multiple per company">
      <p className="text-muted text-12 mb-3">Add each WhatsApp, email, SMS or lead-source account separately. Every account gets an isolated webhook endpoint.</p>
      <form className="row g-2 mb-3" onSubmit={save}>
        <div className="col-md-3"><Field label="Account name" name="name" value={form.name} onChange={set} /></div>
        <div className="col-md-2">
          <Select label="Channel" name="channel" value={form.channel} onChange={set}
            options={[{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'email', label: 'Email' }, { value: 'rcs', label: 'RCS' }, { value: 'sms', label: 'SMS' }, { value: 'lead_source', label: 'Lead source' }]} />
        </div>
        {!isEmail && <div className="col-md-2"><Field label="Provider" name="provider" value={form.provider} onChange={set} /></div>}

        {isEmail ? (
          <>
            <div className="col-md-3"><Field label="From Name" name="from_name" value={form.from_name} onChange={set} /></div>
            <div className="col-md-3"><Field label="From Email" name="from_email" type="email" value={form.from_email} onChange={set} /></div>
            <div className="col-md-4"><Field label="SMTP Host" name="smtp_host" value={form.smtp_host} onChange={set} hint={isEdit ? 'Leave blank to keep existing host' : undefined} /></div>
            <div className="col-md-2"><Field label="Port" name="smtp_port" value={form.smtp_port} onChange={set} /></div>
            <div className="col-md-3"><Field label="Username" name="smtp_user" value={form.smtp_user} onChange={set} hint={isEdit ? 'Leave blank to keep existing' : undefined} /></div>
            <div className="col-md-3"><Field label="App Password" name="smtp_pass" type="password" value={form.smtp_pass} onChange={set} hint={isEdit ? 'Leave blank to keep existing' : undefined} /></div>
            <div className="col-md-2"><Field label="Daily Send Limit" name="daily_send_limit" type="number" value={form.daily_send_limit} onChange={set} hint="Blank = unlimited" /></div>
          </>
        ) : (
          <>
            <div className="col-md-3"><Field label="External account ID" name="external_account_id" value={form.external_account_id} onChange={set} /></div>
            <div className="col-md-3"><Field label="Webhook secret" name="webhook_secret" type="password" value={form.webhook_secret} onChange={set} /></div>
            <div className="col-md-4"><label className="crm-label">Account config (JSON)</label><textarea className="form-control crm-input" rows="2" value={form.config_text} onChange={(e) => set('config_text', e.target.value)} placeholder='{"api_key":"..."}' /></div>
          </>
        )}

        <div className="col-12 d-flex gap-2">
          <button className="btn-crm" disabled={busy}>{busy ? 'Saving…' : isEdit ? 'Update Account' : 'Add Account'}</button>
          {isEdit && <button type="button" className="btn btn-outline-secondary" onClick={resetForm}>Cancel</button>}
        </div>
      </form>
      {accounts.length === 0 ? <div className="text-muted text-12">No separate integration accounts added yet.</div> : (
        <div className="table-responsive"><table className="table table-sm align-middle mb-0 text-12">
          <thead><tr><th>Account</th><th>Provider</th><th>Webhook URL</th><th>Daily Sent/Limit</th><th>Status</th><th /></tr></thead>
          <tbody>{accounts.map((account) => {
            const sentToday = account.sent_today_date === new Date().toISOString().slice(0, 10) ? account.sent_today : 0;
            const limit = account.daily_send_limit;
            const webhookUrl = `${APP_URL}/webhook/${account.provider}/${account.webhook_key}`;
            return (
            <tr key={account.id}>
              <td className="text-nowrap"><strong>{account.name}</strong><div className="text-muted">{account.channel}</div></td>
              <td className="text-nowrap">{account.provider}</td>
              <td>
                <div className="d-flex align-items-center gap-1">
                  <code className="text-truncate d-inline-block" style={{ maxWidth: 220 }} title={webhookUrl}>{webhookUrl}</code>
                  <button type="button" className="btn btn-outline-secondary btn-sm flex-shrink-0" title="Copy webhook URL"
                    onClick={() => { navigator.clipboard.writeText(webhookUrl); toast('Webhook URL copied.', 'success'); }}>
                    <i className="bi bi-clipboard" />
                  </button>
                </div>
              </td>
              <td style={{ minWidth: 120 }} className="text-nowrap">
                {limit ? (
                  <>
                    <div className="text-11">{sentToday} / {limit}</div>
                    <div className="progress" style={{ height: 4 }}>
                      <div className="progress-bar bg-primary" style={{ width: `${Math.min(100, (sentToday / limit) * 100)}%` }} />
                    </div>
                  </>
                ) : <span className="text-muted-3">Unlimited</span>}
              </td>
              <td className="text-nowrap"><span className={`badge badge-crm badge-${account.is_active ? 'live' : 'draft'}`}>{account.is_active ? 'Active' : 'Paused'}</span></td>
              <td className="text-end text-nowrap">
                <button type="button" className="btn btn-outline-secondary btn-sm me-1" onClick={() => editAccount(account)}>Edit</button>
                <button type="button" className="btn btn-outline-secondary btn-sm me-1" onClick={() => togglePause(account)}>{account.is_active ? 'Pause' : 'Resume'}</button>
                <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => remove(account.id)}><i className="bi bi-trash" /></button>
              </td>
            </tr>
            );
          })}</tbody>
        </table></div>
      )}
    </Card>
  );
}

/* ── SMS Tab ──────────────────────────────────────────── */
function SmsTab({ form, set, saving, save, toast }) {
  const [testMobile, setTestMobile] = useState('');
  const [testing, setTesting]       = useState(false);
  const [testStatus, setTestStatus] = useState(null); // null | 'ok' | 'fail'

  const provider = form.sms_provider || 'mshastra';

  const testSms = async () => {
    if (!testMobile) { toast('Enter a mobile number to send the test SMS.', 'warning'); return; }
    setTesting(true);
    setTestStatus(null);
    try {
      await api.post('/api/settings/test-sms', { mobile: testMobile });
      setTestStatus('ok');
      toast(`Test SMS sent to ${testMobile}.`, 'success');
    } catch (err) {
      setTestStatus('fail');
      toast(`Test failed: ${err.message}`, 'danger');
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <Card icon="phone-fill" title="Active SMS Provider">
        <div className="col-md-4">
          <Select
            label="Provider"
            name="sms_provider"
            value={provider}
            onChange={set}
            options={[
              { value: 'mshastra',  label: 'MShastra' },
              { value: 'msg91',     label: 'MSG91' },
              { value: 'twilio',    label: 'Twilio' },
              { value: 'fast2sms',  label: 'Fast2SMS' },
              { value: 'textlocal', label: 'TextLocal' },
            ]}
          />
        </div>
      </Card>

      {provider === 'mshastra' && (
        <Card icon="chat-right-text-fill" title="MShastra Configuration">
          <div className="row g-3">
            <div className="col-md-3">
              <Field label="MShastra Username" name="sms_mshastra_user" value={form.sms_mshastra_user} onChange={set}
                hint="Your MShastra login username" />
            </div>
            <div className="col-md-3">
              <Field label="Password" name="sms_mshastra_pwd" type="password" value={form.sms_mshastra_pwd} onChange={set} />
            </div>
            <div className="col-md-3">
              <Field label="Sender ID (DLT)" name="sms_mshastra_sender" value={form.sms_mshastra_sender || 'MOALRT'} onChange={set}
                hint="Fallback for numbers outside the countries below. India (+91) always sends as 'ZAMZAM', and Bahrain (+973)/Malaysia (+60)/DRC (+243) always send as 'Mobishtra' — regardless of this setting." />
            </div>
            <div className="col-md-6">
              <Field label="API URL" name="sms_mshastra_url" value={form.sms_mshastra_url || 'https://mshastra.com/sendurl.aspx'} onChange={set} />
            </div>
          </div>

          <div className="d-flex align-items-end gap-3 mt-2 flex-wrap">
            <SaveBtn saving={saving} label="Save MShastra Config"
              onClick={() => save(['sms_provider','sms_mshastra_url','sms_mshastra_user','sms_mshastra_pwd','sms_mshastra_sender'])} />

            <div className="d-flex gap-2 align-items-end">
              <div style={{ minWidth: 180 }}>
                <label className="crm-label">Test Mobile Number</label>
                <input
                  type="tel"
                  className="form-control crm-input"
                  placeholder="e.g. 9876543210"
                  value={testMobile}
                  onChange={(e) => { setTestMobile(e.target.value); setTestStatus(null); }}
                />
              </div>
              <button type="button" className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1 mb-3" onClick={testSms} disabled={testing}>
                {testing
                  ? <><span className="spinner-border spinner-border-sm" />Sending…</>
                  : testStatus === 'ok'
                    ? <><i className="bi bi-check-circle-fill text-success" />Sent</>
                    : testStatus === 'fail'
                      ? <><i className="bi bi-x-circle-fill text-danger" />Failed — Retry</>
                      : <><i className="bi bi-send-fill" />Send Test SMS</>
                }
              </button>
            </div>
          </div>
        </Card>
      )}

      {provider !== 'mshastra' && (
        <Card icon="hdd-network-fill" title={`${provider.toUpperCase()} Configuration`}>
          <div className="row g-3">
            <div className="col-md-6">
              <Field label="API URL" name="sms_api_url" value={form.sms_api_url} onChange={set} />
            </div>
            <div className="col-md-3">
              <Field label="API Key / Auth Token" name="sms_api_key" type="password" value={form.sms_api_key} onChange={set} />
            </div>
            <div className="col-md-3">
              <Field label="Sender ID / From Number" name="sms_sender" value={form.sms_sender} onChange={set} />
            </div>
          </div>
          <SaveBtn saving={saving} label="Save SMS Config"
            onClick={() => save(['sms_provider','sms_api_url','sms_api_key','sms_sender'])} />
        </Card>
      )}
    </>
  );
}

/* ── Tabs ─────────────────────────────────────────────── */
const TABS = [
  { id: 'email',     icon: 'envelope-fill',  label: 'Email' },
  { id: 'whatsapp',  icon: 'whatsapp',        label: 'WhatsApp' },
  { id: 'sms',       icon: 'phone-fill',      label: 'SMS' },
  { id: 'rcs',       icon: 'chat-dots-fill',  label: 'RCS' },
  { id: 'leads_api', icon: 'funnel-fill',     label: 'Lead Sources API' },
];

const LEAD_SOURCE_TABS = [
  { id: 'indiamart',     icon: 'building',                       label: 'IndiaMart' },
  { id: 'tradeindia',    icon: 'shop',                           label: 'TradeIndia' },
  { id: 'meta',          icon: 'facebook',                       label: 'Meta Ads' },
  { id: 'google_ads',    icon: 'google',                         label: 'Google Ads' },
  { id: 'linkedin',      icon: 'linkedin',                       label: 'LinkedIn' },
  { id: 'justdial',      icon: 'telephone-fill',                 label: 'JustDial' },
  { id: 'google_sheets', icon: 'file-earmark-spreadsheet-fill',  label: 'Google Sheets' },
  { id: 'shopify',       icon: 'shop',                            label: 'Shopify' },
  { id: 'hubspot',       icon: 'bullseye',                        label: 'HubSpot' },
  { id: 'salesforce',    icon: 'cloud-fill',                      label: 'Salesforce' },
  { id: 'mailchimp',     icon: 'envelope-paper-fill',             label: 'Mailchimp' },
  { id: 'zendesk',       icon: 'headset',                         label: 'Zendesk' },
  { id: 'apollo',        icon: 'person-badge',                    label: 'Apollo' },
  { id: 'lusha',         icon: 'person-lines-fill',               label: 'Lusha' },
  { id: 'zoominfo',      icon: 'database-fill',                   label: 'ZoomInfo' },
  { id: 'bombora',       icon: 'graph-up-arrow',                  label: 'Bombora' },
  { id: 'g2_intent',     icon: 'activity',                        label: 'G2 Intent' },
];

/* ── Main Component ───────────────────────────────────── */
export default function IntegrationsSettings() {
  const toast = useToast();
  const oauthResult = new URLSearchParams(window.location.search).get('oauth');
  const oauthProvider = new URLSearchParams(window.location.search).get('provider');
  const [tab, setTab] = useState(oauthResult ? 'leads_api' : 'email');
  const [leadSourceTab, setLeadSourceTab] = useState(oauthResult ? (oauthProvider || 'google_sheets') : 'indiamart');
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/settings/integrations')
      .then((d) => setForm(d?.settings ?? d ?? {}))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!oauthResult) return;
    toast(oauthResult === 'connected' ? 'Connected successfully.' : `Connection failed: ${oauthResult}`, oauthResult === 'connected' ? 'success' : 'danger');
    window.history.replaceState({}, '', window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = useCallback((name, value) => setForm((p) => ({ ...p, [name]: value })), []);

  const save = async (fields) => {
    setSaving(true);
    try {
      const payload = {};
      fields.forEach((k) => { payload[k] = form[k] ?? ''; });
      await api.post('/api/settings/integrations', payload);
      toast('Saved successfully.', 'success');
    } catch (err) {
      toast(err.message || 'Save failed.', 'danger');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBox />;

  return (
    <div>
      <h5 className="fw-bold mb-4 text-brand">Integrations</h5>

      <IntegrationAccounts />

      {/* Tab Strip */}
      <div className="crm-tabs mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`crm-tab${tab === t.id ? ' active' : ''}`}
          >
            <i className={`bi bi-${t.icon}`} />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── EMAIL ─────────────────────────────────────── */}
      {tab === 'email' && (
        <>
          <Card icon="envelope-fill" title="Active Email Provider">
            <div className="row g-3">
              <div className="col-md-4">
                <Select
                  label="Provider"
                  name="email_provider"
                  value={form.email_provider || 'smtp'}
                  onChange={set}
                  options={[
                    { value: 'smtp',          label: 'SMTP (Custom)' },
                    { value: 'sendgrid',      label: 'SendGrid' },
                    { value: 'mailgun',       label: 'Mailgun' },
                    { value: 'ses',           label: 'Amazon SES' },
                    { value: 'gmail_oauth',   label: 'Gmail OAuth' },
                    { value: 'outlook_oauth', label: 'Outlook OAuth' },
                  ]}
                />
              </div>
              <div className="col-md-4">
                <Field label="From Name" name="smtp_from_name" value={form.smtp_from_name} onChange={set} />
              </div>
              <div className="col-md-4">
                <Field label="From Email" name="smtp_from" value={form.smtp_from} onChange={set} />
              </div>
            </div>
          </Card>

          <Card icon="reply-fill" title="Incoming Replies (IMAP)" badge="Optional">
            <p className="text-13 text-muted-3 mb-3">
              Connect the same mailbox you send from so replies show up in Conversations automatically.
              Checked once a minute in the background.
            </p>
            <div className="row g-3">
              <div className="col-md-5">
                <Field label="IMAP Host" name="imap_host" value={form.imap_host} onChange={set} />
              </div>
              <div className="col-md-2">
                <Field label="Port" name="imap_port" type="number" value={form.imap_port || '993'} onChange={set} />
              </div>
              <div className="col-md-5">
                <Field label="Username" name="imap_user" value={form.imap_user} onChange={set} />
              </div>
              <div className="col-md-12">
                <Field label="Password" name="imap_pass" type="password" value={form.imap_pass} onChange={set}
                  hint="For Gmail: use an App Password (2FA must be enabled). Usually same credentials as SMTP." />
              </div>
            </div>
            <SaveBtn saving={saving} label="Save IMAP"
              onClick={() => save(['imap_host','imap_port','imap_user','imap_pass','imap_secure'])} />
          </Card>

          {(!form.email_provider || form.email_provider === 'smtp') && (
            <Card icon="hdd-network-fill" title="SMTP Configuration">
              <div className="row g-3">
                <div className="col-md-5">
                  <Field label="Host" name="smtp_host" value={form.smtp_host} onChange={set} />
                </div>
                <div className="col-md-2">
                  <Field label="Port" name="smtp_port" type="number" value={form.smtp_port} onChange={set} />
                </div>
                <div className="col-md-5">
                  <Field label="Username" name="smtp_user" value={form.smtp_user} onChange={set} />
                </div>
                <div className="col-md-12">
                  <Field label="Password" name="smtp_pass" type="password" value={form.smtp_pass} onChange={set}
                    hint="For Gmail SMTP: use App Password (2FA must be enabled). Port 587 (TLS) or 465 (SSL)." />
                </div>
              </div>
              <SaveBtn saving={saving} label="Save SMTP"
                onClick={() => save(['email_provider','smtp_from_name','smtp_from','smtp_host','smtp_port','smtp_user','smtp_pass'])} />
            </Card>
          )}

          {form.email_provider === 'sendgrid' && (
            <Card icon="send-fill" title="SendGrid Configuration">
              <Field label="API Key" name="sendgrid_key" type="password" value={form.sendgrid_key} onChange={set} />
              <SaveBtn saving={saving} label="Save SendGrid"
                onClick={() => save(['email_provider','smtp_from_name','smtp_from','sendgrid_key'])} />
            </Card>
          )}

          {form.email_provider === 'mailgun' && (
            <Card icon="mailbox-fill" title="Mailgun Configuration">
              <div className="row g-3">
                <div className="col-md-6">
                  <Field label="API Key" name="mailgun_key" type="password" value={form.mailgun_key} onChange={set} />
                </div>
                <div className="col-md-6">
                  <Field label="Domain" name="mailgun_domain" value={form.mailgun_domain} onChange={set} />
                </div>
              </div>
              <SaveBtn saving={saving} label="Save Mailgun"
                onClick={() => save(['email_provider','smtp_from_name','smtp_from','mailgun_key','mailgun_domain'])} />
            </Card>
          )}
        </>
      )}

      {/* ── WHATSAPP ──────────────────────────────────── */}
      {tab === 'whatsapp' && (
        <>
          <Card icon="whatsapp" title="Active WhatsApp Provider">
            <div className="d-flex align-items-end gap-3">
              <div className="crm-int-provider-wrap">
                <Select
                  label="Provider"
                  name="wa_provider"
                  value={form.wa_provider || 'meta'}
                  onChange={set}
                  options={[
                    { value: 'meta',    label: 'Meta Cloud API (Direct)' },
                    { value: 'gupshup', label: 'Gupshup' },
                    { value: 'anantya', label: 'Anantya.ai' },
                  ]}
                />
              </div>
              <div className="mb-3">
                <SaveBtn saving={saving} label="Set Provider" onClick={() => save(['wa_provider'])} />
              </div>
            </div>
          </Card>

          {(!form.wa_provider || form.wa_provider === 'meta') && (
            <Card icon="meta" title="Meta Cloud API Configuration">
              <div className="row g-3">
                <div className="col-md-6">
                  <Field label="Access Token" name="wa_meta_token" type="password" value={form.wa_meta_token} onChange={set} />
                </div>
                <div className="col-md-6">
                  <Field label="Phone Number ID" name="wa_meta_phone_id" value={form.wa_meta_phone_id} onChange={set} />
                </div>
                <div className="col-md-12">
                  <Field label="Webhook URL (point in Meta Dashboard)" name="_wa_webhook"
                    value={`${APP_URL}/webhook/whatsapp`} readOnly />
                </div>
              </div>
              <SaveBtn saving={saving} label="Save Meta Config"
                onClick={() => save(['wa_provider','wa_meta_token','wa_meta_phone_id'])} />
            </Card>
          )}

          {form.wa_provider === 'gupshup' && (
            <Card icon="chat-left-text-fill" title="Gupshup Configuration">
              <div className="row g-3">
                <div className="col-md-6">
                  <Field label="API Key" name="wa_gupshup_api_key" type="password" value={form.wa_gupshup_api_key} onChange={set} />
                </div>
                <div className="col-md-6">
                  <Field label="Source Number" name="wa_gupshup_src_number" value={form.wa_gupshup_src_number} onChange={set} />
                </div>
              </div>
              <SaveBtn saving={saving} label="Save Gupshup"
                onClick={() => save(['wa_provider','wa_gupshup_api_key','wa_gupshup_src_number'])} />
            </Card>
          )}

          {form.wa_provider === 'anantya' && (
            <Card icon="stars" title="Anantya.ai Configuration">
              <Field label="API Key" name="wa_anantya_api_key" type="password" value={form.wa_anantya_api_key} onChange={set}
                hint="Get your API key from Anantya dashboard." />
              <Field label="Connected WhatsApp Number (for your reference)" name="wa_anantya_waba_id" value={form.wa_anantya_waba_id} onChange={set}
                hint="Not fetched automatically — Anantya's API doesn't expose this. Type in the number/business name shown on your Anantya dashboard so it's visible here too." />
              <Field label="Webhook URL (register in Anantya Dashboard)" name="_anantya_webhook"
                value={`${APP_URL}/webhook/anantya`} readOnly
                hint="Without this registered on Anantya's side, delivery status and replies never reach this CRM — messages will send fine but nothing comes back." />
              <div className="d-flex align-items-center gap-3">
                <SaveBtn saving={saving} label="Save Anantya Config"
                  onClick={() => save(['wa_provider','wa_anantya_api_key','wa_anantya_waba_id'])} />
                <TestAnantya apiKey={form.wa_anantya_api_key} />
              </div>
            </Card>
          )}
        </>
      )}

      {/* ── SMS ───────────────────────────────────────── */}
      {tab === 'sms' && <SmsTab form={form} set={set} saving={saving} save={save} toast={toast} />}

      {/* ── RCS ───────────────────────────────────────── */}
      {tab === 'rcs' && (
        <Card icon="chat-dots-fill" title="RCS via Anantya.ai">
          <div className="alert py-2 px-3 text-12 mb-3"
            style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534' }}>
            <i className="bi bi-info-circle me-1" />
            Anantya supports both <strong>WhatsApp</strong> and <strong>RCS</strong> using the same API key.
            Configure your key in the <strong>WhatsApp → Anantya</strong> tab.
          </div>
        </Card>
      )}

      {/* ── LEAD SOURCES API ──────────────────────────── */}
      {tab === 'leads_api' && (
        <>
          <div className="crm-tabs mb-4">
            {LEAD_SOURCE_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setLeadSourceTab(t.id)}
                className={`crm-tab${leadSourceTab === t.id ? ' active' : ''}`}
              >
                <i className={`bi bi-${t.icon}`} />
                {t.label}
              </button>
            ))}
          </div>

          {leadSourceTab === 'indiamart' && (
            <IndiamartCard form={form} set={set} saving={saving} save={save} toast={toast} />
          )}

          {leadSourceTab === 'tradeindia' && (
            <TradeindiaCard form={form} set={set} saving={saving} save={save} toast={toast} />
          )}

          {leadSourceTab === 'meta' && (
            <MetaAdsCard form={form} set={set} saving={saving} save={save} />
          )}

          {leadSourceTab === 'google_ads' && (
            <GoogleAdsCard form={form} set={set} saving={saving} save={save} />
          )}

          {leadSourceTab === 'linkedin' && (
            <LinkedinCard form={form} set={set} saving={saving} save={save} toast={toast} />
          )}

          {leadSourceTab === 'justdial' && (
            <JustdialCard form={form} set={set} saving={saving} save={save} toast={toast} />
          )}

          {leadSourceTab === 'google_sheets' && (
            <GoogleSheetsCard form={form} set={set} saving={saving} save={save} toast={toast} />
          )}

          {leadSourceTab === 'shopify' && (
            <ShopifyCard form={form} set={set} saving={saving} save={save} toast={toast} />
          )}

          {leadSourceTab === 'hubspot' && (
            <HubspotCard form={form} set={set} saving={saving} save={save} toast={toast} />
          )}

          {leadSourceTab === 'salesforce' && (
            <SalesforceCard form={form} set={set} saving={saving} save={save} toast={toast} />
          )}

          {leadSourceTab === 'mailchimp' && (
            <MailchimpCard form={form} set={set} saving={saving} save={save} toast={toast} />
          )}

          {leadSourceTab === 'zendesk' && (
            <ZendeskCard form={form} set={set} saving={saving} save={save} toast={toast} />
          )}

          {leadSourceTab === 'apollo' && (
            <ApolloCard form={form} set={set} saving={saving} save={save} toast={toast} />
          )}

          {leadSourceTab === 'lusha' && (
            <LushaCard form={form} set={set} saving={saving} save={save} toast={toast} />
          )}

          {leadSourceTab === 'zoominfo' && (
            <ZoominfoCard form={form} set={set} saving={saving} save={save} toast={toast} />
          )}

          {leadSourceTab === 'bombora' && (
            <IntentSignalCard icon="graph-up-arrow" title="Bombora" settingKey="bombora_api_key" syncSlug="bombora" webhookSlug="bombora"
              form={form} set={set} save={save} saving={saving} toast={toast} />
          )}

          {leadSourceTab === 'g2_intent' && (
            <IntentSignalCard icon="activity" title="G2 Intent" settingKey="g2_intent_api_key" syncSlug="g2_intent" webhookSlug="g2_intent"
              form={form} set={set} save={save} saving={saving} toast={toast} />
          )}
        </>
      )}
    </div>
  );
}
