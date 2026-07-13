import { q, one, scalar } from '../db/pool.js';
import { companySettings } from './settings.service.js';

const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const pct = (part, total) => (Number(total) > 0 ? round1((Number(part) / Number(total)) * 100) : null);
const healthTag = (isLast, conv) => {
  if (isLast) return 'Monitor';
  if (conv == null) return '—';
  if (conv >= 70) return 'Strong';
  if (conv >= 50) return 'Good';
  if (conv >= 40) return 'Fair';
  return 'Bottleneck';
};

export async function pipelineSnapshot(companyId) {
  const [totalNow, totalPrev, activeNow, activePrev, stageRows, entryRows] = await Promise.all([
    scalar('SELECT COUNT(*) FROM leads WHERE company_id=?', [companyId]),
    scalar('SELECT COUNT(*) FROM leads WHERE company_id=? AND created_at <= DATE_SUB(NOW(), INTERVAL 30 DAY)', [companyId]),
    scalar("SELECT COUNT(*) FROM leads WHERE company_id=? AND status NOT IN ('new','lost','unsubscribed','invalid')", [companyId]),
    scalar("SELECT COUNT(*) FROM leads WHERE company_id=? AND status NOT IN ('new','lost','unsubscribed','invalid') AND created_at <= DATE_SUB(NOW(), INTERVAL 30 DAY)", [companyId]),
    q(`SELECT ps.id, ps.name, ps.stage_order, ps.is_won, COUNT(DISTINCT d.id) AS cnt, COALESCE(SUM(d.value),0) AS value
       FROM pipeline_stages ps LEFT JOIN deals d ON d.stage_id=ps.id AND d.company_id=?
       WHERE ps.is_active=1 AND ps.is_lost=0 GROUP BY ps.id ORDER BY ps.stage_order ASC`, [companyId]),
    q(`SELECT dsh.to_stage AS stage_id,
         SUM(dsh.changed_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS entries_now,
         SUM(dsh.changed_at < DATE_SUB(NOW(), INTERVAL 30 DAY) AND dsh.changed_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)) AS entries_prev
       FROM deal_stage_history dsh JOIN deals d ON d.id=dsh.deal_id AND d.company_id=?
       GROUP BY dsh.to_stage`, [companyId])
  ]);

  const entriesByStage = Object.fromEntries(entryRows.map((r) => [Number(r.stage_id), r]));
  const trendPct = (nowV, prevV) => (Number(prevV) > 0 ? round1(((Number(nowV) - Number(prevV)) / Number(prevV)) * 100) : null);

  const rows = [
    { stage: 'Total Leads', count: Number(totalNow), vsLastMonthPct: trendPct(totalNow, totalPrev) },
    { stage: 'Active', count: Number(activeNow), vsLastMonthPct: trendPct(activeNow, activePrev) },
    ...stageRows.map((s) => {
      const e = entriesByStage[Number(s.id)];
      return {
        stage: s.name,
        count: Number(s.cnt),
        value: Number(s.value),
        isWon: Boolean(s.is_won),
        vsLastMonthPct: e ? trendPct(e.entries_now, e.entries_prev) : null
      };
    })
  ];

  let prevCount = null;
  return rows.map((row, i) => {
    const conv = prevCount != null ? pct(row.count, prevCount) : null;
    prevCount = row.count;
    return { ...row, conversionPct: conv, health: healthTag(i === rows.length - 1, conv) };
  });
}

export async function businessHealth(companyId) {
  const [leadsThisMonth, leadsLastMonth, goalsResult, taskTotal, taskDone, totalLeads, totalWon] = await Promise.all([
    scalar("SELECT COUNT(*) FROM leads WHERE company_id=? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)", [companyId]),
    scalar("SELECT COUNT(*) FROM leads WHERE company_id=? AND created_at < DATE_SUB(NOW(), INTERVAL 30 DAY) AND created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)", [companyId]),
    companySettings(companyId, ['goals']),
    scalar("SELECT COUNT(*) FROM tasks WHERE company_id=? AND due_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND due_at <= NOW()", [companyId]),
    scalar("SELECT COUNT(*) FROM tasks WHERE company_id=? AND due_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) AND due_at <= NOW() AND done=1", [companyId]),
    scalar('SELECT COUNT(*) FROM leads WHERE company_id=?', [companyId]),
    scalar("SELECT COUNT(*) FROM leads WHERE company_id=? AND status='won'", [companyId])
  ]);

  const leadGoal = Number(goalsResult.values.goal_monthly_leads || 0);
  const leadTarget = leadGoal > 0 ? leadGoal : Math.max(Number(leadsLastMonth), 1);
  const leadMagnet = Math.max(0, Math.min(10, round1((Number(leadsThisMonth) / leadTarget) * 10)));

  const management = Number(taskTotal) > 0 ? Math.max(0, Math.min(10, round1((Number(taskDone) / Number(taskTotal)) * 10))) : 10;

  const industryBenchmark = 2.1;
  const closeRate = pct(totalWon, totalLeads) ?? 0;
  const conversion = Math.max(0, Math.min(10, round1((closeRate / industryBenchmark) * 5)));

  const overall = Math.round((leadMagnet + management + conversion) / 3);
  return { score: overall, subScores: { leadMagnet, management, conversion }, closeRate, industryBenchmark };
}

