import nodemailer from 'nodemailer';
import { run } from '../db/pool.js';
import { config } from '../config/index.js';
import { trackingUid } from '../utils/crypto.js';
import { getSetting } from './settings.service.js';

// ─── Template helpers ─────────────────────────────────────────────

export function renderTemplate(template, lead) {
  const name = lead?.name || '';
  return String(template || '')
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{first_name\}\}/g, String(name).split(' ')[0] || '')
    .replace(/\{\{email\}\}/g, lead?.email || '')
    .replace(/\{\{mobile\}\}/g, lead?.mobile || '')
    .replace(/\{\{company\}\}/g, lead?.company || '')
    .replace(/\{\{product_interest\}\}/g, lead?.product_interest || '')
    .replace(/\{\{city\}\}/g, lead?.city || '');
}

export function injectEmailTracking(html, commId) {
  const base = `${config.appUrl}/api/track`;
  const uid = trackingUid(commId);
  const pixel = `<img src="${base}/open/${uid}" width="1" height="1" style="display:none" />`;
  const withPixel = String(html || '').includes('</body>')
    ? String(html).replace('</body>', `${pixel}</body>`)
    : `${html}${pixel}`;
  return withPixel.replace(/<a([^>]*)href=["']([^"']+)["']/gi, (_m, attrs, url) => {
    return `<a${attrs}href="${base}/click/${uid}?url=${encodeURIComponent(url)}"`;
  });
}

// ─── Anantya.ai helper ────────────────────────────────────────────

function normalizePhone(mobile) {
  const digits = String(mobile || '').replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return digits;
  if (digits.length === 10) return `91${digits}`;
  return digits;
}

// In-memory cache: waTemplateId → variable count
// Populated lazily by fetchAnantyaVarCounts(); cleared on server restart.
const _varCountCache = new Map();

// Fetch ALL templates from Anantya and cache their variable counts.
// Returns the count for the requested templateId (or 0 if not found).
async function fetchAnantyaVarCounts(apiKey, wantedTemplateId) {
  try {
    const response = await fetch('https://apiv1.anantya.ai/api/Campaign/GetTemplates', {
      headers: { accept: '*/*', 'X-Api-Key': apiKey },
    });
    const data = await response.json().catch(() => ({}));
    const raw = data.dataObj || data.DataObj || data.data || [];

    for (const t of raw) {
      const tId = String(t.id || t.templateId || t.TemplateId || t.name || '').trim();
      if (!tId) continue;

      let count = 0;

      // 1. Count {{N}} in msgText body
      const body = t.msgText || t.MsgText || t.body || t.Body || '';
      const bodyMatches = (body || '').match(/\{\{(\w+)\}\}/g) || [];
      count = bodyMatches.length;

      // 2. Explicit variableCount field from Anantya
      if (!count) {
        const raw_count = t.variableCount ?? t.VariableCount ?? t.variable_count ?? t.param_count;
        if (raw_count != null) count = Number(raw_count);
      }

      // 3. Components array (Meta format)
      if (!count && Array.isArray(t.components || t.Components)) {
        const comps = t.components || t.Components || [];
        const bodyComp = comps.find(c => (c.type || c.Type || '').toUpperCase() === 'BODY');
        if (bodyComp) {
          const compBody = bodyComp.text || bodyComp.Text || '';
          const compMatches = (compBody || '').match(/\{\{(\w+)\}\}/g) || [];
          count = compMatches.length;
          // Example values list as last resort
          if (!count) {
            const exVars = bodyComp.example?.body_text?.[0] || bodyComp.example?.body_text || [];
            if (Array.isArray(exVars)) count = exVars.length;
          }
        }
      }

      _varCountCache.set(tId, count);
    }
  } catch (err) {
    console.warn('[anantya] fetchAnantyaVarCounts failed:', err.message);
  }

  return _varCountCache.get(String(wantedTemplateId)) ?? 0;
}

