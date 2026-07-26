import { config } from '../config/index.js';
import { getSetting } from './settings.service.js';

const DEFAULT_MSHASTRA_URL = 'https://mshastra.com/sendurl.aspx';

function cleanDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function pick(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}

function normalizeProvider(provider) {
  const value = String(provider || '').trim().toLowerCase();
  return value || 'mshastra';
}

// MShastra needs its own approved sender ID per country for some destinations —
// Bahrain/Malaysia/DRC route through 'Mobishtra' and India through 'ZAMZAM',
// regardless of what's configured in Settings; everywhere else falls back to
// the company's configured (or default) sender.
function resolveMshastraSenderId(mobile, configuredSender) {
  const value = String(mobile || '');
  if (value.startsWith('+973') || value.startsWith('+60') || value.startsWith('+243')) return 'Mobishtra';
  if (value.startsWith('+91')) return 'ZAMZAM';
  return configuredSender || 'MOALRT';
}

function redactPhone(value) {
  const digits = cleanDigits(value);
  if (digits.length <= 4) return digits;
  return `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
}

function isLikelyProviderError(text) {
  return /\b(error|invalid|fail|failed|wrong|denied|insufficient|expired|not\s+found|blocked)\b/i.test(text || '');
}

export function isMshastraSuccess(text, httpOk = true) {
  const raw = String(text || '').trim();
  if (!httpOk) return false;
  if (!raw) return false;
  if (/^(20|SubmitID:|success|sent|ok\b)/i.test(raw)) return true;
  if (/^\d{5,}$/.test(raw)) return true;
  return !isLikelyProviderError(raw);
}

export async function resolveSmsConfig(companyId, accountConfig = {}) {
  const provider = normalizeProvider(
    pick(accountConfig.provider, await getSetting('sms_provider', config.sms.provider, companyId))
  );

  if (provider === 'mshastra') {
    return {
      provider,
      url: pick(
        accountConfig.url,
        accountConfig.send_url,
        await getSetting('sms_mshastra_url', config.sms.mshastra.url, companyId),
        DEFAULT_MSHASTRA_URL
      ),
      user: pick(
        accountConfig.user,
        accountConfig.username,
        await getSetting('sms_mshastra_user', config.sms.mshastra.user, companyId)
      ),
      pwd: pick(
        accountConfig.pwd,
        accountConfig.password,
        await getSetting('sms_mshastra_pwd', config.sms.mshastra.pwd, companyId)
      ),
      sender: pick(
        accountConfig.sender,
        accountConfig.senderid,
        await getSetting('sms_mshastra_sender', config.sms.mshastra.sender, companyId)
      ),
    };
  }

  return {
    provider,
    apiUrl: pick(accountConfig.send_url, accountConfig.api_url, await getSetting('sms_api_url', config.sms.apiUrl, companyId)),
    apiKey: pick(accountConfig.api_key, accountConfig.token, await getSetting('sms_api_key', config.sms.apiKey, companyId)),
    sender: pick(accountConfig.sender, accountConfig.from, await getSetting('sms_sender', config.sms.sender, companyId)),
    headers: accountConfig.headers && typeof accountConfig.headers === 'object' ? accountConfig.headers : {},
  };
}

export async function sendMshastraSms({ to, message, smsConfig }) {
  const user = pick(smsConfig?.user);
  const pwd = pick(smsConfig?.pwd);
  const baseUrl = pick(smsConfig?.url, DEFAULT_MSHASTRA_URL);
  const mobile = String(to || '').trim();
  const sender = resolveMshastraSenderId(mobile, smsConfig?.sender);

  if (!user || !pwd) {
    return { success: false, provider: 'mshastra', msgId: null, error: 'mshastra_not_configured' };
  }
  if (!mobile) {
    return { success: false, provider: 'mshastra', msgId: null, error: 'no_mobile' };
  }
  if (!message) {
    return { success: false, provider: 'mshastra', msgId: null, error: 'empty_sms_message' };
  }

  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    return { success: false, provider: 'mshastra', msgId: null, error: 'invalid_mshastra_url' };
  }

  // Matches the known-working request shape exactly: full number (with country
  // code) in mobileno, and CountryCode is always the literal "All" — not an
  // actual country code, despite the parameter name.
  url.searchParams.set('user', user);
  url.searchParams.set('pwd', pwd);
  url.searchParams.set('senderid', sender);
  url.searchParams.set('mobileno', mobile);
  url.searchParams.set('msgtext', message);
  url.searchParams.set('CountryCode', 'All');

  let response;
  try {
    response = await fetch(url.toString(), { method: 'GET', redirect: 'follow' });
  } catch (err) {
    return { success: false, provider: 'mshastra', msgId: null, error: `network_error: ${err.message}` };
  }

  const raw = (await response.text().catch(() => '')).trim();
  console.log(`[mshastra] HTTP ${response.status} | to=${redactPhone(mobile)} | senderid=${sender} | raw: ${raw.slice(0, 300)}`);

  if (!isMshastraSuccess(raw, response.ok)) {
    return {
      success: false,
      provider: 'mshastra',
      msgId: null,
      error: raw || `HTTP ${response.status}`,
      raw,
      status: response.status,
    };
  }

  const msgId = raw.replace(/^SubmitID:/i, '').trim() || raw;
  return { success: true, provider: 'mshastra', msgId, error: null, raw, status: response.status };
}

export async function sendGenericHttpSms({ to, message, template, smsConfig }) {
  if (!smsConfig?.apiUrl || !smsConfig?.apiKey || !smsConfig?.sender) {
    return { success: false, provider: smsConfig?.provider || 'sms_http', msgId: null, error: 'sms_provider_not_configured' };
  }

  let response;
  try {
    response = await fetch(smsConfig.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${smsConfig.apiKey}`,
        ...smsConfig.headers,
      },
      body: JSON.stringify({
        to: cleanDigits(to),
        from: smsConfig.sender,
        message,
        template_id: template?.wa_template_id || null,
      }),
    });
  } catch (err) {
    return { success: false, provider: smsConfig.provider || 'sms_http', msgId: null, error: `network_error: ${err.message}` };
  }

  const raw = await response.text().catch(() => '');
  let payload = {};
  try { payload = JSON.parse(raw); } catch {}
  const msgId = payload.message_id || payload.id || payload.data?.id || null;
  if (!response.ok) {
    return {
      success: false,
      provider: smsConfig.provider || 'sms_http',
      msgId: null,
      error: payload.message || raw.slice(0, 300) || `HTTP ${response.status}`,
      raw,
      status: response.status,
    };
  }

  return { success: true, provider: smsConfig.provider || 'sms_http', msgId, error: null, raw, status: response.status };
}

export async function sendSms({ to, message, companyId, accountConfig = {}, template = null }) {
  const smsConfig = await resolveSmsConfig(companyId, accountConfig);
  if (smsConfig.provider === 'mshastra') {
    return sendMshastraSms({ to, message, smsConfig });
  }
  return sendGenericHttpSms({ to, message, template, smsConfig });
}