export async function actionRequired(companyId) {
  const rows = await q(
    `SELECT d.id, d.title, d.value, l.id AS lead_id, l.name AS lead_name, l.company AS lead_company,
            ps.name AS stage_name,
            GREATEST(d.updated_at, COALESCE(la.last_activity,'1970-01-01'), COALESCE(lh.last_stage_change,'1970-01-01')) AS last_touch,
            nm.scheduled_at AS next_meeting
     FROM deals d
     JOIN leads l ON l.id=d.lead_id
     JOIN pipeline_stages ps ON ps.id=d.stage_id
     LEFT JOIN (SELECT deal_id, MAX(created_at) AS last_activity FROM activities WHERE deal_id IS NOT NULL GROUP BY deal_id) la ON la.deal_id=d.id
     LEFT JOIN (SELECT deal_id, MAX(changed_at) AS last_stage_change FROM deal_stage_history GROUP BY deal_id) lh ON lh.deal_id=d.id
     LEFT JOIN (SELECT deal_id, MIN(scheduled_at) AS scheduled_at FROM meetings WHERE status='scheduled' AND scheduled_at > NOW() AND deal_id IS NOT NULL GROUP BY deal_id) nm ON nm.deal_id=d.id
     WHERE d.company_id=? AND ps.is_won=0 AND ps.is_lost=0
     ORDER BY last_touch ASC
     LIMIT 50`,
    [companyId]
  );

  const now = Date.now();
  const items = rows.map((r) => {
    const daysStalled = Math.max(0, Math.floor((now - new Date(r.last_touch).getTime()) / 86400000));
    const hasUpcomingMeeting = Boolean(r.next_meeting);
    let badge = 'Pending';
    if (hasUpcomingMeeting) badge = 'On Track';
    else if (daysStalled > 7) badge = 'Stalled';
    else if (daysStalled >= 3) badge = 'Waiting';

    const reason = hasUpcomingMeeting
      ? `${r.stage_name} · meeting scheduled`
      : `${r.stage_name} · ${daysStalled}d no follow-up`;

    return {
      id: r.id,
      name: r.lead_company || r.lead_name,
      contact: r.lead_name,
      value: Number(r.value),
      stage: r.stage_name,
      reason,
      badge,
      daysStalled,
      nextMeeting: r.next_meeting
    };
  });

  const needingAction = items.filter((i) => i.badge !== 'On Track');
  return {
    items,
    count: needingAction.length,
    atRiskValue: needingAction.reduce((sum, i) => sum + i.value, 0)
  };
}

export async function leadSourceTrends(companyId) {
  const rows = await q(
    `SELECT ls.name, COUNT(l.id) AS total,
        SUM(l.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS this_month,
        SUM(l.created_at < DATE_SUB(NOW(), INTERVAL 30 DAY) AND l.created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY)) AS last_month,
        SUM(l.status='won') AS won
     FROM leads l LEFT JOIN lead_sources ls ON ls.id=l.source_id
     WHERE l.company_id=? GROUP BY l.source_id ORDER BY total DESC`,
    [companyId]
  );

  const withRates = rows.map((r) => ({
    name: r.name || 'Direct',
    total: Number(r.total),
    trendPct: Number(r.last_month) > 0 ? round1(((Number(r.this_month) - Number(r.last_month)) / Number(r.last_month)) * 100) : null,
    conversionRate: pct(r.won, r.total)
  }));

  const avgConv = withRates.length
    ? withRates.reduce((s, r) => s + (r.conversionRate || 0), 0) / withRates.length
    : 0;
  const best = withRates
    .filter((r) => r.total >= 5 && r.conversionRate != null && avgConv > 0)
    .sort((a, b) => b.conversionRate - a.conversionRate)[0];

  const insight = best && best.conversionRate > avgConv
    ? `${best.name} converts ${round1(best.conversionRate / avgConv)}x better — scale this channel first.`
    : null;

  return { sources: withRates, insight };
}