// Resolve the number of variables to send for a WhatsApp/RCS template.
// Priority: stored variables.count → body {{N}} detection → live Anantya API fetch → 0
async function resolveVarCount(apiKey, templateId, template) {
  // 1. From DB variables column
  if (template.variables) {
    try {
      const v = typeof template.variables === 'string' ? JSON.parse(template.variables) : template.variables;
      if (v?.count > 0) return v.count;
    } catch {}
  }

  // 2. From body {{N}} patterns
  const bodyMatches = (template.body || '').match(/\{\{(\w+)\}\}/g) || [];
  if (bodyMatches.length > 0) return bodyMatches.length;

  // 3. From in-memory cache (populated by prior fetch)
  if (_varCountCache.has(String(templateId))) {
    return _varCountCache.get(String(templateId));
  }

  // 4. Live fetch from Anantya — populates cache for all templates
  console.log(`[anantya] variable count unknown for "${templateId}" — fetching from Anantya API`);
  const count = await fetchAnantyaVarCounts(apiKey, templateId);

  // 5. Persist to DB so we don't need to fetch again next time
  if (count > 0 && template.id) {
    run('UPDATE templates SET variables=? WHERE id=?', [
      JSON.stringify({ count }), template.id
    ]).catch(() => {});
  }

  return count;
}

// Build the positional attribute values array from lead data
function buildVarValues(count, lead) {
  const positionalFields = [
    lead?.name || '',
    lead?.company || lead?.name || '',
    lead?.email || lead?.city || lead?.name || '',
    lead?.mobile || '',
    lead?.product_interest || '',
    lead?.city || '',
  ];
  return Array.from({ length: count }, (_, i) => positionalFields[i] ?? '');
}

// Extract variable values from template body {{N}} / {{word}} patterns.
// Falls back to buildVarValues(storedCount) when body has no patterns.
function extractVariables(body, lead, storedVariables = null) {
  const positionalFields = [
    lead?.name || '',
    lead?.company || lead?.name || '',
    lead?.email || lead?.city || lead?.name || '',
    lead?.mobile || '',
    lead?.product_interest || '',
    lead?.city || '',
  ];

  const vars = [];
  const re = /\{\{(\w+)\}\}/g;
  let m;
  while ((m = re.exec(body || '')) !== null) {
    const key = m[1];
    if (/^\d+$/.test(key)) {
      vars.push(positionalFields[parseInt(key, 10) - 1] ?? '');
    } else {
      const value =
        key === 'name'             ? (lead?.name || '') :
        key === 'first_name'       ? (String(lead?.name || '').split(' ')[0] || '') :
        key === 'email'            ? (lead?.email || '') :
        key === 'mobile'           ? (lead?.mobile || '') :
        key === 'company'          ? (lead?.company || '') :
        key === 'product_interest' ? (lead?.product_interest || '') :
        key === 'city'             ? (lead?.city || '') :
        (lead?.[key] || '');
      vars.push(value);
    }
  }

  // Fallback: body has no {{}} markers — use stored count
  if (vars.length === 0 && storedVariables) {
    let stored = storedVariables;
    if (typeof stored === 'string') { try { stored = JSON.parse(stored); } catch { stored = null; } }
    const count = Number(stored?.count || 0);
    for (let i = 0; i < count; i++) vars.push(positionalFields[i] ?? '');
  }

  return vars;
}

async function sendAnantya(channel, apiKey, to, anantya_template_id, variables = [], contactName = '') {
  const ANANTYA_BASE = 'https://apiv1.anantya.ai';
  const url = `${ANANTYA_BASE}/api/Campaign/SendSingleTemplateMessage?templateId=${anantya_template_id}`;

  const form = new FormData();
  form.append('ContactNo', to);
  form.append('ContactName', contactName || '');
  form.append('MediaFile', '');
  form.append('MediaFileName', '');
  for (let i = 0; i < variables.length; i++) {
    form.append(`Attribute${i + 1}`, variables[i] ?? '');
  }

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'X-Api-Key': apiKey, accept: '*/*' },
      body: form,
    });
  } catch (fetchErr) {
    return { success: false, msgId: null, error: `network_error: ${fetchErr.message}` };
  }

  const text = await response.text().catch(() => '');
  let data = {};
  try { data = JSON.parse(text); } catch {}

  console.log(`[anantya][${channel}] HTTP ${response.status} | raw: ${text.slice(0, 300)}`);

  const success = data.isSuccess ?? data.IsSuccess ?? response.ok;
  const msgId   = data.messageId || data.MessageId || data?.dataObj?.messageId || data?.dataObj?.id || data?.data?.messageId || null;
  const error   = success ? null : (data.message || data.Message || text.slice(0, 200) || `HTTP ${response.status}`);

  return { success, msgId, error };
}

