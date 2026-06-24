import { q, one, scalar } from '../db/pool.js';
import { ok } from '../utils/response.js';
import { companiesForUser } from '../services/company.service.js';

export async function index(req, res) {
  const days = 30;
  const pendingTaskCount = Number(await scalar(
    'SELECT COUNT(*) FROM tasks WHERE company_id=? AND done=0 AND (assigned_to=? OR assigned_to IS NULL)',
    [req.companyId, req.user.id]
  ));
  const stats = {
    total_leads: Number(await scalar('SELECT COUNT(*) FROM leads WHERE company_id=?', [req.companyId])),
    new_today: Number(await scalar('SELECT COUNT(*) FROM leads WHERE company_id=? AND DATE(created_at)=CURDATE()', [req.companyId])),
    hot_leads: Number(await scalar("SELECT COUNT(*) FROM leads WHERE company_id=? AND category IN ('hot','sales_ready')", [req.companyId])),
    converted: Number(await scalar("SELECT COUNT(*) FROM leads WHERE company_id=? AND status='won'", [req.companyId])),
    revenue: Number(await scalar('SELECT COALESCE(SUM(r.amount),0) FROM revenue_records r JOIN deals d ON d.id=r.deal_id WHERE d.company_id=? AND YEAR(r.recorded_at)=YEAR(NOW())', [req.companyId])),
    active_campaigns: Number(await scalar("SELECT COUNT(*) FROM campaigns WHERE company_id=? AND status='active'", [req.companyId])),
    pending_tasks: pendingTaskCount,
    active_agents: Number(await scalar("SELECT COUNT(*) FROM company_users cu JOIN users u ON u.id=cu.user_id WHERE cu.company_id=? AND u.role IN ('agent','manager') AND u.is_active=1", [req.companyId]))
  };
  const dripStats = await one(
    `SELECT
       COUNT(DISTINCT CASE WHEN le.status='active' THEN le.id END) AS active_enrollments,
       COUNT(DISTINCT CASE WHEN le.status='converted' THEN le.id END) AS total_converted,
       COUNT(DISTINCT CASE WHEN DATE(cm.sent_at)=CURDATE() THEN cm.id END) AS msgs_today,
       ROUND(SUM(CASE WHEN cm.channel='email' AND cm.status='opened' AND cm.sent_at>=DATE_SUB(NOW(),INTERVAL 7 DAY) THEN 1 ELSE 0 END)
        /NULLIF(SUM(CASE WHEN cm.channel='email' AND cm.sent_at>=DATE_SUB(NOW(),INTERVAL 7 DAY) THEN 1 ELSE 0 END),0)*100,1) AS email_open_rate,
       ROUND(SUM(CASE WHEN cm.channel='whatsapp' AND cm.status='opened' AND cm.sent_at>=DATE_SUB(NOW(),INTERVAL 7 DAY) THEN 1 ELSE 0 END)
        /NULLIF(SUM(CASE WHEN cm.channel='whatsapp' AND cm.sent_at>=DATE_SUB(NOW(),INTERVAL 7 DAY) THEN 1 ELSE 0 END),0)*100,1) AS wa_read_rate,
       COUNT(DISTINCT CASE WHEN DATE(cm.sent_at)=CURDATE() AND cm.status='failed' THEN cm.id END) AS failed_today
     FROM lead_enrollments le JOIN campaigns c ON c.id=le.campaign_id LEFT JOIN communications cm ON cm.enrollment_id=le.id WHERE c.company_id=?`,
    [req.companyId]
  );
  const channelRows = await q(
    `SELECT cm.channel, COUNT(*) AS sent, SUM(cm.status IN ('opened','clicked','read','delivered')) AS delivered, SUM(cm.status='failed') AS failed
     FROM communications cm JOIN leads l ON l.id=cm.lead_id WHERE l.company_id=? AND cm.sent_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY cm.channel`,
    [req.companyId]
  );
  const channelSends = Object.fromEntries(channelRows.map((row) => [row.channel, row]));
  const dailyLeads = await q(
    `SELECT DATE(created_at) AS date, COUNT(*) AS total FROM leads
     WHERE company_id=? AND created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY) GROUP BY DATE(created_at) ORDER BY date ASC`,
    [req.companyId]
  );
  const sourceStats = await q(
    `SELECT ls.name AS source, ls.slug, COUNT(l.id) AS total, SUM(l.status='won') AS won
     FROM leads l LEFT JOIN lead_sources ls ON ls.id=l.source_id WHERE l.company_id=? GROUP BY l.source_id ORDER BY total DESC`,
    [req.companyId]
  );
  const categoryStats = await q('SELECT category, COUNT(*) AS total FROM leads WHERE company_id=? GROUP BY category', [req.companyId]);
  const funnelStats = await q(
    `SELECT ps.name AS stage, COUNT(d.id) AS total FROM pipeline_stages ps
     LEFT JOIN deals d ON d.stage_id=ps.id AND d.company_id=? WHERE ps.is_lost=0
     GROUP BY ps.id, ps.name ORDER BY ps.stage_order ASC`, [req.companyId]
  );
  const recentLeads = await q(
    `SELECT l.*, ls.name AS source_name FROM leads l LEFT JOIN lead_sources ls ON ls.id=l.source_id WHERE l.company_id=? ORDER BY l.created_at DESC LIMIT 10`, [req.companyId]
  );
  const pendingTasks = await q(
    `SELECT t.*, l.name AS lead_name FROM tasks t LEFT JOIN leads l ON l.id=t.lead_id
     WHERE t.company_id=? AND t.done=0 AND t.assigned_to=? ORDER BY t.due_at ASC LIMIT 8`,
    [req.companyId, req.user.id]
  );
  ok(res, { stats, dripStats, channelSends, dailyLeads, sourceStats, categoryStats, funnelStats, recentLeads, pendingTasks });
}