export async function monthlyGoals(companyId) {
  const { values } = await companySettings(companyId, ['goals']);
  const [revenueActual, dealsActual, leadsActual, demosActual] = await Promise.all([
    scalar('SELECT COALESCE(SUM(r.amount),0) FROM revenue_records r JOIN deals d ON d.id=r.deal_id WHERE d.company_id=? AND r.recorded_at >= DATE_FORMAT(NOW(),"%Y-%m-01")', [companyId]),
    scalar("SELECT COUNT(*) FROM deals WHERE company_id=? AND won_at >= DATE_FORMAT(NOW(),'%Y-%m-01')", [companyId]),
    scalar("SELECT COUNT(*) FROM leads WHERE company_id=? AND created_at >= DATE_FORMAT(NOW(),'%Y-%m-01')", [companyId]),
    scalar(`SELECT COUNT(*) FROM meetings m JOIN leads l ON l.id=m.lead_id WHERE l.company_id=? AND m.scheduled_at >= DATE_FORMAT(NOW(),'%Y-%m-01') AND m.scheduled_at < DATE_ADD(DATE_FORMAT(NOW(),'%Y-%m-01'), INTERVAL 1 MONTH)`, [companyId])
  ]);

  const dayOfMonth = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();

  const goal = (actual, targetRaw) => {
    const target = Number(targetRaw || 0);
    if (!target) return { actual: Number(actual), target: null, pct: null };
    return { actual: Number(actual), target, pct: Math.min(100, round1((Number(actual) / target) * 100)) };
  };

  const revenue = goal(revenueActual, values.goal_monthly_revenue);
  let pace = null;
  if (revenue.target) {
    const projected = (Number(revenueActual) / dayOfMonth) * daysInMonth;
    const shortfall = revenue.target - projected;
    pace = shortfall > 0
      ? `On pace for ~₹${Math.round(projected).toLocaleString('en-IN')} — ₹${Math.round(shortfall).toLocaleString('en-IN')} short of target.`
      : `On pace to beat target by ~₹${Math.round(Math.abs(shortfall)).toLocaleString('en-IN')}.`;
  }

  return {
    revenue,
    deals: goal(dealsActual, values.goal_monthly_deals),
    leads: goal(leadsActual, values.goal_monthly_leads),
    demos: goal(demosActual, values.goal_monthly_demos),
    pace
  };
}

