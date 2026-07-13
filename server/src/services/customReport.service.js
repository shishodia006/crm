import nodemailer from 'nodemailer';
import { q, run } from '../db/pool.js';
import { getSetting } from './settings.service.js';
import { pipelineSnapshot, actionRequired, leadSourceTrends, dripSequences } from './overview.service.js';

export const REPORT_CATALOG = [
  { key: 'revenue_by_source', label: 'Revenue by Source', description: 'Pipeline value and win rate broken down by lead source.', icon: 'currency-rupee', color: '#22c55e' },
  { key: 'agent_leaderboard', label: 'Sales Rep Leaderboard', description: 'Deals won, average deal size, and quota attainment per rep.', icon: 'trophy-fill', color: '#0ea5e9' },
  { key: 'funnel_dropoff', label: 'Funnel Drop-off Analysis', description: 'Stage-by-stage conversion with vs-last-month trend.', icon: 'funnel-fill', color: '#f59e0b' },
  { key: 'stalled_deals', label: 'Stalled Deals Watchlist', description: 'Deals with no activity in 7+ days, sorted by value at risk.', icon: 'exclamation-triangle-fill', color: '#ef4444' },
  { key: 'lead_source_roi', label: 'Lead Source ROI', description: 'Lead volume, conversion rate, and revenue across every acquisition channel.', icon: 'graph-up-arrow', color: '#8b5cf6' },
  { key: 'drip_performance', label: 'Drip Campaign Performance', description: 'Open, click, and conversion rate for every active sequence.', icon: 'lightning-charge-fill', color: '#6366f1' },
  { key: 'response_time_sla', label: 'Response Time SLA', description: 'First-response time across email, WhatsApp, and SMS.', icon: 'stopwatch-fill', color: '#0d9488' },
  { key: 'regional_breakdown', label: 'Regional Breakdown', description: 'Pipeline and lead volume sliced by state/territory.', icon: 'geo-alt-fill', color: '#db2777' },
];
export const CATALOG_BY_KEY = Object.fromEntries(REPORT_CATALOG.map((c) => [c.key, c]));

export async function revenueBySource(companyId) {
  return q(
    `SELECT ls.name, ls.category, COUNT(d.id) AS deals,
            COALESCE(SUM(CASE WHEN d.id IS NOT NULL THEN r.amount ELSE 0 END),0) AS revenue
     FROM lead_sources ls LEFT JOIN revenue_records r ON r.source_id=ls.id
     LEFT JOIN deals d ON d.id=r.deal_id AND d.company_id=?
     GROUP BY ls.id ORDER BY revenue DESC`,
    [companyId]
  );
}

export async function agentLeaderboard(companyId) {
  return q(
    `SELECT u.id, u.name, u.role, COALESCE(l.leads_assigned,0) AS leads_assigned,
            COALESCE(l.conversions,0) AS conversions,
            ROUND(COALESCE(l.conversions,0)/NULLIF(COALESCE(l.leads_assigned,0),0)*100,1) AS conv_rate,
            COALESCE(r.revenue,0) AS revenue
     FROM company_users cu JOIN users u ON u.id=cu.user_id
     LEFT JOIN (SELECT assigned_to, COUNT(*) AS leads_assigned, SUM(status='won') AS conversions FROM leads WHERE company_id=? GROUP BY assigned_to) l ON l.assigned_to=u.id
     LEFT JOIN (SELECT r.agent_id, SUM(r.amount) AS revenue FROM revenue_records r JOIN deals d ON d.id=r.deal_id WHERE d.company_id=? GROUP BY r.agent_id) r ON r.agent_id=u.id
     WHERE cu.company_id=? AND u.role IN ('agent','manager') AND u.is_active=1 ORDER BY conversions DESC`,
    [companyId, companyId, companyId]
  );
}

