import { q, scalar } from '../db/pool.js';
import { ok } from '../utils/response.js';

export async function report(req, res) {
  const type = req.params.type || 'index';

  if (type === 'funnel') {
    const [stages, leadFunnel] = await Promise.all([
      q(`SELECT ps.name, ps.color, COUNT(d.id) AS deals, COALESCE(SUM(d.value),0) AS value
         FROM pipeline_stages ps LEFT JOIN deals d ON d.stage_id=ps.id WHERE ps.is_lost=0 GROUP BY ps.id ORDER BY ps.stage_order ASC`),
      q("SELECT status, COUNT(*) AS cnt FROM leads GROUP BY status ORDER BY FIELD(status,'new','contacted','qualified','proposal','negotiation','won','lost')")
    ]);
    const totalLeads = Number(await scalar('SELECT COUNT(*) FROM leads'));
    const totalWon = Number(await scalar("SELECT COUNT(*) FROM leads WHERE status='won'"));
    return ok(res, { stages, leadFunnel, totalLeads, totalWon, convRate: totalLeads > 0 ? Math.round((totalWon / totalLeads) * 1000) / 10 : 0 });
  }

  if (type === 'drip') {
    const [campaigns, channelStats] = await Promise.all([
      q(`SELECT c.name,c.status, COUNT(DISTINCT le.id) AS enrolled, SUM(le.status='active') AS active,
                SUM(le.status='completed') AS completed, SUM(le.status='converted') AS converted,
                SUM(le.status='exited') AS exited, COUNT(DISTINCT cm.id) AS messages_sent,
                SUM(cm.status='opened') AS opens, SUM(cm.status='clicked') AS clicks,
                SUM(cm.channel='whatsapp' AND cm.status='read') AS wa_reads
         FROM campaigns c LEFT JOIN lead_enrollments le ON le.campaign_id=c.id LEFT JOIN communications cm ON cm.enrollment_id=le.id
         GROUP BY c.id ORDER BY c.created_at DESC`),
      q(`SELECT channel, COUNT(*) AS sent, SUM(status IN ('delivered','opened','clicked','read')) AS delivered, SUM(status='failed') AS failed
         FROM communications WHERE sent_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY channel`)
    ]);
    return ok(res, { campaigns, channelStats });
  }

  if (type === 'revenue') {
    const [monthly, bySource, byCampaign, byAgent] = await Promise.all([
      q("SELECT DATE_FORMAT(recorded_at,'%Y-%m') AS month, SUM(amount) AS revenue, COUNT(*) AS deals FROM revenue_records WHERE recorded_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH) GROUP BY month ORDER BY month ASC"),
      q('SELECT ls.name,ls.category,COUNT(r.id) AS deals,COALESCE(SUM(r.amount),0) AS revenue FROM lead_sources ls LEFT JOIN revenue_records r ON r.source_id=ls.id GROUP BY ls.id ORDER BY revenue DESC'),
      q('SELECT c.name,COUNT(r.id) AS deals,COALESCE(SUM(r.amount),0) AS revenue FROM campaigns c LEFT JOIN revenue_records r ON r.campaign_id=c.id GROUP BY c.id ORDER BY revenue DESC LIMIT 10'),
      q("SELECT u.name,COUNT(r.id) AS deals,COALESCE(SUM(r.amount),0) AS revenue FROM users u LEFT JOIN revenue_records r ON r.agent_id=u.id WHERE u.role IN ('agent','manager') GROUP BY u.id ORDER BY revenue DESC")
    ]);
    return ok(res, {
      monthly, bySource, byCampaign, byAgent,
      totalRevenue: Number(await scalar('SELECT COALESCE(SUM(amount),0) FROM revenue_records')),
      ytd: Number(await scalar('SELECT COALESCE(SUM(amount),0) FROM revenue_records WHERE YEAR(recorded_at)=YEAR(NOW())'))
    });
  }

  if (type === 'agents') {
    const [agents, agentTrend] = await Promise.all([
      q(`SELECT u.id,u.name,u.email,u.role, COALESCE(l.leads_assigned,0) AS leads_assigned,
                COALESCE(l.leads_contacted,0) AS leads_contacted, COALESCE(l.conversions,0) AS conversions,
                ROUND(COALESCE(l.conversions,0)/NULLIF(COALESCE(l.leads_assigned,0),0)*100,1) AS conv_rate,
                COALESCE(a.calls,0) AS calls, COALESCE(m.meetings,0) AS meetings,
                COALESCE(t.open_tasks,0) AS open_tasks, COALESCE(r.revenue,0) AS revenue
         FROM users u
         LEFT JOIN (SELECT assigned_to,COUNT(*) AS leads_assigned,SUM(status!='new') AS leads_contacted,SUM(status='won') AS conversions FROM leads GROUP BY assigned_to) l ON l.assigned_to=u.id
         LEFT JOIN (SELECT user_id,COUNT(*) AS calls FROM activities WHERE type='call' AND done=1 GROUP BY user_id) a ON a.user_id=u.id
         LEFT JOIN (SELECT host_id,COUNT(*) AS meetings FROM meetings WHERE status='completed' GROUP BY host_id) m ON m.host_id=u.id
         LEFT JOIN (SELECT assigned_to,COUNT(*) AS open_tasks FROM tasks WHERE done=0 GROUP BY assigned_to) t ON t.assigned_to=u.id
         LEFT JOIN (SELECT agent_id,SUM(amount) AS revenue FROM revenue_records GROUP BY agent_id) r ON r.agent_id=u.id
         WHERE u.role IN ('agent','manager') AND u.is_active=1 ORDER BY conversions DESC`),
      q(`SELECT u.name, DATE_FORMAT(l.created_at,'%Y-%m') AS month, COUNT(*) AS leads
         FROM leads l JOIN users u ON u.id=l.assigned_to
         WHERE l.created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH) AND u.role IN ('agent','manager')
         GROUP BY u.id, month ORDER BY month, u.name`)
    ]);
    return ok(res, { agents, agentTrend });
  }

  ok(res, { sections: ['funnel', 'drip', 'revenue', 'agents'] });
}