export async function dripSequences(companyId) {
  const campaigns = await q(
    `SELECT c.id, c.name, c.status, COUNT(DISTINCT le.id) AS enrolled, SUM(le.status='converted') AS converted
     FROM campaigns c LEFT JOIN lead_enrollments le ON le.campaign_id=c.id
     WHERE c.company_id=? AND c.status='active' GROUP BY c.id ORDER BY c.created_at DESC`,
    [companyId]
  );
  if (!campaigns.length) return { campaigns: [], totals: { enrolled: 0, avgOpenRate: 0, avgClickRate: 0, converted: 0 } };

  const ids = campaigns.map((c) => c.id);
  const marks = ids.map(() => '?').join(',');

  const [overallRows, stepRows] = await Promise.all([
    q(`SELECT le.campaign_id, COUNT(cm.id) AS sent,
              SUM(cm.status IN ('opened','clicked','replied')) AS opened,
              SUM(cm.status='clicked') AS clicked
       FROM communications cm JOIN lead_enrollments le ON le.id=cm.enrollment_id
       WHERE le.campaign_id IN (${marks}) GROUP BY le.campaign_id`, ids),
    q(`SELECT le.campaign_id, ws.step_order, COUNT(cm.id) AS sent, SUM(cm.status IN ('opened','clicked','replied')) AS opened
       FROM communications cm
       JOIN lead_enrollments le ON le.id=cm.enrollment_id
       JOIN workflow_steps ws ON ws.id=cm.step_id
       WHERE le.campaign_id IN (${marks}) GROUP BY le.campaign_id, ws.step_order ORDER BY le.campaign_id, ws.step_order`, ids)
  ]);

  const overallByCampaign = Object.fromEntries(overallRows.map((r) => [Number(r.campaign_id), r]));
  const stepsByCampaign = {};
  for (const r of stepRows) {
    const cid = Number(r.campaign_id);
    (stepsByCampaign[cid] ||= []).push({ order: r.step_order, openRate: pct(r.opened, r.sent) ?? 0 });
  }

  const sequences = campaigns.map((c) => {
    const o = overallByCampaign[c.id] || { sent: 0, opened: 0, clicked: 0 };
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      enrolled: Number(c.enrolled),
      converted: Number(c.converted),
      openRate: pct(o.opened, o.sent) ?? 0,
      clickRate: pct(o.clicked, o.sent) ?? 0,
      steps: (stepsByCampaign[c.id] || []).map((s) => ({ label: `Email ${s.order + 1}`, openRate: s.openRate }))
    };
  });

  const withEnrolled = sequences.filter((s) => s.enrolled > 0);
  const best = withEnrolled.length ? withEnrolled.reduce((a, b) => (b.openRate > a.openRate ? b : a)) : null;
  const worst = withEnrolled.length ? withEnrolled.reduce((a, b) => (b.openRate < a.openRate ? b : a)) : null;
  for (const s of sequences) {
    s.insight = best && s.id === best.id
      ? 'Highest open & click rates — best performing sequence.'
      : worst && s.id === worst.id && worst.openRate < 30
        ? 'Lowest conversion — consider A/B testing subject lines.'
        : null;
  }

  const totalEnrolled = sequences.reduce((s, c) => s + c.enrolled, 0);
  const totalConverted = sequences.reduce((s, c) => s + c.converted, 0);
  const totalSent = overallRows.reduce((s, r) => s + Number(r.sent), 0);
  const totalOpened = overallRows.reduce((s, r) => s + Number(r.opened), 0);
  const totalClicked = overallRows.reduce((s, r) => s + Number(r.clicked), 0);

  return {
    campaigns: sequences,
    totals: {
      enrolled: totalEnrolled,
      converted: totalConverted,
      avgOpenRate: pct(totalOpened, totalSent) ?? 0,
      avgClickRate: pct(totalClicked, totalSent) ?? 0
    }
  };
}

export async function liveActivity(companyId) {
  const rows = await q(
    `SELECT * FROM (
        (SELECT 'lead_created' AS type, l.name AS subject, ls.name AS extra, l.created_at AS ts
         FROM leads l LEFT JOIN lead_sources ls ON ls.id=l.source_id
         WHERE l.company_id=? ORDER BY l.created_at DESC LIMIT 6)
        UNION ALL
        (SELECT IF(d.won_at IS NOT NULL,'deal_won','deal_lost') AS type, l.name AS subject, d.title AS extra,
                COALESCE(d.won_at, d.lost_at) AS ts
         FROM deals d JOIN leads l ON l.id=d.lead_id
         WHERE d.company_id=? AND (d.won_at IS NOT NULL OR d.lost_at IS NOT NULL) ORDER BY ts DESC LIMIT 6)
        UNION ALL
        (SELECT 'meeting_scheduled' AS type, l.name AS subject, m.title AS extra, m.created_at AS ts
         FROM meetings m JOIN leads l ON l.id=m.lead_id
         WHERE l.company_id=? ORDER BY m.created_at DESC LIMIT 6)
     ) feed
     ORDER BY ts DESC LIMIT 10`,
    [companyId, companyId, companyId]
  );

  const meta = {
    lead_created: { icon: 'person-plus-fill', color: 'indigo', text: (r) => `${r.subject} added via ${r.extra || 'form'}` },
    deal_won: { icon: 'check2-circle', color: 'green', text: (r) => `${r.subject} marked as Won` },
    deal_lost: { icon: 'x-circle', color: 'muted', text: (r) => `${r.subject} marked as Lost` },
    meeting_scheduled: { icon: 'calendar-check', color: 'sky', text: (r) => `${r.subject} demo scheduled` }
  };

  return rows.map((r) => {
    const m = meta[r.type] || { icon: 'dot', color: 'muted', text: () => r.subject };
    return { type: r.type, icon: m.icon, color: m.color, text: m.text(r), time: r.ts };
  });
}