async function leadSourceRoi(companyId) {
  const [{ sources }, revenue] = await Promise.all([leadSourceTrends(companyId), revenueBySource(companyId)]);
  const revenueByName = Object.fromEntries(revenue.map((r) => [r.name, Number(r.revenue)]));
  return sources.map((s) => ({ ...s, revenue: revenueByName[s.name] || 0 }));
}

export async function responseTimeSla(companyId) {
  const rows = await q(
    `SELECT cm.channel, ROUND(AVG(TIMESTAMPDIFF(MINUTE, l.created_at, cm.first_sent)),1) AS avg_minutes, COUNT(*) AS leads
     FROM leads l
     JOIN (SELECT lead_id, channel, MIN(sent_at) AS first_sent FROM communications WHERE sent_at IS NOT NULL GROUP BY lead_id, channel) cm ON cm.lead_id=l.id
     WHERE l.company_id=? GROUP BY cm.channel ORDER BY avg_minutes ASC`,
    [companyId]
  );
  const label = (mins) => {
    const n = Number(mins) || 0;
    if (n < 60) return `${Math.round(n)}m`;
    const hours = Math.floor(n / 60);
    if (hours < 24) return `${hours}h ${Math.round(n % 60)}m`;
    return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  };
  return rows.map((r) => ({ channel: r.channel, avgMinutes: Number(r.avg_minutes), avgLabel: label(r.avg_minutes), leads: Number(r.leads) }));
}

export async function regionalBreakdown(companyId) {
  const rows = await q(
    `SELECT COALESCE(NULLIF(l.state,''), l.country, 'Unknown') AS region,
            COUNT(DISTINCT l.id) AS leads, COUNT(DISTINCT d.id) AS deals,
            COALESCE(SUM(d.value),0) AS pipeline_value, SUM(l.status='won') AS won
     FROM leads l LEFT JOIN deals d ON d.lead_id=l.id AND d.company_id=?
     WHERE l.company_id=? GROUP BY region ORDER BY pipeline_value DESC`,
    [companyId, companyId]
  );
  return rows.map((r) => ({ region: r.region, leads: Number(r.leads), deals: Number(r.deals), pipelineValue: Number(r.pipeline_value), won: Number(r.won) }));
}

export async function fetchReportData(dataSource, companyId) {
  switch (dataSource) {
    case 'revenue_by_source': return { rows: await revenueBySource(companyId) };
    case 'agent_leaderboard': return { agents: await agentLeaderboard(companyId) };
    case 'funnel_dropoff':    return { funnel: await pipelineSnapshot(companyId) };
    case 'stalled_deals':     return await actionRequired(companyId);
    case 'lead_source_roi':   return { sources: await leadSourceRoi(companyId) };
    case 'drip_performance':  return await dripSequences(companyId);
    case 'response_time_sla': return { channels: await responseTimeSla(companyId) };
    case 'regional_breakdown': return { regions: await regionalBreakdown(companyId) };
    default: throw new Error(`Unknown report data source: ${dataSource}`);
  }
}

// ─── Scheduling ─────────────────────────────────────────────

export function computeNextSendAt(schedule, from = new Date()) {
  const [h, m, s] = String(schedule.send_time || '09:00:00').split(':').map(Number);
  const next = new Date(from);
  next.setHours(h || 0, m || 0, s || 0, 0);

  if (schedule.frequency === 'daily') {
    if (next <= from) next.setDate(next.getDate() + 1);
    return next;
  }

  if (schedule.frequency === 'weekly') {
    const targetDow = Number(schedule.day_of_week ?? 1);
    let diff = (targetDow - next.getDay() + 7) % 7;
    if (diff === 0 && next <= from) diff = 7;
    next.setDate(next.getDate() + diff);
    return next;
  }

  // monthly
  const targetDom = Math.min(28, Math.max(1, Number(schedule.day_of_month || 1)));
  next.setDate(targetDom);
  if (next <= from) { next.setMonth(next.getMonth() + 1); next.setDate(targetDom); }
  return next;
}