export async function dailyStats(req, res) {
  const days = Math.max(1, Math.min(365, Number(req.query.days || 30)));
  const data = await q(
    `SELECT DATE(created_at) AS date, COUNT(*) AS total FROM leads
     WHERE company_id=? AND created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)
     GROUP BY DATE(created_at) ORDER BY date ASC`, [req.companyId]
  );
  ok(res, { rows: data });
}

export async function master(req, res) {
  const companies = await companiesForUser(req.user);
  const ids = companies.map((company) => Number(company.id)).filter(Boolean);
  if (!ids.length) return ok(res, { stats: {}, companies: [], dailyLeads: [] });
  const marks = ids.map(() => '?').join(',');
  const [stats, companyRows, dailyLeads] = await Promise.all([
    one(
      `SELECT COUNT(*) AS total_leads, SUM(DATE(created_at)=CURDATE()) AS new_today,
              SUM(status='won') AS converted, SUM(category IN ('hot','sales_ready')) AS hot_leads
       FROM leads WHERE company_id IN (${marks})`, ids
    ),
    q(
      `SELECT c.id,c.name,c.slug,
              (SELECT COUNT(*) FROM leads l WHERE l.company_id=c.id) AS total_leads,
              (SELECT COUNT(*) FROM leads l WHERE l.company_id=c.id AND l.status='won') AS converted,
              (SELECT COUNT(*) FROM communications cm JOIN leads l ON l.id=cm.lead_id WHERE l.company_id=c.id) AS messages_sent,
              (SELECT COUNT(*) FROM communications cm JOIN leads l ON l.id=cm.lead_id WHERE l.company_id=c.id AND cm.status IN ('delivered','opened','clicked','replied')) AS engaged,
              (SELECT COALESCE(SUM(r.amount),0) FROM revenue_records r JOIN deals d ON d.id=r.deal_id WHERE d.company_id=c.id) AS revenue
       FROM companies c
       WHERE c.id IN (${marks})
       ORDER BY total_leads DESC, c.name`, ids
    ),
    q(
      `SELECT DATE(created_at) AS date, COUNT(*) AS total FROM leads
       WHERE company_id IN (${marks}) AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(created_at) ORDER BY date`, ids
    )
  ]);
  const revenue = Number(await scalar(
    `SELECT COALESCE(SUM(r.amount),0) FROM revenue_records r JOIN deals d ON d.id=r.deal_id WHERE d.company_id IN (${marks})`, ids
  ));
  ok(res, { stats: { ...stats, revenue, company_count: ids.length }, companies: companyRows, dailyLeads });
}