// ─── Main send function ───────────────────────────────────────────

export async function sendCommunication(channel, lead, template, enrollmentId = null, stepId = null) {
  const destination = channel === 'email' ? lead.email : lead.mobile;
  if (!destination) {
    return { delivered: false, comm_id: null, error: channel === 'email' ? 'no_email_address' : 'no_mobile' };
  }

  const renderedBody = renderTemplate(template?.body || `Hello {{name}}`, lead);
  const subject = channel === 'email' ? renderTemplate(template?.subject || '', lead) : null;

  const result = await run(
    `INSERT INTO communications (lead_id,enrollment_id,step_id,channel,template_id,to_address,subject,body_rendered,status) VALUES (?,?,?,?,?,?,?,?,?)`,
    [lead.id, enrollmentId, stepId, channel, template?.id || null, destination, subject, renderedBody, 'queued']
  );
  const commId = Number(result.insertId);

  // ── Simulation mode ─────────────────────────────────────────────
  if (config.deliveryMode === 'simulate') {
    const msgId = `sim-${channel}-${commId}`;
    await run(
      "UPDATE communications SET status='delivered', provider='simulation', provider_msg_id=?, sent_at=NOW(), delivered_at=NOW() WHERE id=?",
      [msgId, commId]
    );
    return { delivered: true, comm_id: commId, provider_msg_id: msgId, error: null };
  }

  // ── Email (SMTP) ─────────────────────────────────────────────────
  if (channel === 'email') {
    const smtpHost = await getSetting('smtp_host', '', lead.company_id);
    if (!smtpHost) {
      await run("UPDATE communications SET status='failed', failed_reason='smtp_not_configured' WHERE id=?", [commId]);
      return { delivered: false, comm_id: commId, error: 'smtp_not_configured' };
    }
    try {
      const smtpPort = await getSetting('smtp_port', '587', lead.company_id);
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(smtpPort),
        secure: smtpPort === '465',
        auth: { user: await getSetting('smtp_user', '', lead.company_id), pass: await getSetting('smtp_pass', '', lead.company_id) }
      });
      const from     = await getSetting('smtp_from', await getSetting('smtp_user', '', lead.company_id), lead.company_id);
      const fromName = await getSetting('smtp_from_name', 'Dot Domino CRM', lead.company_id);
      const html     = injectEmailTracking(renderedBody, commId);
      const info     = await transporter.sendMail({
        from: `${fromName} <${from}>`,
        to: lead.email, subject, html,
        text: html.replace(/<[^>]+>/g, ' ')
      });
      await run(
        "UPDATE communications SET status='sent', provider='smtp', provider_msg_id=?, sent_at=NOW() WHERE id=?",
        [info.messageId || null, commId]
      );
      return { delivered: true, comm_id: commId, provider_msg_id: info.messageId || null, error: null };
    } catch (err) {
      await run("UPDATE communications SET status='failed', failed_reason=? WHERE id=?", [String(err.message).slice(0, 500), commId]);
      return { delivered: false, comm_id: commId, error: err.message };
    }
  }

  // ── WhatsApp (Anantya.ai) ────────────────────────────────────────
  if (channel === 'whatsapp') {
    const apiKey = await getSetting('wa_anantya_api_key', '', lead.company_id);
    if (!apiKey) {
      await run("UPDATE communications SET status='failed', failed_reason='anantya_wa_key_not_configured' WHERE id=?", [commId]);
      return { delivered: false, comm_id: commId, error: 'anantya_wa_key_not_configured' };
    }
    const anantya_template_id = template?.wa_template_id;
    if (!anantya_template_id) {
      await run("UPDATE communications SET status='failed', failed_reason='no_wa_template_id_on_template' WHERE id=?", [commId]);
      return { delivered: false, comm_id: commId, error: 'no_wa_template_id_on_template' };
    }
    try {
      const to = normalizePhone(lead.mobile);

      // Detect variable count: DB → body → Anantya API (auto-fetched + cached)
      let variables = extractVariables(template.body, lead, template.variables);
      if (variables.length === 0) {
        const count = await resolveVarCount(apiKey, anantya_template_id, template);
        if (count > 0) variables = buildVarValues(count, lead);
      }

      console.log(`[anantya][whatsapp] template="${template.name}" waId="${anantya_template_id}" vars(${variables.length})=${JSON.stringify(variables)}`);

      const res = await sendAnantya('whatsapp', apiKey, to, anantya_template_id, variables, lead.name || '');
      if (res.success) {
        await run(
          "UPDATE communications SET status='sent', provider='anantya_whatsapp', provider_msg_id=?, sent_at=NOW() WHERE id=?",
          [res.msgId, commId]
        );
        return { delivered: true, comm_id: commId, provider_msg_id: res.msgId, error: null };
      }
      await run("UPDATE communications SET status='failed', failed_reason=? WHERE id=?", [String(res.error).slice(0, 500), commId]);
      return { delivered: false, comm_id: commId, error: res.error };
    } catch (err) {
      await run("UPDATE communications SET status='failed', failed_reason=? WHERE id=?", [String(err.message).slice(0, 500), commId]);
      return { delivered: false, comm_id: commId, error: err.message };
    }
  }

  // ── RCS (Anantya.ai) ─────────────────────────────────────────────
  if (channel === 'rcs') {
    const apiKey = (await getSetting('rcs_api_key', '', lead.company_id)) || (await getSetting('wa_anantya_api_key', '', lead.company_id));
    if (!apiKey) {
      await run("UPDATE communications SET status='failed', failed_reason='anantya_rcs_key_not_configured' WHERE id=?", [commId]);
      return { delivered: false, comm_id: commId, error: 'anantya_rcs_key_not_configured' };
    }
    const anantya_template_id = template?.wa_template_id;
    if (!anantya_template_id) {
      await run("UPDATE communications SET status='failed', failed_reason='no_rcs_template_id_on_template' WHERE id=?", [commId]);
      return { delivered: false, comm_id: commId, error: 'no_rcs_template_id_on_template' };
    }
    try {
      const to = normalizePhone(lead.mobile);

      let variables = extractVariables(template.body, lead, template.variables);
      if (variables.length === 0) {
        const count = await resolveVarCount(apiKey, anantya_template_id, template);
        if (count > 0) variables = buildVarValues(count, lead);
      }

      console.log(`[anantya][rcs] template="${template.name}" waId="${anantya_template_id}" vars(${variables.length})=${JSON.stringify(variables)}`);

      const res = await sendAnantya('rcs', apiKey, to, anantya_template_id, variables, lead.name || '');
      if (res.success) {
        await run(
          "UPDATE communications SET status='sent', provider='anantya_rcs', provider_msg_id=?, sent_at=NOW() WHERE id=?",
          [res.msgId, commId]
        );
        return { delivered: true, comm_id: commId, provider_msg_id: res.msgId, error: null };
      }
      await run("UPDATE communications SET status='failed', failed_reason=? WHERE id=?", [String(res.error).slice(0, 500), commId]);
      return { delivered: false, comm_id: commId, error: res.error };
    } catch (err) {
      await run("UPDATE communications SET status='failed', failed_reason=? WHERE id=?", [String(err.message).slice(0, 500), commId]);
      return { delivered: false, comm_id: commId, error: err.message };
    }
  }

  // ── Unsupported channel ──────────────────────────────────────────
  await run(
    "UPDATE communications SET status='failed', failed_reason=? WHERE id=?",
    [`${channel}_provider_not_configured`, commId]
  );
  return { delivered: false, comm_id: commId, error: `${channel}_provider_not_configured` };
}