export async function resolveRecipientEmails(companyId, recipients) {
  let parsed = recipients;
  if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { parsed = {}; } }
  if (parsed?.type === 'team') {
    const rows = await q('SELECT u.email FROM company_users cu JOIN users u ON u.id=cu.user_id WHERE cu.company_id=? AND u.is_active=1', [companyId]);
    return rows.map((r) => r.email).filter(Boolean);
  }
  const ids = (parsed?.user_ids || []).map(Number).filter(Boolean);
  if (!ids.length) return [];
  const marks = ids.map(() => '?').join(',');
  const rows = await q(`SELECT email FROM users WHERE id IN (${marks})`, ids);
  return rows.map((r) => r.email).filter(Boolean);
}

function toEmailTable(data) {
  const arr = Object.values(data).find((v) => Array.isArray(v) && v.length && typeof v[0] === 'object');
  if (!arr) return '<p>No data available for this period.</p>';
  const headers = Object.keys(arr[0]).filter((k) => typeof arr[0][k] !== 'object' || arr[0][k] === null);
  const th = headers.map((h) => `<th style="text-align:left;padding:6px 10px;border-bottom:2px solid #eee;">${h}</th>`).join('');
  const rows = arr.slice(0, 25).map((row) =>
    `<tr>${headers.map((h) => `<td style="padding:6px 10px;border-bottom:1px solid #f1f1f1;">${row[h] ?? ''}</td>`).join('')}</tr>`
  ).join('');
  return `<table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:13px;"><thead><tr>${th}</tr></thead><tbody>${rows}</tbody></table>`;
}

export async function sendScheduledReport(schedule, report) {
  const data = await fetchReportData(report.data_source, report.company_id);
  const emails = await resolveRecipientEmails(report.company_id, schedule.recipients);
  if (!emails.length) throw new Error('no_recipients_resolved');

  const smtpHost = await getSetting('smtp_host', '', report.company_id);
  if (!smtpHost) throw new Error('smtp_not_configured');
  const smtpPort = await getSetting('smtp_port', '587', report.company_id);
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number(smtpPort),
    secure: smtpPort === '465',
    auth: {
      user: await getSetting('smtp_user', '', report.company_id),
      pass: await getSetting('smtp_pass', '', report.company_id)
    }
  });
  const smtpUser = await getSetting('smtp_user', '', report.company_id);
  const from = await getSetting('smtp_from', smtpUser, report.company_id);
  const fromName = await getSetting('smtp_from_name', 'Dot Domino CRM', report.company_id);

  await transporter.sendMail({
    from: `${fromName} <${from}>`,
    to: emails.join(','),
    subject: `Scheduled Report: ${report.name}`,
    html: `<h2 style="font-family:sans-serif;">${report.name}</h2>${toEmailTable(data)}`
  });
}

export async function processDueReportSchedules() {
  const due = await q(
    `SELECT rs.*, cr.name AS report_name, cr.data_source, cr.company_id
     FROM report_schedules rs JOIN custom_reports cr ON cr.id=rs.report_id
     WHERE rs.status='active' AND rs.next_send_at <= NOW()`
  );
  let sent = 0, failed = 0;
  for (const schedule of due) {
    const next = computeNextSendAt(schedule, new Date());
    try {
      await sendScheduledReport(schedule, { data_source: schedule.data_source, company_id: schedule.company_id, name: schedule.report_name });
      await run('UPDATE report_schedules SET last_sent_at=NOW(), next_send_at=? WHERE id=?', [next, schedule.id]);
      sent += 1;
    } catch (error) {
      console.error(`[report-schedule] send failed for schedule ${schedule.id}:`, error.message);
      await run('UPDATE report_schedules SET next_send_at=? WHERE id=?', [next, schedule.id]);
      failed += 1;
    }
  }
  return { sent, failed };
}
